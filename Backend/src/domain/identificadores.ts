// El identificador (NISE, cuenta, número de servicio) se guarda siempre como texto. Para compararlo se usa esta
// clave: sin espacios, en mayúsculas y sin ceros a la izquierda ("00012345" y "12345" son el mismo servicio).
export function identificadorClave(id: string): string {
  const t = id.replace(/\s+/g, "").toUpperCase();
  const sinCeros = t.replace(/^0+/, "");
  return sinCeros === "" && t !== "" ? "0" : sinCeros;
}

export const MOTIVO_IDENTIFICADOR_DUPLICADO = "El identificador ya existe en otra obligación: confirme que es intencional";
