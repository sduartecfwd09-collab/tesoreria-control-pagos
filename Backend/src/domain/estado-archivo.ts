// Una sola definición del estado de un archivo importado, usada por las tarjetas, la cobertura y el detalle.
// Motivos fijos por los que un archivo queda «en revisión» al importar (texto del sistema, nunca datos del archivo).
export const MOTIVO_CARPETA_SIN_SOCIEDAD = "carpeta sin sociedad asignada";
export const MOTIVO_NOMBRE_NO_COINCIDE = "nombre de archivo no coincide con la carpeta";

/** Leído; Con error (con motivo); Sin sociedad (su carpeta no tiene sociedad); Retirado de la carpeta (ya no está). */
export type EstadoArchivoVista = "leido" | "con_error" | "sin_sociedad" | "retirado";

export interface DatosEstadoArchivo {
  estado: string; // guardado: pendiente | leido | error | en_revision
  motivo?: string | null;
  error?: string | null;
  retiradoEn?: Date | null;
}

export function estadoDeArchivo(a: DatosEstadoArchivo): EstadoArchivoVista {
  if (a.retiradoEn) return "retirado";
  if (a.estado === "leido") return "leido";
  if (a.estado === "en_revision" && a.motivo === MOTIVO_CARPETA_SIN_SOCIEDAD) return "sin_sociedad";
  return "con_error"; // error, nombre que no coincide con la carpeta o lectura pendiente
}

/** Motivo visible: el error de lectura o el motivo de revisión; nunca vacío en «Con error» y «Sin sociedad». */
export function motivoDeArchivo(a: DatosEstadoArchivo): string | null {
  const v = estadoDeArchivo(a);
  if (v === "leido" || v === "retirado") return null;
  return a.error ?? a.motivo ?? (v === "sin_sociedad" ? "La carpeta no tiene una sociedad asignada" : "El archivo no se pudo leer");
}

/** Los retirados no cuentan en totales, cobertura ni cruce: Archivos = Leídos + Con error + Sin sociedad. */
export interface ResumenEstados {
  archivos: number;
  leidos: number;
  conError: number;
  sinSociedad: number;
  retirados: number;
}

export function resumirEstados(estados: EstadoArchivoVista[]): ResumenEstados {
  const n = (e: EstadoArchivoVista) => estados.filter((x) => x === e).length;
  const leidos = n("leido");
  const conError = n("con_error");
  const sinSociedad = n("sin_sociedad");
  return { archivos: leidos + conError + sinSociedad, leidos, conError, sinSociedad, retirados: n("retirado") };
}
