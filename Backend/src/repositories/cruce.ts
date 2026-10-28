// Acceso a la base del motor de cruce (única capa que usa Prisma). Lee solo lo necesario: nunca devuelve la
// descripción de un movimiento fuera del motor, y los archivos retirados de la carpeta no cuentan en ningún caso.
import { prisma } from "../db.js";
import { normalizarNombrePersona } from "../domain/usuarios.js";
import type { CuentaCorte } from "../domain/cobertura-corte.js";
import type { MovimientoCruce, ObligacionCruce, ResultadoCruce, VencimientoCruce } from "../domain/cruce.js";

export interface VencimientoGuardado extends VencimientoCruce {
  estado: string;
  movimientoId: number | null;
  motivo: string | null;
  diferenciaDias: number | null;
  sinInfoHasta: Date | null;
  cuentaEsperadaId: number | null;
}

export interface DatosCruce {
  obligaciones: ObligacionCruce[];
  vencimientos: VencimientoGuardado[];
  movimientos: MovimientoCruce[];
  cuentas: Map<number, CuentaCorte[]>;
}

/** El «Del» que el encabezado del archivo declara (guardado por el lector); null si el formato no lo declara. */
function delDeclarado(detalle: string | null): Date | null {
  if (!detalle) return null;
  try {
    const del = (JSON.parse(detalle) as { periodoDeclarado?: { del?: string | null } | null }).periodoDeclarado?.del;
    return typeof del === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(del) ? new Date(`${del}T00:00:00.000Z`) : null;
  } catch {
    return null;
  }
}

/** El lector guardó que el saldo de este archivo no cuadra (en el detalle JSON del archivo). */
function noCuadra(detalle: string | null): boolean {
  if (!detalle) return false;
  try {
    return (JSON.parse(detalle) as { continuidad?: { estado?: string } }).continuidad?.estado === "no_cuadra";
  } catch {
    return false;
  }
}

/** Cuentas conocidas por sociedad con los meses que tienen archivo leído (no retirado) y su última fecha con movimientos. */
export async function cargarCoberturaCuentas(): Promise<Map<number, CuentaCorte[]>> {
  const [archivos, ultimas, primeras] = await Promise.all([
    prisma.archivoImportado.findMany({
      where: { estado: "leido", retiradoEn: null, cuentaId: { not: null }, mes: { not: null } },
      select: { cuentaId: true, mes: true, detalle: true, cuenta: { select: { sociedadId: true } } },
    }),
    prisma.movimiento.groupBy({ by: ["cuentaId", "periodo"], where: { archivo: { retiradoEn: null } }, _max: { fecha: true } }),
    primerasFechasPorCuenta(),
  ]);
  const ultima = new Map(ultimas.map((u) => [`${u.cuentaId}|${u.periodo}`, u._max.fecha]));
  const porCuenta = new Map<number, { sociedadId: number; corte: CuentaCorte }>();
  const primerArchivo = new Map<number, { mes: string; del: Date }>();
  for (const a of archivos) {
    const cuentaId = a.cuentaId!;
    const c: { sociedadId: number; corte: CuentaCorte } = porCuenta.get(cuentaId) ?? { sociedadId: a.cuenta!.sociedadId, corte: { cuentaId, meses: new Map(), primeraFecha: primeras.get(cuentaId) ?? null } };
    if (noCuadra(a.detalle)) c.corte.mesesNoCuadran = (c.corte.mesesNoCuadran ?? new Set()).add(a.mes!);
    else {
      c.corte.meses.set(a.mes!, ultima.get(`${cuentaId}|${a.mes}`) ?? null);
      // la cobertura de la cuenta empieza en el «Del» que declara su primer archivo leído (que cuadre) o, si no lo declara, el día 1 de su mes
      const previo = primerArchivo.get(cuentaId);
      if (previo === undefined || a.mes! < previo.mes) primerArchivo.set(cuentaId, { mes: a.mes!, del: delDeclarado(a.detalle) ?? new Date(`${a.mes}-01T00:00:00.000Z`) });
    }
    porCuenta.set(cuentaId, c);
  }
  for (const [cuentaId, p] of primerArchivo) porCuenta.get(cuentaId)!.corte.inicioCobertura = p.del;
  const cuentas = new Map<number, CuentaCorte[]>();
  for (const { sociedadId, corte } of porCuenta.values()) cuentas.set(sociedadId, [...(cuentas.get(sociedadId) ?? []), corte]);
  return cuentas;
}

