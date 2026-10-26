import { prisma } from "../db.js";
import { DEFINICIONES } from "../domain/parametros.js";
import { claveCategoria } from "../domain/categorias.js";

export async function todasLasCategorias() {
  return prisma.categoria.findMany({ orderBy: { nombre: "asc" } });
}

export async function obtenerCategoriaPorId(id: number) {
  return prisma.categoria.findUnique({ where: { id } });
}

/** Crea la categoría y los parámetros que existen por categoría (con su valor inicial). */
export async function insertarCategoria(nombre: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.categoria.create({ data: { nombre, nombreNormalizado: claveCategoria(nombre) } });
    for (const d of DEFINICIONES.filter((x) => x.ambito === "categoria")) {
      await tx.parametro.create({ data: { clave: d.clave, valor: d.valorInicial, tipo: d.tipo, ambito: "categoria", categoriaId: c.id, descripcion: d.ayuda } });
    }
    return c;
  });
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

/** Borra una categoría sin uso junto con sus parámetros propios. Quien llama debe haber verificado permiso y uso. */
export async function eliminarCategoriaSinUso(id: number) {
  await prisma.$transaction([
    prisma.parametro.deleteMany({ where: { ambito: "categoria", categoriaId: id } }),
    prisma.categoria.delete({ where: { id } }),
  ]);
}
