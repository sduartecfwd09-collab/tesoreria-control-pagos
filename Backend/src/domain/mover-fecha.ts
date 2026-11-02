// Reglas puras de «Mover fecha» (solo este mes) y del cambio permanente del día de pago.
import { fechaDesdeTexto } from "./cambio-dia.js";
import type { LineaCambio } from "./historial.js";
import { esPeriodo } from "./vencimientos.js";

/** Estados en los que se puede mover la fecha de un vencimiento: Programado (proyectado), Por vencer, Vencido y Sin información. */
export const ESTADOS_MOVIBLES = ["proyectado", "por_vencer", "vencido", "sin_informacion"];
/** SUPUESTO: tope de días, hacia atrás y hacia adelante, entre la fecha original y la nueva (parámetro `mover_fecha_max_dias`). */
export const MOVER_FECHA_MAX_DIAS_DEFECTO = 60;

const MS_DIA = 86_400_000;

/** Tope válido leído del parámetro; sin fila o con un valor inválido, el de respaldo. */
export function topeDeMover(texto: string | null): number {
  const n = texto === null || texto.trim() === "" ? NaN : Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : MOVER_FECHA_MAX_DIAS_DEFECTO;
}

export type ResultadoFecha = { ok: true; fecha: Date } | { ok: false; error: string };

/** La nueva fecha: real (AAAA-MM-DD), distinta de la vigente y a no más de `tope` días de la ORIGINAL (la primera que tuvo). */
export function validarNuevaFecha(texto: unknown, vigente: Date, original: Date, tope: number): ResultadoFecha {
  if (typeof texto !== "string" || texto.trim() === "") return { ok: false, error: "Elija la nueva fecha" };
  const f = fechaDesdeTexto(texto);
  if (!f) return { ok: false, error: "La nueva fecha debe ser una fecha real (AAAA-MM-DD)" };
  if (f.getTime() === vigente.getTime()) return { ok: false, error: "La nueva fecha es la misma que ya tiene el vencimiento" };
  if (Math.abs(Math.round((f.getTime() - original.getTime()) / MS_DIA)) > tope) {
    return { ok: false, error: `La nueva fecha puede quedar a lo sumo a ${tope} días de la fecha original` };
  }
  return { ok: true, fecha: f };
}

export type ResultadoDesde = { ok: true; desde: string } | { ok: false; error: string };

/** «Desde el mes» (AAAA-MM): válido y no anterior al mes en curso. */
export function validarDesdeMes(valor: unknown, mesEnCurso: string): ResultadoDesde {
  if (typeof valor !== "string" || !esPeriodo(valor)) return { ok: false, error: "Elija el mes desde el que rige el nuevo día" };
  if (valor < mesEnCurso) return { ok: false, error: "El cambio no puede empezar en un mes que ya pasó: elija el mes en curso o uno posterior" };
  return { ok: true, desde: valor };
}

/** Líneas del historial. Antes y después son siempre las dos fechas (ISO AAAA-MM-DD). */
export const lineaDeMoverFecha = (antes: string, despues: string): LineaCambio => ({ accion: "mover_fecha", campo: "fecha_vencimiento", antes, despues });
export const lineaDeQuitarMovimiento = (antes: string, despues: string): LineaCambio => ({ accion: "quitar_movimiento", campo: "fecha_vencimiento", antes, despues });

/** Cambio permanente: «antes» es el día; «despues» es «{día} desde {AAAA-MM}» (no hay columna para el mes de inicio). */
export const textoDiaDesde = (dia: number, desde: string): string => `${dia} desde ${desde}`;
export const lineaDeCambiarDia = (antes: number | null, dia: number, desde: string): LineaCambio => ({
  accion: "cambiar_dia", campo: "diaEsperadoPago", antes: antes === null ? null : String(antes), despues: textoDiaDesde(dia, desde),
});

/** Rango permitido para la nueva fecha: la original más o menos el tope de días (ISO AAAA-MM-DD). */
export const rangoDeMover = (original: Date, tope: number): { desde: string; hasta: string } => ({
  desde: new Date(original.getTime() - tope * MS_DIA).toISOString().slice(0, 10),
  hasta: new Date(original.getTime() + tope * MS_DIA).toISOString().slice(0, 10),
});
