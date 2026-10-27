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
