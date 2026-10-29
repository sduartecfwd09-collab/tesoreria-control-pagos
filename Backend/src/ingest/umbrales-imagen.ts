// Umbrales para clasificar las imágenes de un archivo, tomados de los parámetros ocultos (con valor por defecto si falta o es inválido).
import { UMBRALES_IMAGEN_DEFECTO, type UmbralesImagen } from "../domain/clasificar-imagenes.js";
import { valorGlobal } from "../repositories/parametros.js";

async function porcentaje(clave: string, defecto: number): Promise<number> {
  const n = Number(await valorGlobal(clave));
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : defecto;
}

export async function cargarUmbralesImagen(): Promise<UmbralesImagen> {
  return {
    grandePct: await porcentaje("diagnostico_imagen_grande_pct", UMBRALES_IMAGEN_DEFECTO.grandePct),
    esquinaPct: await porcentaje("diagnostico_imagen_esquina_pct", UMBRALES_IMAGEN_DEFECTO.esquinaPct),
  };
}
