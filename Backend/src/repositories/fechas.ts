import { prisma } from "../db.js";

export interface RangoDeFechas {
  primera: string;
  ultima: string;
}

const aRango = (min: Date | null, max: Date | null): RangoDeFechas | null =>
  min && max ? { primera: min.toISOString().slice(0, 10), ultima: max.toISOString().slice(0, 10) } : null;

/** Primera y última fecha de vencimiento de las obligaciones indicadas (null = todas); null si no hay ninguno. */
export async function limitesDeVencimientos(obligacionIds: number[] | null): Promise<RangoDeFechas | null> {
  const r = await prisma.vencimiento.aggregate({
    where: obligacionIds ? { obligacionId: { in: obligacionIds } } : {},
    _min: { fecha: true },
    _max: { fecha: true },
  });
  return aRango(r._min.fecha, r._max.fecha);
}

/** Primera y última fecha de movimiento (archivos no retirados) de las sociedades indicadas (null = todas); null si no hay ninguno. */
export async function limitesDeMovimientos(sociedadIds: number[] | null): Promise<RangoDeFechas | null> {
  const r = await prisma.movimiento.aggregate({
    where: { archivo: { retiradoEn: null }, ...(sociedadIds ? { cuenta: { sociedadId: { in: sociedadIds } } } : {}) },
    _min: { fecha: true },
    _max: { fecha: true },
  });
  return aRango(r._min.fecha, r._max.fecha);
}
