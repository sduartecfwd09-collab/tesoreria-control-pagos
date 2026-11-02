// Archivos que traen imágenes (el lector las ignora; no hay OCR). Solo conteos por sociedad y mes. Funciones puras.
import { conImagenesDe } from "./cobertura.js";
import { estadoDeArchivo } from "./estado-archivo.js";

export interface ArchivoImagen {
  sociedad: string | null;
  mes: string | null;
  estado: string;
  numMovimientos: number;
  detalle: unknown;
  retiradoEn?: Date | null;
}

export interface FilaImagenes {
  sociedad: string;
  mes: string;
  /** archivos leídos de esa sociedad y mes */
  archivos: number;
  conImagen: number;
  /** de los que traen imagen, los que tienen cero movimientos */
  conImagenSinMovimientos: number;
}

export interface ResumenImagenes {
  filas: FilaImagenes[];
  conImagen: number;
  conImagenSinMovimientos: number;
  /** archivos leídos antes de que se registrara este dato: se completa con npm run reimportar */
  sinDato: number;
}

/** Cuenta los archivos leídos (no retirados) que traen imágenes, por sociedad y mes, y cuántos de ellos no tienen movimientos. */
export function resumirImagenes(archivos: ArchivoImagen[]): ResumenImagenes {
  const filas = new Map<string, FilaImagenes>();
  let sinDato = 0;
  for (const a of archivos) {
    if (estadoDeArchivo(a) !== "leido") continue;
    const sociedad = a.sociedad ?? "Sin sociedad";
    const mes = a.mes ?? "sin mes";
    const k = `${sociedad}|${mes}`;
    const f = filas.get(k) ?? { sociedad, mes, archivos: 0, conImagen: 0, conImagenSinMovimientos: 0 };
    f.archivos++;
    const imagen = conImagenesDe(a.detalle);
    if (imagen === null) sinDato++;
    if (imagen === true) {
      f.conImagen++;
      if (a.numMovimientos === 0) f.conImagenSinMovimientos++;
    }
    filas.set(k, f);
  }
  const lista = [...filas.values()].sort((x, y) => x.sociedad.localeCompare(y.sociedad, "es") || x.mes.localeCompare(y.mes));
  return {
    filas: lista.filter((f) => f.conImagen > 0),
    conImagen: lista.reduce((s, f) => s + f.conImagen, 0),
    conImagenSinMovimientos: lista.reduce((s, f) => s + f.conImagenSinMovimientos, 0),
    sinDato,
  };
}
