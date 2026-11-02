// De dónde sale «lo que dice el Excel»: se lee el archivo del catálogo (CATALOGO_FILE) bajo demanda; no se guarda nada de él. La lectura se guarda en
// memoria mientras el archivo no cambie (misma fecha de modificación y tamaño), para que la pantalla y su contador no lo relean cada vez. Solo lectura.
import { readFile, stat } from "node:fs/promises";
import { leerCatalogo, type FilaCatalogo } from "../catalogo/lector.js";
import { codigoPorAlias } from "../config/alias-sociedades.js";
import { env } from "../config/env.js";
import { claveCategoria } from "../domain/categorias.js";
import type { FilaExcel } from "../domain/diferencias-excel.js";
import { resolutorDeSociedades } from "../domain/sociedades.js";
import { leerLibro } from "../ingest/lector.js";
import { categoriasParaResolver, sociedadesParaResolver } from "../repositories/diferencias.js";

/** Las filas del catálogo, o null si no hay archivo configurado o no se puede leer (la pantalla lo dice sin exponer la ruta). */
export type FuenteDeFilas = () => Promise<FilaCatalogo[] | null>;

let memoria: { ruta: string; marca: string; filas: FilaCatalogo[] } | null = null;

export const filasDelArchivo: FuenteDeFilas = async () => {
  const ruta = env.CATALOGO_FILE;
  if (!ruta) return null;
  try {
    const s = await stat(ruta);
    const marca = `${s.mtimeMs}|${s.size}`;
    if (memoria && memoria.ruta === ruta && memoria.marca === marca) return memoria.filas;
    const filas = leerCatalogo(await leerLibro(await readFile(ruta))).filas;
    memoria = { ruta, marca, filas };
    return filas;
  } catch {
    return null;
  }
};

/** Resuelve las filas con la misma regla del importador: sociedad (código o alias) y categoría de la plataforma; las que no coinciden no se comparan. */
export async function resolverFilas(filas: FilaCatalogo[]): Promise<FilaExcel[]> {
  const resolver = resolutorDeSociedades(await sociedadesParaResolver(), codigoPorAlias);
  const categorias = new Map((await categoriasParaResolver()).map((c) => [claveCategoria(c.nombre), c.id]));
  const salida: FilaExcel[] = [];
  for (const f of filas) {
    const sociedadId = resolver(f.sociedad);
    const categoriaId = categorias.get(claveCategoria(f.categoria));
    if (sociedadId == null || categoriaId === undefined) continue;
    salida.push({ sociedadId, categoriaId, proveedor: f.proveedor, identificador: f.identificador, dia: f.dia });
  }
  return salida;
}
