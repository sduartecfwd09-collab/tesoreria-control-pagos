import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { claveNombre, estadoEsActiva, type FilaCatalogo } from "../catalogo/lector.js";
import { codigoPorAlias } from "../config/alias-sociedades.js";
import { primerDiaDelPeriodo } from "../domain/control-desde.js";
import { identificadorClave, MOTIVO_IDENTIFICADOR_DUPLICADO } from "../domain/identificadores.js";
import { resolutorDeSociedades } from "../domain/sociedades.js";

export const MOTIVO_ESTADO_DESCONOCIDO = "El estado de la fila no es «ACTIVA»: no se cargó, una persona decide";
export const MOTIVO_SOCIEDAD_SIN_COINCIDENCIA = "La sociedad no coincide con ninguna sociedad existente";

const incluir = { sociedad: true, categoria: true, cuentaEsperada: true } as const;
export type ObligacionCompleta = Prisma.ObligacionGetPayload<{ include: typeof incluir }>;

const claveObligacion = (sociedadId: number, proveedor: string, identificador: string) =>
  `${sociedadId}|${claveNombre(proveedor)}|${identificadorClave(identificador)}`;

export interface ResultadoSincronizacion {
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  /** obligaciones del catálogo que ya no están en el archivo (no se desactivan solas) */
  noEnArchivo: number;
  /** filas que no se cargaron o que piden decisión: quedan en la lista de revisión */
  enRevision: number;
  /** filas cargadas cuyo identificador ya existe en otra obligación: quedan marcadas en la lista de revisión */
  identificadoresDuplicados: number;
}

/**
 * Sincroniza las filas leídas del catálogo en una sola transacción. Idempotente:
 * - nunca crea sociedades: solo asigna a las existentes; la fila que no coincide queda en la lista de revisión con su motivo;
 * - la columna ESTADO es opcional: sin ella todas son activas; con ella, «ACTIVA» es activa y cualquier otro valor va a revisión
 *   (no se carga ni se asume);
 * - crea la obligación si no existe (sociedad + proveedor normalizado + identificador);
 * - si existe y es del catálogo, solo actualiza lo que viene del archivo: categoría, forma del nombre y
 *   el día (si Tesorería no lo editó a mano y el archivo trae un día válido);
 * - nunca toca frecuencia, monto, moneda, cuenta, responsable ni activa, ni las obligaciones manuales.
 */
