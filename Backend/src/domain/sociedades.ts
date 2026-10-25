import { normalizar } from "../ingest/utiles.js";

// La abreviatura de una sociedad es opcional: donde se necesita un texto corto se usa la abreviatura
// y, si no tiene, el nombre largo.
export const etiquetaSociedad = (s: { codigo: string | null; nombreLargo: string }): string => s.codigo ?? s.nombreLargo;

/**
 * Clave de comparación del nombre de una sociedad: sin mayúsculas, tildes, puntuación ni espacios sobrantes.
 * "ZONA FRANCA LA LIMA, S.R.L." y "Zona Franca La Lima S.R.L" dan la misma clave. Es una igualdad exacta de la
 * clave: nunca hay coincidencia difusa (entidades parecidas no deben confundirse).
 */
export function normalizarNombreSociedad(nombre: string): string {
  return normalizar(nombre)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
