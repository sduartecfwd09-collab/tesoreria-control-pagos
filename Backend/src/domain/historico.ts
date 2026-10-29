// Reglas puras del Histórico (lectura de vencimientos pasados con su pago cruzado). Fechas AAAA-MM-DD, en el día de Costa Rica.

export interface RangoDeDias {
  desde: string;
  hasta: string;
}

/** Valor de respaldo de «Meses que muestra el Histórico por defecto» (parámetro `historico_meses`). */
export const HISTORICO_MESES_DEFECTO = 12;

const MS_DIA = 86_400_000;
const sumarDias = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * MS_DIA).toISOString().slice(0, 10);

/** Último día del mes de una fecha. */
function finDeMes(iso: string): string {
  const [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
  return sumarDias(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), -1);
}

/** Período por defecto: los últimos N meses de calendario completos, contando el actual (del día 1 del mes de hace N-1 meses al último día del mes actual). */
export function rangoPorDefecto(hoy: string, meses: number): RangoDeDias {
  const indice = Number(hoy.slice(0, 4)) * 12 + Number(hoy.slice(5, 7)) - 1 - (Math.max(1, meses) - 1);
  const desde = `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}-01`;
  return { desde, hasta: finDeMes(hoy) };
}

export interface CoberturaDelPeriodo {
  /** ningún día del período tiene estados de cuenta cargados: no se puede saber si hubo pagos */
  sinInformacion: boolean;
  /** parte del período queda fuera de los estados de cuenta cargados */
  parcial: boolean;
}

/** Qué tanto del período pedido cubren los estados de cuenta cargados (primera y última fecha con movimientos; null = ninguno). */
export function coberturaDelPeriodo(rango: RangoDeDias, cobertura: { primera: string; ultima: string } | null): CoberturaDelPeriodo {
  if (!cobertura) return { sinInformacion: true, parcial: false };
  const sinCruce = rango.hasta < cobertura.primera || rango.desde > cobertura.ultima;
  if (sinCruce) return { sinInformacion: true, parcial: false };
  return { sinInformacion: false, parcial: rango.desde < cobertura.primera || rango.hasta > cobertura.ultima };
}
