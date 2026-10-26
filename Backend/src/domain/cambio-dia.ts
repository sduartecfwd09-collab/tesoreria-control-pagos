// Validación de los cambios del día de pago (puro).
import { fechaUTC } from "../ingest/utiles.js";

export const MOTIVO_MAXIMO = 300;
export const MOTIVO_MINIMO = 3;

/** Motivo con espacios colapsados; null si falta o no cabe. */
export function normalizarMotivo(motivo: unknown): string | null {
  if (typeof motivo !== "string") return null;
  const m = motivo.replace(/\s+/g, " ").trim();
  return m.length >= MOTIVO_MINIMO && m.length <= MOTIVO_MAXIMO ? m : null;
}

export const diaValido = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 31;

/** "AAAA-MM-DD" a fecha (medianoche UTC); null si no es una fecha real. */
export function fechaDesdeTexto(t: unknown): Date | null {
  const m = typeof t === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t) : null;
  return m ? fechaUTC(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