/** Cuántas cuentas hay por moneda tal como la guardó el lector (CRC, USD o null = sin dato). */
export async function contarCuentasPorMoneda(): Promise<Record<string, number>> {
  const g = await prisma.cuenta.groupBy({ by: ["moneda"], _count: { _all: true } });
  return Object.fromEntries(g.map((x) => [x.moneda ?? "sin dato", x._count._all]));
}

/** Obligaciones activas con sus vencimientos, los débitos de archivos vigentes y la cobertura de cada cuenta. */
export async function cargarDatosCruce(): Promise<DatosCruce> {
  const [obligaciones, vencimientos, movimientos, cuentas] = await Promise.all([
    prisma.obligacion.findMany({ where: { activa: true }, select: { id: true, sociedadId: true, proveedor: true, identificador: true } }),
    prisma.vencimiento.findMany({
      where: { obligacion: { activa: true } },
      select: { id: true, obligacionId: true, sociedadId: true, fecha: true, periodo: true, estado: true, movimientoId: true, motivo: true, diferenciaDias: true, sinInfoHasta: true, cuentaEsperadaId: true },
    }),
    prisma.movimiento.findMany({
      where: { debito: { gt: 0n }, archivo: { retiradoEn: null } },
      select: { id: true, fecha: true, descripcion: true, cuenta: { select: { sociedadId: true } } },
    }),
    cargarCoberturaCuentas(),
  ]);

  return {
    obligaciones,
    vencimientos,
    movimientos: movimientos.map((m) => ({ id: m.id, sociedadId: m.cuenta.sociedadId, fecha: m.fecha, descripcion: m.descripcion })),
    cuentas,
  };
}

const mismaFecha = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Guarda solo los resultados que cambian (idempotente). Devuelve cuántos vencimientos cambiaron. */
export async function guardarResultadosCruce(actuales: VencimientoGuardado[], resultados: ResultadoCruce[]): Promise<number> {
  const previo = new Map(actuales.map((v) => [v.id, v]));
  const cambios = resultados.filter((r) => {
    const v = previo.get(r.vencimientoId)!;
    return v.estado !== r.estado || v.movimientoId !== r.movimientoId || v.motivo !== r.motivo || v.diferenciaDias !== r.diferenciaDias || !mismaFecha(v.sinInfoHasta, r.sinInfoHasta);
  });
  for (let i = 0; i < cambios.length; i += 200) {
    await prisma.$transaction(
      cambios.slice(i, i + 200).map((r) =>
        prisma.vencimiento.update({
          where: { id: r.vencimientoId },
          data: { estado: r.estado, movimientoId: r.movimientoId, motivo: r.motivo, diferenciaDias: r.diferenciaDias, sinInfoHasta: r.sinInfoHasta },
        }),
      ),
    );
  }
  return cambios.length;
}

/** Para el diagnóstico: descripciones (en mayúsculas) de TODOS los movimientos vigentes de cada sociedad, débitos y créditos. Nunca salen del proceso. */
export async function cargarDescripcionesPorSociedad(): Promise<Map<number, string[]>> {
  const filas = await prisma.movimiento.findMany({
    where: { archivo: { retiradoEn: null }, descripcion: { not: null } },
    select: { descripcion: true, cuenta: { select: { sociedadId: true } } },
  });
  const m = new Map<number, string[]>();
  for (const f of filas) {
    const lista = m.get(f.cuenta.sociedadId);
    if (lista) lista.push(f.descripcion!.toUpperCase());
    else m.set(f.cuenta.sociedadId, [f.descripcion!.toUpperCase()]);
  }
  return m;
}

/** Para el diagnóstico: primera fecha con movimientos de cada cuenta (archivos no retirados). */
export async function primerasFechasPorCuenta(): Promise<Map<number, Date>> {
  const g = await prisma.movimiento.groupBy({ by: ["cuentaId"], where: { archivo: { retiradoEn: null } }, _min: { fecha: true } });
  return new Map(g.flatMap((x) => (x._min.fecha ? [[x.cuentaId, x._min.fecha] as [number, Date]] : [])));
}

/** Para el diagnóstico de grupos: fecha, descripción y tipo (débito o crédito) de los movimientos vigentes de todas las sociedades. */
export async function movimientosParaGrupos() {
  const filas = await prisma.movimiento.findMany({
    where: { archivo: { retiradoEn: null } },
    select: { fecha: true, descripcion: true, debito: true, cuenta: { select: { sociedadId: true } } },
  });
  return filas.map((f) => ({ sociedadId: f.cuenta.sociedadId, fecha: f.fecha, descripcion: f.descripcion, esDebito: f.debito > 0n }));
}

export interface PreferenciasPorObligacion { aviso: Map<number, number>; espera: Map<number, number> }

