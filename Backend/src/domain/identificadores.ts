// El identificador (NISE, cuenta, número de servicio) se guarda siempre como texto. Para compararlo se usa esta
// clave: sin espacios, en mayúsculas y sin ceros a la izquierda ("00012345" y "12345" son el mismo servicio).
export function identificadorClave(id: string): string {
  const t = id.replace(/\s+/g, "").toUpperCase();
  const sinCeros = t.replace(/^0+/, "");
  return sinCeros === "" && t !== "" ? "0" : sinCeros;
}

export const MOTIVO_IDENTIFICADOR_DUPLICADO = "El identificador ya existe en otra obligación: confirme que es intencional";

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Patrón que busca el identificador de una obligación dentro de la descripción de un movimiento (texto en mayúsculas).
 * Va con delimitación: no puede estar pegado a otros dígitos («123» no está en «1234»), y los ceros a la izquierda de la
 * descripción se aceptan («00012345» contiene «12345»). null si el identificador queda vacío.
 */
export function patronIdentificador(id: string): RegExp | null {
  const clave = identificadorClave(id);
  if (clave === "") return null;
  return /^\d+$/.test(clave)
    ? new RegExp(`(?<![0-9])0*${clave}(?![0-9])`)
    : new RegExp(`(?<![A-Z0-9])${escaparRegex(clave)}(?![A-Z0-9])`);
}
