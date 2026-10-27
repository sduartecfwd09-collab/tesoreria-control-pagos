import { prisma } from "../db.js";
import { claveCategoria } from "../domain/categorias.js";

export async function todasLasCategorias() {
  return prisma.categoria.findMany({ orderBy: { nombre: "asc" } });
}

export async function obtenerCategoriaPorId(id: number) {
  return prisma.categoria.findUnique({ where: { id } });
}

export async function insertarCategoria(nombre: string) {
  return prisma.categoria.create({ data: { nombre, nombreNormalizado: claveCategoria(nombre) } });
}

export async function marcarCategoriaInactiva(id: number) {
  return prisma.categoria.update({ where: { id }, data: { activa: false } });
}

/** Cuántas obligaciones y vencimientos usan la categoría (activos o no). */
export async function usoDeCategoria(id: number): Promise<{ obligaciones: number; vencimientos: number }> {
  const [obligaciones, vencimientos] = await Promise.all([
    prisma.obligacion.count({ where: { categoriaId: id } }),
    prisma.vencimiento.count({ where: { categoriaId: id } }),
  ]);
  return { obligaciones, vencimientos };
}

/** Borra una categoría sin uso. Quien llama debe haber verificado permiso y uso. */
export async function eliminarCategoriaSinUso(id: number) {
  await prisma.categoria.delete({ where: { id } });
}