export async function sincronizarCatalogo(filas: FilaCatalogo[], frecuenciaDefecto: string): Promise<ResultadoSincronizacion> {
  return prisma.$transaction(async (tx) => {
    const resolver = resolutorDeSociedades(await tx.sociedad.findMany({ select: { id: true, codigo: true, nombreLargo: true } }), codigoPorAlias);
    const sociedades = new Map<string, number | null>();
    for (const texto of new Set(filas.map((f) => f.sociedad))) sociedades.set(texto, resolver(texto));
    await tx.catalogoRevision.deleteMany();
    const revision: Prisma.CatalogoRevisionCreateManyInput[] = [];
    const aRevision = (f: FilaCatalogo, tipo: string, motivo: string, obligacionId: number | null = null) =>
      revision.push({ fila: f.fila, tipo, motivo, sociedadTexto: f.sociedad, categoria: f.categoria, proveedor: f.proveedor, identificador: f.identificador, dia: f.dia, obligacionId });
    const categorias = new Map((await tx.categoria.findMany()).map((c) => [claveNombre(c.nombre), c.id]));
    for (const nombre of new Set(filas.filter((f) => sociedades.get(f.sociedad) != null && (f.estado === null || estadoEsActiva(f.estado))).map((f) => f.categoria))) {
      if (!categorias.has(claveNombre(nombre))) categorias.set(claveNombre(nombre), (await tx.categoria.create({ data: { nombre, nombreNormalizado: claveNombre(nombre) } })).id);
    }

    const existentes = new Map((await tx.obligacion.findMany()).map((o) => [claveObligacion(o.sociedadId, o.proveedor, o.identificador), o]));
    const r: ResultadoSincronizacion = { creadas: 0, actualizadas: 0, sinCambios: 0, noEnArchivo: 0, enRevision: 0, identificadoresDuplicados: 0 };
    const vistas = new Set<number>();
    const cargadas: { f: FilaCatalogo; obligacionId: number }[] = [];

    for (const f of filas) {
      const sociedadId = sociedades.get(f.sociedad);
      if (sociedadId == null) { aRevision(f, "sociedad_sin_coincidencia", MOTIVO_SOCIEDAD_SIN_COINCIDENCIA); continue; }
      if (f.estado !== null && !estadoEsActiva(f.estado)) { aRevision(f, "estado_desconocido", MOTIVO_ESTADO_DESCONOCIDO); continue; }
      const categoriaId = categorias.get(claveNombre(f.categoria))!;
      const o = existentes.get(claveObligacion(sociedadId, f.proveedor, f.identificador));
      if (!o) {
        const nueva = await tx.obligacion.create({
          data: { sociedadId, categoriaId, proveedor: f.proveedor, identificador: f.identificador, diaEsperadoPago: f.dia, frecuencia: frecuenciaDefecto },
        });
        cargadas.push({ f, obligacionId: nueva.id });
        r.creadas++;
        continue;
      }
      vistas.add(o.id);
      cargadas.push({ f, obligacionId: o.id });
      if (o.origen === "manual") { r.sinCambios++; continue; }
      const cambios: Prisma.ObligacionUncheckedUpdateInput = {};
      if (o.categoriaId !== categoriaId) cambios.categoriaId = categoriaId;
      if (o.proveedor !== f.proveedor) cambios.proveedor = f.proveedor;
      if (!o.diaEditado && f.dia !== null && o.diaEsperadoPago !== f.dia) cambios.diaEsperadoPago = f.dia;
      if (Object.keys(cambios).length === 0) { r.sinCambios++; continue; }
      await tx.obligacion.update({ where: { id: o.id }, data: cambios });
      r.actualizadas++;
    }
    // identificador duplicado: avisa, no bloquea. La fila ya se cargó; queda marcada en la lista de revisión.
    const porId = new Map<string, number[]>();
    for (const o of await tx.obligacion.findMany({ select: { id: true, identificador: true } })) {
      const k = identificadorClave(o.identificador);
      porId.set(k, [...(porId.get(k) ?? []), o.id]);
    }
    for (const { f, obligacionId } of cargadas) {
      if ((porId.get(identificadorClave(f.identificador)) ?? []).length > 1) aRevision(f, "identificador_duplicado", MOTIVO_IDENTIFICADOR_DUPLICADO, obligacionId);
    }
    if (revision.length > 0) await tx.catalogoRevision.createMany({ data: revision });
    r.identificadoresDuplicados = revision.filter((x) => x.tipo === "identificador_duplicado").length;
    r.enRevision = revision.length - r.identificadoresDuplicados;
    r.noEnArchivo = [...existentes.values()].filter((o) => o.origen === "catalogo" && !vistas.has(o.id)).length;
    return r;
  });
}

export interface FiltroObligaciones {
  sociedad?: string; // abreviatura
  sociedadId?: number; // identificador: sirve también para sociedades sin abreviatura
  categoria?: number;
  activa?: boolean;
  q?: string;
  falta?: "monto" | "cuenta" | "responsable" | "dia";
  pagina: number;
  porPagina: number;
}

const FALTA: Record<NonNullable<FiltroObligaciones["falta"]>, Prisma.ObligacionWhereInput> = {
  monto: { montoEsperado: null },
  cuenta: { cuentaEsperadaId: null },
  responsable: { responsable: null },
  dia: { diaEsperadoPago: null },
};

