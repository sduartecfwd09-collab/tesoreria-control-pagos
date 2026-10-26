// Reglas de los nombres de categoría (puro). Los nombres se comparan sin distinguir mayúsculas, tildes ni espacios
// («Cable» = «CABLE» = « c able »). Si un nombre nuevo es casi igual a uno existente se pregunta «¿quisiste decir…?»
// antes de crear. Las categorías no se borran: se desactivan.
import { normalizar } from "../ingest/utiles.js";

export const NOMBRE_CATEGORIA_MAXIMO = 100;
export const NOMBRE_CATEGORIA_MINIMO = 2;

/** Nombre para guardar: espacios colapsados y recortados. null si falta o no cabe. */
export function nombreCategoriaLimpio(nombre: unknown): string | null {
  if (typeof nombre !== "string") return null;
  const n = nombre.replace(/\s+/g, " ").trim();
  return n.length >= NOMBRE_CATEGORIA_MINIMO && n.length <= NOMBRE_CATEGORIA_MAXIMO ? n : null;
}

/** Clave de comparación: sin mayúsculas, tildes ni ningún espacio. */
export const claveCategoria = (nombre: string): string => normalizar(nombre).replace(/\s+/g, "");

/** Distancia de edición (inserciones, borrados y cambios de una letra). */
export function distanciaDeEdicion(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j]! + 1, actual[j - 1]! + 1, previa[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[b.length]!;
}

/** Una letra de diferencia en nombres de hasta 6 letras; hasta dos en los más largos. Son «casi iguales», no iguales. */
export function sonParecidas(claveA: string, claveB: string): boolean {
  if (claveA === claveB) return false;
  const tope = Math.max(claveA.length, claveB.length) <= 6 ? 1 : 2;
  return distanciaDeEdicion(claveA, claveB) <= tope;
}

export type ResultadoNombre =
  | { tipo: "igual"; existente: string }
  | { tipo: "parecidas"; existentes: string[] }
  | { tipo: "nuevo" };

/** Compara un nombre nuevo con los existentes. */
export function compararNombre(nombre: string, existentes: string[]): ResultadoNombre {
  const clave = claveCategoria(nombre);
  const igual = existentes.find((e) => claveCategoria(e) === clave);
  if (igual !== undefined) return { tipo: "igual", existente: igual };
  const parecidas = existentes.filter((e) => sonParecidas(clave, claveCategoria(e)));
  return parecidas.length > 0 ? { tipo: "parecidas", existentes: parecidas } : { tipo: "nuevo" };
}
