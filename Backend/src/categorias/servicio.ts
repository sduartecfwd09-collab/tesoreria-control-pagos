// Servicios de categorías. Solo Jefatura crea, desactiva y borra. Reciben a quien actúa y verifican el permiso: no hay
// ruta HTTP ni pantalla (la identidad llega con el inicio de sesión, Hito 4A).
import { compararNombre, nombreCategoriaLimpio } from "../domain/categorias.js";
import { ErrorDeServicio, puedeAdministrarCategorias } from "../domain/permisos.js";
import {
  eliminarCategoriaSinUso, insertarCategoria, marcarCategoriaInactiva, obtenerCategoriaPorId, todasLasCategorias, usoDeCategoria,
} from "../repositories/categorias.js";
import { obtenerActor } from "../repositories/usuarios.js";

const SOLO_JEFATURA = "Solo Jefatura puede administrar las categorías";

async function exigirJefatura(actorId: number) {
  const actor = await obtenerActor(actorId);
  if (!actor || !puedeAdministrarCategorias(actor)) throw new ErrorDeServicio("permiso", SOLO_JEFATURA);
  return actor;
}

export type ResultadoCrearCategoria =
  | { creada: { id: number; nombre: string } }
  | { sugerencias: string[]; mensaje: string };

/**
 * Crea una categoría. Si el nombre es igual a una existente (sin distinguir mayúsculas, tildes ni espacios) falla; si
 * es casi igual a alguna devuelve «¿quisiste decir…?» sin crear, y solo se crea si se repite con `confirmarNueva`.
 */
export async function crearCategoria(d: { actorId: number; nombre: unknown; confirmarNueva?: boolean }): Promise<ResultadoCrearCategoria> {
  await exigirJefatura(d.actorId);
  const nombre = nombreCategoriaLimpio(d.nombre);
  if (!nombre) throw new ErrorDeServicio("validacion", "Indique el nombre de la categoría (entre 2 y 100 caracteres)");
  const existentes = (await todasLasCategorias()).map((c) => c.nombre);
  const r = compararNombre(nombre, existentes);
  if (r.tipo === "igual") throw new ErrorDeServicio("conflicto", `Ya existe la categoría «${r.existente}»`);
  if (r.tipo === "parecidas" && !d.confirmarNueva) {
    return { sugerencias: r.existentes, mensaje: `¿Quiso decir ${r.existentes.map((e) => `«${e}»`).join(" o ")}?` };
  }
  const c = await insertarCategoria(nombre);
  return { creada: { id: c.id, nombre: c.nombre } };
}

/** Las categorías no se borran: se desactivan (las obligaciones y los vencimientos que ya la usan se conservan). */
export async function desactivarCategoria(d: { actorId: number; categoriaId: number }): Promise<void> {
  await exigirJefatura(d.actorId);
  if (!(await obtenerCategoriaPorId(d.categoriaId))) throw new ErrorDeServicio("no_encontrado", "Categoría no encontrada");
  await marcarCategoriaInactiva(d.categoriaId);
}

/** El borrado lo decide solo Jefatura y solo si la categoría no tiene obligaciones ni vencimientos. */
export async function borrarCategoria(d: { actorId: number; categoriaId: number }): Promise<void> {
  await exigirJefatura(d.actorId);
  if (!(await obtenerCategoriaPorId(d.categoriaId))) throw new ErrorDeServicio("no_encontrado", "Categoría no encontrada");
  const uso = await usoDeCategoria(d.categoriaId);
  if (uso.obligaciones > 0 || uso.vencimientos > 0) {
    throw new ErrorDeServicio("conflicto", "La categoría tiene obligaciones o vencimientos: no se puede borrar, solo desactivar");
  }
  await eliminarCategoriaSinUso(d.categoriaId);
}
