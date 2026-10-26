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

export interface SociedadBuscable {
  id: number;
  codigo: string | null;
  nombreLargo: string;
}

/**
 * Resuelve el texto de la columna «Sociedad» del catálogo a una sociedad que ya existe: por abreviatura, por
 * nombre oficial o por alias explícito. Igualdad exacta de la clave normalizada; nunca por parecido. Devuelve null si no hay.
 */
export function resolutorDeSociedades(
  sociedades: SociedadBuscable[],
  codigoPorAlias: (nombre: string) => string | null,
): (texto: string) => number | null {
  const porClave = new Map<string, number>();
  const porCodigo = new Map<string, number>();
  for (const s of sociedades) {
    if (s.codigo) porCodigo.set(normalizarNombreSociedad(s.codigo), s.id);
    porClave.set(normalizarNombreSociedad(s.nombreLargo), s.id);
  }
  return (texto) => {
    const k = normalizarNombreSociedad(texto);
    if (!k) return null;
    const alias = codigoPorAlias(texto);
    return porCodigo.get(k) ?? porClave.get(k) ?? (alias ? (porCodigo.get(normalizarNombreSociedad(alias)) ?? null) : null);
  };
}
