// Forma con la que los bancos describen el pago de un servicio: «Pago:<PROVEEDOR> <número>». Es configuración del código
// y solo la usa el diagnóstico: el cruce busca el identificador de cada obligación y no depende de este patrón.
// Grupo 1 = nombre del proveedor tal como lo escribe el banco; grupo 2 = número (identificador).
export const PATRON_PAGO = /PAGO\s*:\s*([^\d:]+?)\s*(\d{6,})/;

/** Proveedor (en mayúsculas, sin espacios sobrantes) y número de un débito con la forma «Pago:<PROVEEDOR> <número>», o null. */
export function leerPagoConForma(descripcion: string | null): { proveedor: string; numero: string } | null {
  const m = PATRON_PAGO.exec((descripcion ?? "").toUpperCase());
  if (!m) return null;
  return { proveedor: m[1]!.replace(/\s+/g, " ").trim(), numero: m[2]! };
}
