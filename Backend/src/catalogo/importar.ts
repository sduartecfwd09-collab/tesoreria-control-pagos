// Importación del catálogo de obligaciones desde la tabla de pagos frecuentes (CATALOGO_FILE).
// El archivo solo se lee. El resumen trae conteos, números de fila y nombres de proveedor; nunca identificadores.
import { readFile } from "node:fs/promises";
import { FRECUENCIAS } from "../domain/parametros.js";
import { leerLibro } from "../ingest/lector.js";
import { completarControlDesdePendientes, sincronizarCatalogo, type ResultadoSincronizacion } from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";
import { leerCatalogo, type ProblemaFila, type VarianteNombre } from "./lector.js";

export interface ResumenCatalogo extends ResultadoSincronizacion {
  hoja: string;
  filasLeidas: number;
  problemas: ProblemaFila[];
  variantes: VarianteNombre[];
  /** proveedores distintos con su número de filas, para revisar variantes del mismo nombre */
  proveedores: { nombre: string; filas: number }[];
  porSociedad: Record<string, number>;
  porCategoria: Record<string, number>;
}

let enCurso = false;
export const hayImportacionCatalogoEnCurso = () => enCurso;

const contar = (xs: string[]) => {
  const m: Record<string, number> = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return m;
};

export async function importarCatalogo(ruta: string): Promise<ResumenCatalogo> {
  enCurso = true;
  try {
    const leido = leerCatalogo(await leerLibro(await readFile(ruta)));
    const defecto = (await valorGlobal("frecuencia_defecto")) ?? "mensual";
    const frecuencia = FRECUENCIAS.includes(defecto) ? defecto : "mensual";
    const r = await sincronizarCatalogo(leido.filas, frecuencia);
    await completarControlDesdePendientes(); // «Control desde» por defecto: mes más antiguo con estados cargados
    return {
      ...r,
      hoja: leido.hoja,
      filasLeidas: leido.filas.length,
      problemas: leido.problemas,
      variantes: leido.variantes,
      proveedores: Object.entries(contar(leido.filas.map((f) => f.proveedor)))
        .map(([nombre, filas]) => ({ nombre, filas }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      porSociedad: contar(leido.filas.map((f) => f.sociedad)),
      porCategoria: contar(leido.filas.map((f) => f.categoria)),
    };
  } finally {
    enCurso = false;
  }
}