export async function listarObligaciones(f: FiltroObligaciones) {
  const where: Prisma.ObligacionWhereInput = {
    ...(f.sociedad ? { sociedad: { codigo: f.sociedad } } : {}),
    ...(f.sociedadId ? { sociedadId: f.sociedadId } : {}),
    ...(f.categoria ? { categoriaId: f.categoria } : {}),
    ...(f.activa !== undefined ? { activa: f.activa } : {}),
    ...(f.falta ? FALTA[f.falta] : {}),
    ...(f.q
      ? { OR: [{ proveedor: { contains: f.q } }, { identificador: { contains: f.q.replace(/\s+/g, "") } }, { responsable: { contains: f.q } }] }
      : {}),
  };
  const [total, datos] = await Promise.all([
    prisma.obligacion.count({ where }),
    prisma.obligacion.findMany({
      where,
      include: incluir,
      orderBy: [{ sociedad: { codigo: "asc" } }, { categoria: { nombre: "asc" } }, { proveedor: "asc" }, { identificador: "asc" }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
    }),
  ]);
  return { total, datos };
}

/** Todas las obligaciones (el catálogo es pequeño): base de las alertas de calidad. */
export async function todasLasObligaciones(): Promise<ObligacionCompleta[]> {
  return prisma.obligacion.findMany({ include: incluir });
}

export async function obtenerObligacion(id: number) {
  return prisma.obligacion.findUnique({ where: { id }, include: incluir });
}

export async function buscarPorClave(sociedadId: number, proveedor: string, identificador: string) {
  const clave = identificadorClave(identificador);
  const candidatas = await prisma.obligacion.findMany({ where: { sociedadId, identificador: { endsWith: clave } } });
  return candidatas.find((o) => claveNombre(o.proveedor) === claveNombre(proveedor) && identificadorClave(o.identificador) === clave) ?? null;
}

/** Otras obligaciones (activas o inactivas, de cualquier sociedad) con el mismo identificador, sin contar ceros a la izquierda. */
export async function buscarPorIdentificador(identificador: string, excluirId?: number) {
  const clave = identificadorClave(identificador);
  const candidatas = await prisma.obligacion.findMany({ where: { identificador: { endsWith: clave } }, include: incluir });
  return candidatas.filter((o) => o.id !== excluirId && identificadorClave(o.identificador) === clave);
}

export async function crearObligacion(data: Prisma.ObligacionUncheckedCreateInput) {
  return prisma.obligacion.create({ data, include: incluir });
}

export async function actualizarObligacion(id: number, data: Prisma.ObligacionUncheckedUpdateInput) {
  return prisma.obligacion.update({ where: { id }, data, include: incluir });
}

export async function listarSociedades() {
  return prisma.sociedad.findMany({
    orderBy: { codigo: "asc" },
    include: { _count: { select: { obligaciones: true, cuentas: true } } },
  });
}

export async function obtenerSociedadPorCodigo(codigo: string) {
  return prisma.sociedad.findUnique({ where: { codigo } });
}

export async function listarCategorias() {
  return prisma.categoria.findMany({ orderBy: { nombre: "asc" }, include: { _count: { select: { obligaciones: true } } } });
}

export async function obtenerCategoria(id: number) {
  return prisma.categoria.findUnique({ where: { id } });
}

export async function obtenerCuenta(id: number) {
  return prisma.cuenta.findUnique({ where: { id } });
}

/** Mes más antiguo (AAAA-MM) con estados de cuenta leídos de la cuenta; si no se da cuenta, de las cuentas de la sociedad. */
export async function mesMasAntiguoConEstados(sociedadId: number, cuentaId: number | null): Promise<string | null> {
  const r = await prisma.archivoImportado.aggregate({
    _min: { mes: true },
    where: { estado: "leido", mes: { not: null }, ...(cuentaId !== null ? { cuentaId } : { sociedadId }) },
  });
  return r._min.mes;
}

/**
 * Pone «Control desde» a las obligaciones que aún no lo tienen: el primer día del mes más antiguo con estados cargados
 * para su cuenta esperada (o, sin cuenta esperada, para su sociedad). Nunca cambia uno ya definido. Devuelve cuántas se completaron.
 */
export async function completarControlDesdePendientes(): Promise<number> {
  const pendientes = await prisma.obligacion.findMany({ where: { controlDesde: null }, select: { id: true, sociedadId: true, cuentaEsperadaId: true } });
  const cache = new Map<string, string | null>();
  let n = 0;
  for (const o of pendientes) {
    const k = `${o.sociedadId}|${o.cuentaEsperadaId ?? ""}`;
    if (!cache.has(k)) cache.set(k, await mesMasAntiguoConEstados(o.sociedadId, o.cuentaEsperadaId));
    const mes = cache.get(k);
    if (!mes) continue;
    await prisma.obligacion.update({ where: { id: o.id }, data: { controlDesde: primerDiaDelPeriodo(mes) } });
    n++;
  }
  return n;
}

