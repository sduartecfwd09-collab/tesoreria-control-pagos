import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { claveNombre, type FilaCatalogo } from "../catalogo/lector.js";

const incluir = { sociedad: true, categoria: true, cuentaEsperada: true } as const;
export type ObligacionCompleta = Prisma.ObligacionGetPayload<{ include: typeof incluir }>;

const claveObligacion = (sociedadId: number, proveedor: string, identificador: string) =>
  `${sociedadId}|${claveNombre(proveedor)}|${identificador}`;

export interface ResultadoSincronizacion {
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  /** obligaciones del catálogo que ya no están en el archivo (no se desactivan solas) */
  noEnArchivo: number;
}

/**
 * Sincroniza las filas leídas del catálogo en una sola transacción. Idempotente:
 * - crea la obligación si no existe (sociedad + proveedor normalizado + identificador);
 * - si existe y es del catálogo, solo actualiza lo que viene del archivo: categoría, forma del nombre y
 *   el día (si Tesorería no lo editó a mano y el archivo trae un día válido);
 * - nunca toca frecuencia, monto, moneda, cuenta, responsable ni activa, ni las obligaciones manuales.
 */
export async function sincronizarCatalogo(filas: FilaCatalogo[], frecuenciaDefecto: string): Promise<ResultadoSincronizacion> {
  return prisma.$transaction(async (tx) => {
    const sociedades = new Map<string, number>();
    for (const codigo of new Set(filas.map((f) => f.sociedad))) {
      const s = await tx.sociedad.upsert({ where: { codigo }, create: { codigo, nombreLargo: codigo }, update: {} });
      sociedades.set(codigo, s.id);
    }
    const categorias = new Map((await tx.categoria.findMany()).map((c) => [claveNombre(c.nombre), c.id]));
    for (const nombre of new Set(filas.map((f) => f.categoria))) {
      if (!categorias.has(claveNombre(nombre))) categorias.set(claveNombre(nombre), (await tx.categoria.create({ data: { nombre, nombreNormalizado: claveNombre(nombre) } })).id);
    }

    const existentes = new Map((await tx.obligacion.findMany()).map((o) => [claveObligacion(o.sociedadId, o.proveedor, o.identificador), o]));
    const r: ResultadoSincronizacion = { creadas: 0, actualizadas: 0, sinCambios: 0, noEnArchivo: 0 };
    const vistas = new Set<number>();

    for (const f of filas) {
      const sociedadId = sociedades.get(f.sociedad)!;
      const categoriaId = categorias.get(claveNombre(f.categoria))!;
      const o = existentes.get(claveObligacion(sociedadId, f.proveedor, f.identificador));
      if (!o) {
        await tx.obligacion.create({
          data: { sociedadId, categoriaId, proveedor: f.proveedor, identificador: f.identificador, diaEsperadoPago: f.dia, frecuencia: frecuenciaDefecto },
        });
        r.creadas++;
        continue;
      }
      vistas.add(o.id);
      if (o.origen === "manual") { r.sinCambios++; continue; }
      const cambios: Prisma.ObligacionUncheckedUpdateInput = {};
      if (o.categoriaId !== categoriaId) cambios.categoriaId = categoriaId;
      if (o.proveedor !== f.proveedor) cambios.proveedor = f.proveedor;
      if (!o.diaEditado && f.dia !== null && o.diaEsperadoPago !== f.dia) cambios.diaEsperadoPago = f.dia;
      if (Object.keys(cambios).length === 0) { r.sinCambios++; continue; }
      await tx.obligacion.update({ where: { id: o.id }, data: cambios });
      r.actualizadas++;
    }
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
  const candidatas = await prisma.obligacion.findMany({ where: { sociedadId, identificador } });
  return candidatas.find((o) => claveNombre(o.proveedor) === claveNombre(proveedor)) ?? null;
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
