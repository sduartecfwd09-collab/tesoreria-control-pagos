import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { claveNombre, estadoEsActiva, estadoEsInactiva, type FilaCatalogo } from "../catalogo/lector.js";
import { codigoPorAlias } from "../config/alias-sociedades.js";
import { claveCategoria } from "../domain/categorias.js";
import { primerDiaDelPeriodo } from "../domain/control-desde.js";
import { identificadorClave, MOTIVO_IDENTIFICADOR_DUPLICADO } from "../domain/identificadores.js";
import { resolutorDeSociedades } from "../domain/sociedades.js";

export const MOTIVO_CATEGORIA_DESCONOCIDA = "La categoría no existe: solo Jefatura puede crearla";
export const MOTIVO_ESTADO_DESCONOCIDO = "El estado de la fila no es «ACTIVA» ni «INACTIVA»: no se cargó, una persona decide";
export const MOTIVO_SOCIEDAD_SIN_COINCIDENCIA = "La sociedad no coincide con ninguna sociedad existente";

const incluir = { sociedad: { include: { tesorero: { select: { nombre: true } } } }, categoria: true, cuentaEsperada: true } as const;
export type ObligacionCompleta = Prisma.ObligacionGetPayload<{ include: typeof incluir }>;

const claveObligacion = (sociedadId: number, proveedor: string, identificador: string, categoriaId: number) =>
  `${sociedadId}|${claveNombre(proveedor)}|${identificadorClave(identificador)}|${categoriaId}`;

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
 * - nunca crea categorías: la fila con una categoría que no existe queda en la lista de revisión;
 * - nunca crea sociedades: solo asigna a las existentes; la fila que no coincide queda en la lista de revisión con su motivo;
 * - la columna ESTADO es opcional: sin ella todas son activas; con ella, «ACTIVA» es activa, «INACTIVA» se carga inactiva
 *   y cualquier otro valor (incluida una celda vacía) va a revisión (no se carga ni se asume);
 * - crea la obligación si no existe (sociedad + proveedor normalizado + identificador);
 * - si existe y es del catálogo, solo actualiza lo que viene del archivo: forma del nombre y
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
    // El importador nunca crea categorías (solo Jefatura): una categoría que no existe manda la fila a revisión.
    const categorias = new Map((await tx.categoria.findMany()).map((c) => [claveCategoria(c.nombre), c.id]));
    const existentes = new Map((await tx.obligacion.findMany()).map((o) => [claveObligacion(o.sociedadId, o.proveedor, o.identificador, o.categoriaId), o]));
    const r: ResultadoSincronizacion = { creadas: 0, actualizadas: 0, sinCambios: 0, noEnArchivo: 0, enRevision: 0, identificadoresDuplicados: 0 };
    const vistas = new Set<number>();
    const cargadas: { f: FilaCatalogo; obligacionId: number }[] = [];

    for (const f of filas) {
      const sociedadId = sociedades.get(f.sociedad);
      if (sociedadId == null) { aRevision(f, "sociedad_sin_coincidencia", MOTIVO_SOCIEDAD_SIN_COINCIDENCIA); continue; }
      if (f.estado !== null && !estadoEsActiva(f.estado) && !estadoEsInactiva(f.estado)) { aRevision(f, "estado_desconocido", MOTIVO_ESTADO_DESCONOCIDO); continue; }
      const categoriaId = categorias.get(claveCategoria(f.categoria));
      if (categoriaId === undefined) { aRevision(f, "categoria_desconocida", MOTIVO_CATEGORIA_DESCONOCIDA); continue; }
      const o = existentes.get(claveObligacion(sociedadId, f.proveedor, f.identificador, categoriaId));
      if (!o) {
        const nueva = await tx.obligacion.create({
          data: { sociedadId, categoriaId, proveedor: f.proveedor, identificador: f.identificador, diaEsperadoPago: f.dia, frecuencia: frecuenciaDefecto, activa: f.estado === null || !estadoEsInactiva(f.estado) },
        });
        cargadas.push({ f, obligacionId: nueva.id });
        r.creadas++;
        continue;
      }
      vistas.add(o.id);
      cargadas.push({ f, obligacionId: o.id });
      if (o.origen === "manual") { r.sinCambios++; continue; }
      const cambios: Prisma.ObligacionUncheckedUpdateInput = {};
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
  /** solo estas obligaciones (el alcance de la persona); ausente = todas */
  ids?: number[];
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
  // sin responsable propio y sin tesorero en su sociedad (el responsable efectivo es el propio o, si falta, el tesorero)
  responsable: { responsable: null, sociedad: { tesoreroId: null } },
  dia: { diaEsperadoPago: null },
};

