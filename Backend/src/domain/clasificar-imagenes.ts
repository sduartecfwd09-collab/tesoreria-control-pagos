// Clasificación de las imágenes embebidas de un archivo por su tamaño relativo a la hoja y su posición. Puro.
// Una imagen pequeña en una esquina es un «probable logo» (el banco pega su logo); una grande es una «posible captura».
// Los umbrales son parámetros (valores por defecto aquí), no valores fijos.
import type { ImagenRelativa } from "../ingest/medir-imagenes.js";

export type ClaseImagen = "probable_logo" | "posible_captura" | "otra";
export type ClaseArchivoImagen = ClaseImagen | "sin_imagen" | "sin_dato";

export interface UmbralesImagen {
  /** desde qué porcentaje del área de la hoja una imagen es «grande» */
  grandePct: number;
  /** ancho, en porcentaje de la hoja, de la franja exterior que cuenta como «esquina» */
  esquinaPct: number;
}

export const UMBRALES_IMAGEN_DEFECTO: UmbralesImagen = { grandePct: 15, esquinaPct: 25 };

export function clasificarImagen(i: ImagenRelativa, u: UmbralesImagen): ClaseImagen {
  if (i.areaPct >= u.grandePct) return "posible_captura";
  const enFilaExterior = i.filaInicioPct <= u.esquinaPct || i.filaFinPct >= 100 - u.esquinaPct;
  const enColumnaExterior = i.colInicioPct <= u.esquinaPct || i.colFinPct >= 100 - u.esquinaPct;
  return enFilaExterior && enColumnaExterior ? "probable_logo" : "otra";
}

/**
 * La clase de un archivo según sus imágenes: si alguna es grande, «posible captura»; si no, si alguna es un logo, «probable logo»;
 * si hay otra imagen, «otra»; sin imágenes, «sin imagen». `undefined` = el archivo se leyó con una versión anterior del lector.
 */
export function clasificarArchivo(imagenes: ImagenRelativa[] | undefined, conImagenes: boolean | undefined, u: UmbralesImagen): ClaseArchivoImagen {
  if (imagenes === undefined) return conImagenes === false ? "sin_imagen" : "sin_dato";
  if (imagenes.length === 0) return conImagenes === true ? "otra" : "sin_imagen"; // trae imágenes que no se pudieron medir
  const clases = imagenes.map((i) => clasificarImagen(i, u));
  if (clases.includes("posible_captura")) return "posible_captura";
  if (clases.includes("probable_logo")) return "probable_logo";
  return "otra";
}
