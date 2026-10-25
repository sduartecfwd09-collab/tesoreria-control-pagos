import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { aNumero } from "../domain/montos.js";
import type { ObligacionPlan, VencimientoPlan } from "../domain/vencimientos.js";

const clave = (obligacionId: number, periodo: string) => `${obligacionId}|${periodo}`;

const camposPlan = { id: true, activa: true, frecuencia: true, mesArranque: true, diaEsperadoPago: true, montoEsperado: true } as const;

const aPlan = (o: { montoEsperado: bigint | null } & Omit<ObligacionPlan, "montoEsperado">): ObligacionPlan => ({ ...o, montoEsperado: aNumero(o.montoEsperado) });

export async function obligacionesParaPlan(): Promise<ObligacionPlan[]> {
  return (await prisma.obligacion.findMany({ select: camposPlan, orderBy: { id: "asc" } })).map(aPlan);
}

export async function obligacionParaPlan(id: number): Promise<ObligacionPlan | null> {
  const o = await prisma.obligacion.findUnique({ where: { id }, select: camposPlan });
  return o ? aPlan(o) : null;
}

/** Datos para mostrar las obligaciones omitidas (proveedor, sociedad e identificador). */
export async function describirObligaciones(ids: number[]) {
  return prisma.obligacion.findMany({ where: { id: { in: ids } }, include: { sociedad: true }, orderBy: { id: "asc" } });
}

/** Crea en una transacción los vencimientos que no existen (uno por obligación y periodo). */
export async function crearFaltantes(plan: VencimientoPlan[]) {
  return prisma.$transaction(async (tx) => {
    const periodos = [...new Set(plan.map((v) => v.periodo))];
    const existentes = await tx.vencimiento.findMany({ where: { periodo: { in: periodos } }, select: { obligacionId: true, periodo: true } });
    const hay = new Set(existentes.map((v) => clave(v.obligacionId, v.periodo)));
    const nuevos = plan.filter((v) => !hay.has(clave(v.obligacionId, v.periodo)));
    if (nuevos.length > 0) await tx.vencimiento.createMany({ data: nuevos });
    const creados = new Set(nuevos.map((v) => clave(v.obligacionId, v.periodo)));
    return plan.map((v) => ({ periodo: v.periodo, creado: creados.has(clave(v.obligacionId, v.periodo)) }));
  });
}

/** Último periodo con vencimientos generados (el horizonte), o null si no hay ninguno. */
export async function horizonte(): Promise<string | null> {
  return (await prisma.vencimiento.aggregate({ _max: { periodo: true } }))._max.periodo;
}

export async function vencimientosDeObligacionDesde(obligacionId: number, periodo: string) {
  return prisma.vencimiento.findMany({
    where: { obligacionId, periodo: { gte: periodo } },
    include: { _count: { select: { conciliaciones: true, alertas: true } } },
  });
}

export interface CambiosVencimientos {
  crear: VencimientoPlan[];
  actualizar: { id: number; fecha: Date; montoEsperado: number | null }[];
  eliminar: number[];
}

export async function aplicarCambios(c: CambiosVencimientos) {
  await prisma.$transaction(async (tx) => {
    if (c.eliminar.length > 0) await tx.vencimiento.deleteMany({ where: { id: { in: c.eliminar }, conciliaciones: { none: {} }, alertas: { none: {} } } });
    for (const u of c.actualizar) await tx.vencimiento.update({ where: { id: u.id }, data: { fecha: u.fecha, montoEsperado: u.montoEsperado } });
    if (c.crear.length > 0) await tx.vencimiento.createMany({ data: c.crear });
  });
}

export interface FiltroVencimientos {
  sociedad?: string;
  categoria?: number;
  periodo?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  pagina: number;
  porPagina: number;
}

export async function listarVencimientos(f: FiltroVencimientos) {
  const periodo: Prisma.StringFilter = {
    ...(f.periodo ? { equals: f.periodo } : {}),
    ...(f.desde ? { gte: f.desde } : {}),
    ...(f.hasta ? { lte: f.hasta } : {}),
  };
  const where: Prisma.VencimientoWhereInput = {
    ...(Object.keys(periodo).length ? { periodo } : {}),
    obligacion: {
      ...(f.sociedad ? { sociedad: { codigo: f.sociedad } } : {}),
      ...(f.categoria ? { categoriaId: f.categoria } : {}),
      ...(f.q ? { OR: [{ proveedor: { contains: f.q } }, { identificador: { contains: f.q.replace(/\s+/g, "") } }] } : {}),
    },
  };
  const [total, datos] = await Promise.all([
    prisma.vencimiento.count({ where }),
    prisma.vencimiento.findMany({
      where,
      include: { obligacion: { include: { sociedad: true, categoria: true } }, _count: { select: { conciliaciones: true } } },
      orderBy: [{ fecha: "asc" }, { obligacion: { sociedad: { codigo: "asc" } } }, { obligacion: { proveedor: "asc" } }, { id: "asc" }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
    }),
  ]);
  return { total, datos };
}

export async function periodosGenerados() {
  const g = await prisma.vencimiento.groupBy({ by: ["periodo"], _count: { _all: true }, orderBy: { periodo: "asc" } });
  return g.map((x) => ({ periodo: x.periodo, total: x._count._all }));
}
