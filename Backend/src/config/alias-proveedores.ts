import { normalizar } from "../ingest/utiles.js";

// Variantes del nombre de un proveedor y el proveedor canónico al que se unen. El proveedor es único («JASEC», «ICE»):
// el servicio lo define la categoría, no el nombre. Es configuración del código (no un archivo de datos). Cada línea es
// una decisión explícita aprobada por Tesorería: no se une nada por parecido. La comparación ignora mayúsculas, tildes y espacios.
const ALIAS: Record<string, string> = {
  "JASEC Internet": "JASEC",
  "ICE Telefono": "ICE",
};

const clave = (nombre: string) => normalizar(nombre).replace(/\s+/g, "");

const PORCLAVE = new Map(Object.entries(ALIAS).map(([variante, canonico]) => [clave(variante), canonico]));

/** El proveedor canónico si el nombre es una variante conocida; si no, el mismo nombre. */
export const proveedorCanonico = (nombre: string): string => PORCLAVE.get(clave(nombre)) ?? nombre;

// Rótulos con los que el banco abrevia el nombre de un proveedor en la descripción de un movimiento (proveedor canónico ->
// rótulos). Sirven para reconocer a quién se pagó cuando varias obligaciones de una sociedad comparten el mismo número de
// servicio. Es configuración del código: cada línea es una decisión explícita; la comparación ignora mayúsculas, tildes y espacios.
const ROTULOS_EN_DESCRIPCION: Record<string, string[]> = {
  Movistar: ["MOVIS"],
};

const ROTULOS_POR_CLAVE = new Map(Object.entries(ROTULOS_EN_DESCRIPCION).map(([canonico, rotulos]) => [clave(canonico), rotulos.map(clave)]));

/**
 * Textos que, dentro de la descripción de un movimiento, indican a este proveedor: su nombre, su nombre canónico y los
 * rótulos del banco (ya sin mayúsculas, tildes ni espacios). Se compara con la descripción normalizada de la misma forma.
 */
export function nombresEnDescripcion(proveedor: string): string[] {
  const canonico = proveedorCanonico(proveedor);
  return [...new Set([clave(proveedor), clave(canonico), ...(ROTULOS_POR_CLAVE.get(clave(canonico)) ?? [])])].filter((n) => n !== "");
}
