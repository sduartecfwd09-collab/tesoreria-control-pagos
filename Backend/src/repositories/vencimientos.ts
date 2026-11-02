import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { periodoDeControl } from "../domain/control-desde.js";
import { aNumero } from "../domain/montos.js";
import { cambiosDiaProgramados } from "./cambios-dia.js";
import { ESTADOS_PAGADOS, type CopiaObligacion, type ObligacionPlan, type VencimientoPlan } from "../domain/vencimientos.js";

const camposPlan = { id: true, sociedadId: true, categoriaId: true, proveedor: true, cuentaEsperadaId: true, moneda: true, activa: true, frecuencia: true, mesArranque: true, diaEsperadoPago: true, montoEsperado: true, controlDesde: true } as const;

const aPlan = (o: { montoEsperado: bigint | null; controlDesde: Date | null } & Omit<ObligacionPlan, "montoEsperado" | "controlDesde">): ObligacionPlan => ({
  ...o,
  montoEsperado: aNumero(o.montoEsperado),
  controlDesde: periodoDeControl(o.controlDesde),
});

/** Las obligaciones con sus cambios permanentes del día (el calendario usa el día que rige en cada periodo). */
export async function obligacionesParaPlan(): Promise<ObligacionPlan[]> {
  const filas = await prisma.obligacion.findMany({ select: camposPlan, orderBy: { id: "asc" } });
  const cambios = await cambiosDiaProgramados(filas.map((o) => o.id));
  return filas.map((o) => ({ ...aPlan(o), cambiosDia: cambios.get(o.id) ?? [] }));
}

export async function obligacionParaPlan(id: number): Promise<ObligacionPlan | null> {
  const o = await prisma.obligacion.findUnique({ where: { id }, select: camposPlan });
  return o ? { ...aPlan(o), cambiosDia: (await cambiosDiaProgramados([id])).get(id) ?? [] } : null;
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
  /** solo vencimientos de estas obligaciones (el alcance de la persona); ausente = todas */
  obligacionIds?: number[];
  sociedad?: string; // abreviatura
  sociedadId?: number; // identificador: sirve también para sociedades sin abreviatura
  categoria?: number;
  periodo?: string;
  desde?: string;
  hasta?: string;
  /** día exacto de la fecha de vencimiento (AAAA-MM-DD), ambos incluidos; se combina con periodo, desde y hasta */
  fechaDesde?: string;
  fechaHasta?: string;
  q?: string;
  /** estados a mostrar (vacío o ausente = todos) */
  estados?: string[];
  /** con `periodo`: además de ese periodo, los pendientes (vencido, sin información, por revisar) de periodos anteriores */
  pendientesAnteriores?: boolean;
  /** orden por fecha de vencimiento; por defecto ascendente */
  orden?: "asc" | "desc";
  pagina: number;
  porPagina: number;
}

export const ESTADOS_PENDIENTES = ["vencido", "sin_informacion", "por_revisar"];