/**
 * Aviso y espera propios del responsable efectivo de cada obligación activa (el responsable de la obligación o, si falta, el
 * tesorero de su sociedad). Solo entran quienes tienen el suyo: sin entrada se usa el valor general.
 */
export async function preferenciasPorObligacion(): Promise<PreferenciasPorObligacion> {
  const [obligaciones, usuarios] = await Promise.all([
    prisma.obligacion.findMany({ where: { activa: true }, select: { id: true, responsable: true, sociedad: { select: { tesorero: { select: { diasAviso: true, diasEspera: true } } } } } }),
    prisma.usuario.findMany({ where: { activo: true }, select: { nombreNormalizado: true, diasAviso: true, diasEspera: true } }),
  ]);
  const porNombre = new Map(usuarios.map((u) => [u.nombreNormalizado, u]));
  const r: PreferenciasPorObligacion = { aviso: new Map(), espera: new Map() };
  for (const o of obligaciones) {
    const dueno = o.responsable ? porNombre.get(normalizarNombrePersona(o.responsable)) : o.sociedad.tesorero;
    if (dueno?.diasAviso != null) r.aviso.set(o.id, dueno.diasAviso);
    if (dueno?.diasEspera != null) r.espera.set(o.id, dueno.diasEspera);
  }
  return r;
}

/** Para el diagnóstico: nombre de la categoría de cada obligación activa. */
export async function categoriasPorObligacion(): Promise<Map<number, string>> {
  const filas = await prisma.obligacion.findMany({ where: { activa: true }, select: { id: true, categoria: { select: { nombre: true } } } });
  return new Map(filas.map((f) => [f.id, f.categoria.nombre]));
}

export interface DebitoParaFormato {
  sociedadId: number;
  fecha: Date;
  formato: string | null;
  codigoBanco: string | null;
  tieneIdExtraido: boolean;
  descripcion: string | null;
  referencia: string | null;
  codigo: string | null;
}

/** Para el diagnóstico por banco y formato: los textos de cada débito vigente. Nunca salen del proceso. */
export async function debitosParaFormato(): Promise<DebitoParaFormato[]> {
  const filas = await prisma.movimiento.findMany({
    where: { debito: { gt: 0n }, archivo: { retiradoEn: null } },
    select: { fecha: true, descripcion: true, referencia: true, codigo: true, idExtraido: true, cuenta: { select: { sociedadId: true, formato: true, codigoBanco: true } } },
  });
  return filas.map((f) => ({
    sociedadId: f.cuenta.sociedadId, fecha: f.fecha, formato: f.cuenta.formato, codigoBanco: f.cuenta.codigoBanco, tieneIdExtraido: f.idExtraido !== null,
    descripcion: f.descripcion, referencia: f.referencia, codigo: f.codigo,
  }));
}

export interface CreditoParaDiagnostico { sociedadId: number; formato: string | null; fecha: Date; descripcion: string }

/** Para el diagnóstico: créditos vigentes con descripción (en mayúsculas), sociedad, formato y fecha. Nunca salen del proceso. */
export async function creditosParaDiagnostico(): Promise<CreditoParaDiagnostico[]> {
  const filas = await prisma.movimiento.findMany({
    where: { credito: { gt: 0n }, archivo: { retiradoEn: null }, descripcion: { not: null } },
    select: { descripcion: true, fecha: true, cuenta: { select: { sociedadId: true, formato: true } } },
  });
  return filas.map((f) => ({ sociedadId: f.cuenta.sociedadId, formato: f.cuenta.formato, fecha: f.fecha, descripcion: f.descripcion!.toUpperCase() }));
}

/** Para «Movimientos sin obligación»: solo débitos del banco 0107 (formato E1) cuya descripción puede traer «Pago:». Nunca créditos. */
export async function debitosConPagoDelBanco() {
  return prisma.movimiento.findMany({
    where: {
      debito: { gt: 0n },
      archivo: { retiradoEn: null },
      descripcion: { contains: "pago" },
      cuenta: { OR: [{ formato: "E1" }, { codigoBanco: "0107" }] },
    },
    select: { fecha: true, descripcion: true, cuenta: { select: { numero: true, sociedad: { select: { codigo: true, nombreLargo: true } } } } },
  });
}

/** Identificadores de todas las obligaciones del catálogo (activas o no): un servicio desactivado sigue siendo del catálogo. */
export async function identificadoresDelCatalogo(): Promise<string[]> {
  return (await prisma.obligacion.findMany({ select: { identificador: true } })).map((o) => o.identificador);
}