/** Lo mínimo para decidir el alcance de una persona: responsable propio y tesorero de la sociedad de cada obligación (y las sociedades de las que es tesorero). */
export async function datosParaAlcance(tesoreroId?: number) {
  const [obligaciones, sociedades] = await Promise.all([
    prisma.obligacion.findMany({ select: { id: true, sociedadId: true, responsable: true, sociedad: { select: { tesoreroId: true } } } }),
    tesoreroId === undefined ? Promise.resolve([]) : prisma.sociedad.findMany({ where: { tesoreroId }, select: { id: true } }),
  ]);
  return { obligaciones, sociedadesDeTesorero: sociedades.map((x) => x.id) };
}

export async function listarObligaciones(f: FiltroObligaciones) {
  const where: Prisma.ObligacionWhereInput = {
    ...(f.ids ? { id: { in: f.ids } } : {}),
    ...(f.sociedad ? { sociedad: { codigo: f.sociedad } } : {}),
    ...(f.sociedadId ? { sociedadId: f.sociedadId } : {}),
    ...(f.categoria ? { categoriaId: f.categoria } : {}),
    ...(f.activa !== undefined ? { activa: f.activa } : {}),
    ...(f.falta ? FALTA[f.falta] : {}),
    ...(f.q
      ? { OR: [{ proveedor: { contains: f.q } }, { identificador: { contains: f.q.replace(/\s+/g, "") } }, { responsable: { contains: f.q } }, { responsable: null, sociedad: { tesorero: { nombre: { contains: f.q } } } }] }
      : {}),
  };
  const [total, datos] = await Promise.all([
    prisma.obligacion.count({ where }),
    prisma.obligacion.findMany({
      where,
      include: incluir,
      orderBy: [{ sociedad: { nombreLargo: "asc" } }, { categoria: { nombre: "asc" } }, { proveedor: "asc" }, { identificador: "asc" }],
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

/** La misma obligación: sociedad, proveedor, identificador (sin ceros a la izquierda) y categoría. */
export async function buscarPorClave(sociedadId: number, proveedor: string, identificador: string, categoriaId: number) {
  const clave = identificadorClave(identificador);
  const candidatas = await prisma.obligacion.findMany({ where: { sociedadId, categoriaId, identificador: { endsWith: clave } } });
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

/** Identificadores de las sociedades que tienen algún estado de cuenta cargado. */
export async function sociedadesConEstados(): Promise<Set<number>> {
  const g = await prisma.archivoImportado.groupBy({ by: ["sociedadId"], where: { sociedadId: { not: null }, retiradoEn: null } });
  return new Set(g.map((x) => x.sociedadId!));
}

/** Identificadores de las sociedades que tienen al menos una obligación activa. */
export async function sociedadesConObligacionesActivas(): Promise<Set<number>> {
  const g = await prisma.obligacion.groupBy({ by: ["sociedadId"], where: { activa: true } });
  return new Set(g.map((x) => x.sociedadId));
}

export async function listarSociedades() {
  return prisma.sociedad.findMany({
    orderBy: { nombreLargo: "asc" },
    include: { _count: { select: { obligaciones: true, cuentas: true } }, tesorero: { select: { nombre: true } } },
  });
}

export async function obtenerSociedadPorId(id: number) {
  return prisma.sociedad.findUnique({ where: { id } });
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
    where: { estado: "leido", retiradoEn: null, mes: { not: null }, ...(cuentaId !== null ? { cuentaId } : { sociedadId }) },
  });
  return r._min.mes;
}

/**
 * Pone «Control desde» a las obligaciones que aún no lo tienen: el primer día del mes más antiguo con estados cargados
 * para su cuenta esperada (o, sin cuenta esperada, para su sociedad). Nunca cambia uno ya definido. Devuelve cuántas se completaron.
 */
export async function completarControlDesdePendientes(mesSinEstados?: string): Promise<number> {
  const pendientes = await prisma.obligacion.findMany({ where: { controlDesde: null }, select: { id: true, sociedadId: true, cuentaEsperadaId: true } });
  const cache = new Map<string, string | null>();
  let n = 0;
  for (const o of pendientes) {
    const k = `${o.sociedadId}|${o.cuentaEsperadaId ?? ""}`;
    if (!cache.has(k)) cache.set(k, await mesMasAntiguoConEstados(o.sociedadId, o.cuentaEsperadaId));
    const mes = cache.get(k) ?? mesSinEstados; // sin estados: el mes en que se carga la obligación (si se indica)
    if (!mes) continue;
    await prisma.obligacion.update({ where: { id: o.id }, data: { controlDesde: primerDiaDelPeriodo(mes) } });
    n++;
  }
  return n;
}

