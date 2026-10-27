import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { periodoDeControl } from "../domain/control-desde.js";
import { aNumero } from "../domain/montos.js";
import { ESTADOS_PAGADOS, type CopiaObligacion, type ObligacionPlan, type VencimientoPlan } from "../domain/vencimientos.js";

const camposPlan = { id: true, sociedadId: true, categoriaId: true, proveedor: true, cuentaEsperadaId: true, moneda: true, activa: true, frecuencia: true, mesArranque: true, diaEsperadoPago: true, montoEsperado: true, controlDesde: true } as const;

const aPlan = (o: { montoEsperado: bigint | null; controlDesde: Date | null } & Omit<ObligacionPlan, "montoEsperado" | "controlDesde">): ObligacionPlan => ({
  ...o,
  montoEsperado: aNumero(o.montoEsperado),
  controlDesde: periodoDeControl(o.controlDesde),
});

export async function obligacionesParaPlan(): Promise<ObligacionPlan[]> {
  return (await prisma.obligacion.findMany({ select: camposPlan, orderBy: { id: "asc" } })).map(aPlan);
}

export async function obligacionParaPlan(id: number): Promise<ObligacionPlan | null> {
  const o = await prisma.obligacion.findUnique({ where: { id }, select: camposPlan });
  return o ? aPlan(o) : null;
}

/** Todos los vencimientos de las obligaciones dadas, con lo que impide tocarlos. */
export async function vencimientosDeObligaciones(obligacionIds: number[]) {
  return prisma.vencimiento.findMany({
    where: { obligacionId: { in: obligacionIds } },
    include: { _count: { select: { conciliaciones: true, alertas: true, cambiosDia: true } } },
  });
}

/** Último periodo con vencimientos de cada obligación (para calcular el próximo pago). */
export async function ultimosPeriodos(obligacionIds: number[]): Promise<Map<number, string>> {
  const g = await prisma.vencimiento.groupBy({ by: ["obligacionId"], where: { obligacionId: { in: obligacionIds } }, _max: { periodo: true } });
  return new Map(g.flatMap((x) => (x._max.periodo ? [[x.obligacionId, x._max.periodo] as [number, string]] : [])));
}

export interface CambiosVencimientos {
  crear: VencimientoPlan[];
  actualizar: ({ id: number; fecha: Date; fechaOriginal: Date | null; montoEsperado: number | null } & CopiaObligacion)[];
  eliminar: number[];
}

export async function aplicarCambios(c: CambiosVencimientos) {
  await prisma.$transaction(async (tx) => {
    if (c.eliminar.length > 0) await tx.vencimiento.deleteMany({ where: { id: { in: c.eliminar }, estado: { notIn: ESTADOS_PAGADOS }, conciliaciones: { none: {} }, alertas: { none: {} }, cambiosDia: { none: {} } } });
    for (const { id, ...data } of c.actualizar) await tx.vencimiento.update({ where: { id }, data });
    if (c.crear.length > 0) await tx.vencimiento.createMany({ data: c.crear });
  });
}

export interface FiltroVencimientos {
  sociedad?: string; // abreviatura
  sociedadId?: number; // identificador: sirve también para sociedades sin abreviatura
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
    // sociedad, categoría y proveedor salen de la copia del vencimiento: el Histórico no cambia si la obligación se edita
    ...(f.sociedad ? { sociedad: { codigo: f.sociedad } } : {}),
    ...(f.sociedadId ? { sociedadId: f.sociedadId } : {}),
    ...(f.categoria ? { categoriaId: f.categoria } : {}),
    ...(f.q ? { OR: [{ proveedor: { contains: f.q } }, { obligacion: { identificador: { contains: f.q.replace(/\s+/g, "") } } }] } : {}),
  };
  const [total, datos] = await Promise.all([
    prisma.vencimiento.count({ where }),
    prisma.vencimiento.findMany({
      where,
      include: { obligacion: true, sociedad: true, categoria: true, _count: { select: { conciliaciones: true } } },
      orderBy: [{ fecha: "asc" }, { sociedad: { codigo: "asc" } }, { proveedor: "asc" }, { id: "asc" }],
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