export async function listarVencimientos(f: FiltroVencimientos) {
  const periodo: Prisma.StringFilter = {
    ...(f.periodo ? { equals: f.periodo } : {}),
    ...(f.desde ? { gte: f.desde } : {}),
    ...(f.hasta ? { lte: f.hasta } : {}),
  };
  const dePeriodo: Prisma.VencimientoWhereInput =
    f.periodo && f.pendientesAnteriores
      ? { OR: [{ periodo: f.periodo }, { periodo: { lt: f.periodo }, estado: { in: ESTADOS_PENDIENTES } }] }
      : Object.keys(periodo).length ? { periodo } : {};
  const fecha: Prisma.DateTimeFilter = {
    ...(f.fechaDesde ? { gte: new Date(`${f.fechaDesde}T00:00:00.000Z`) } : {}),
    ...(f.fechaHasta ? { lte: new Date(`${f.fechaHasta}T00:00:00.000Z`) } : {}),
  };
  const sinEstado: Prisma.VencimientoWhereInput = {
    AND: [
      dePeriodo,
      Object.keys(fecha).length ? { fecha } : {},
      f.obligacionIds ? { obligacionId: { in: f.obligacionIds } } : {},
      // sociedad, categoría y proveedor salen de la copia del vencimiento: el Histórico no cambia si la obligación se edita
      {
        ...(f.sociedad ? { sociedad: { codigo: f.sociedad } } : {}),
        ...(f.sociedadId ? { sociedadId: f.sociedadId } : {}),
        ...(f.categoria ? { categoriaId: f.categoria } : {}),
      },
      f.q ? { OR: [{ proveedor: { contains: f.q } }, { obligacion: { identificador: { contains: f.q.replace(/ +/g, "") } } }] } : {},
    ],
  };
  const where: Prisma.VencimientoWhereInput = f.estados?.length ? { AND: [sinEstado, { estado: { in: f.estados } }] } : sinEstado;
  const [total, datos, porEstado] = await Promise.all([
    prisma.vencimiento.count({ where }),
    prisma.vencimiento.findMany({
      where,
      include: {
        obligacion: { include: { sociedad: { include: { tesorero: { select: { nombre: true } } } } } }, sociedad: true, categoria: true, _count: { select: { conciliaciones: true } },
        // el pago que respalda el estado: solo fecha, monto y la cuenta (para su moneda, banco y últimos 4)
        movimiento: { select: { fecha: true, debito: true, claveDedup: true, cuenta: { select: { numero: true, banco: true, moneda: true } } } },
      },
      orderBy: [{ fecha: f.orden ?? "asc" }, { sociedad: { codigo: "asc" } }, { proveedor: "asc" }, { id: f.orden ?? "asc" }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
    }),
    // conteo por estado de lo que se ve (sin el filtro de estado: las tarjetas muestran todos)
    prisma.vencimiento.groupBy({ by: ["estado"], where: sinEstado, _count: { _all: true } }),
  ]);
  return { total, datos, resumen: Object.fromEntries(porEstado.map((x) => [x.estado, x._count._all])) as Record<string, number> };
}

export async function periodosGenerados() {
  const g = await prisma.vencimiento.groupBy({ by: ["periodo"], _count: { _all: true }, orderBy: { periodo: "asc" } });
  return g.map((x) => ({ periodo: x.periodo, total: x._count._all }));
}

const incluirMovimiento = { select: { id: true, fecha: true, debito: true, descripcion: true, cuenta: { select: { numero: true, banco: true, moneda: true, sociedad: { select: { nombreLargo: true } } } } } } as const;

/** Un vencimiento con todo lo que muestra su detalle (solo lectura). */
export async function obtenerVencimientoDetalle(id: number) {
  return prisma.vencimiento.findUnique({
    where: { id },
    include: {
      sociedad: true, categoria: true,
      obligacion: { include: { sociedad: { include: { tesorero: { select: { nombre: true } } } } } },
      movimiento: incluirMovimiento,
      // quién movió la fecha de este vencimiento (el último cambio de «solo este mes»)
      cambiosDia: { where: { tipo: "una_vez" }, orderBy: { id: "desc" }, take: 1, select: { motivo: true, creadoEn: true, usuario: { select: { nombre: true } } } },
    },
  });
}

/** Débitos de archivos vigentes con fecha entre desde y hasta (ambas incluidas): el servicio filtra por identificador. */
export async function debitosEnVentana(desde: Date, hasta: Date) {
  return prisma.movimiento.findMany({
    where: { debito: { gt: 0n }, archivo: { retiradoEn: null }, fecha: { gte: desde, lt: new Date(hasta.getTime() + 86_400_000) } },
    select: incluirMovimiento.select,
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
  });
}

/** Banco y número de cuentas (para mostrar solo los últimos 4). */
export async function datosDeCuentas(ids: number[]) {
  return prisma.cuenta.findMany({ where: { id: { in: ids } }, select: { id: true, numero: true, banco: true, sociedadId: true } });
}

/** Los vencimientos de una sociedad en un periodo, con su categoría y el identificador de su obligación (para armar el grupo). */
export async function vencimientosDeSociedadEnPeriodo(sociedadId: number, periodo: string) {
  return prisma.vencimiento.findMany({
    where: { sociedadId, periodo, obligacion: { activa: true } },
    include: { categoria: true, obligacion: { select: { identificador: true } } },
    orderBy: { id: "asc" },
  });
}

/** De los movimientos dados, cuáles ya respaldan algún vencimiento (están asignados a un pago). */
export async function movimientosAsignados(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const filas = await prisma.vencimiento.findMany({ where: { movimientoId: { in: ids } }, select: { movimientoId: true } });
  return new Set(filas.flatMap((f) => (f.movimientoId === null ? [] : [f.movimientoId])));
}

/** De los movimientos dados, los que respaldan un vencimiento de OTRA obligación: movimiento -> proveedor de esa obligación. */
export async function asignadosAOtraObligacion(ids: number[], obligacionId: number): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const filas = await prisma.vencimiento.findMany({ where: { movimientoId: { in: ids }, obligacionId: { not: obligacionId } }, select: { movimientoId: true, proveedor: true } });
  return new Map(filas.flatMap((f) => (f.movimientoId === null ? [] : [[f.movimientoId, f.proveedor] as [number, string]])));
}

/** Vencimientos de obligaciones activas que requieren atención (todos los meses), con lo necesario para saber de quién son. */
export async function vencimientosParaAvisos(estados: string[]) {
  return prisma.vencimiento.findMany({
    where: { estado: { in: estados }, obligacion: { activa: true } },
    select: {
      id: true, obligacionId: true, sociedadId: true, periodo: true, fecha: true, estado: true, motivo: true, sinInfoHasta: true, proveedor: true,
      sociedad: { select: { codigo: true, nombreLargo: true, tesoreroId: true, tesorero: { select: { nombre: true } } } },
      obligacion: { select: { identificador: true, sociedad: { select: { tesorero: { select: { nombre: true } } } } } },
    },
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
  });
}

/** Lo que hace falta para decidir si se puede asociar un pago a un vencimiento: su estado, su sociedad (y su tesorero) y el pago que hoy lo respalda. */
export async function vencimientoParaAsociar(id: number) {
  return prisma.vencimiento.findUnique({
    where: { id },
    select: {
      id: true, obligacionId: true, sociedadId: true, periodo: true, fecha: true, fechaOriginal: true, estado: true,
      sociedad: { select: { id: true, tesoreroId: true } },
      obligacion: { select: { identificador: true, proveedor: true } }, // para las marcas «trae el número» y «trae el proveedor»
      movimiento: { select: { claveDedup: true } },
    },
  });
}

/**
 * Débitos de la sociedad (archivos vigentes) con fecha entre desde y hasta (hasta, exclusivo) que NO respaldan ningún vencimiento y cuya huella
 * no está en `excluirHuellas` (pagos con una asociación vigente aunque el cruce aún no se haya recalculado). El orden y el tope los pone el dominio.
 */
export async function debitosLibresDeSociedad(sociedadId: number, desde: Date, hastaExclusivo: Date, excluirHuellas: string[]) {
  return prisma.movimiento.findMany({
    where: {
      debito: { gt: 0n }, archivo: { retiradoEn: null }, cuenta: { sociedadId }, fecha: { gte: desde, lt: hastaExclusivo },
      vencimientos: { none: {} }, ...(excluirHuellas.length > 0 ? { claveDedup: { notIn: excluirHuellas } } : {}),
    },
    select: { id: true, fecha: true, descripcion: true, referencia: true, claveDedup: true, debito: true, cuenta: { select: { numero: true, moneda: true, banco: true } } },
  });
}
