import { prisma } from "../db.js";
import { normalizar } from "../ingest/utiles.js";

export interface ParametroFila {
  id: number;
  clave: string;
  valor: string;
  tipo: string;
  ambito: string;
  categoriaId: number;
  categoria: string | null;
  descripcion: string | null;
  actualizado: Date;
}

export async function listarParametros(): Promise<ParametroFila[]> {
  const [filas, cats] = await Promise.all([
    prisma.parametro.findMany({ orderBy: [{ ambito: "asc" }, { clave: "asc" }, { categoriaId: "asc" }] }),
    prisma.categoria.findMany(),
  ]);
  const nombres = new Map(cats.map((c) => [c.id, c.nombre]));
  return filas.map((p) => ({
    id: p.id, clave: p.clave, valor: p.valor, tipo: p.tipo, ambito: p.ambito,
    categoriaId: p.categoriaId, categoria: nombres.get(p.categoriaId) ?? null,
    descripcion: p.descripcion, actualizado: p.actualizado,
  }));
}

export async function obtenerParametro(id: number) {
  return prisma.parametro.findUnique({ where: { id } });
}

/** Valor de un parámetro global, o null si no existe. */
export async function valorGlobal(clave: string): Promise<string | null> {
  const p = await prisma.parametro.findUnique({ where: { clave_ambito_categoriaId: { clave, ambito: "global", categoriaId: 0 } } });
  return p?.valor ?? null;
}

export async function actualizarValor(id: number, valor: string) {
  return prisma.parametro.update({ where: { id }, data: { valor } });
}

/** Crea el parámetro si falta. No pisa valores que Tesorería ya editó: solo refresca la descripción. */
export async function asegurarParametro(d: {
  clave: string; valor: string; tipo: string; ambito: string; categoriaId: number; descripcion: string;
}) {
  return prisma.parametro.upsert({
    where: { clave_ambito_categoriaId: { clave: d.clave, ambito: d.ambito, categoriaId: d.categoriaId } },
    create: d,
    update: { descripcion: d.descripcion },
  });
}

/** "Cable" y "CABLE" son la misma categoria: se busca por el nombre normalizado y se conserva la primera forma. */
export async function asegurarCategoria(nombre: string) {
  const nombreNormalizado = normalizar(nombre);
  return prisma.categoria.upsert({ where: { nombreNormalizado }, create: { nombre, nombreNormalizado }, update: {} });
}

export async function contarParametros() {
  return prisma.parametro.count();
}

/** Guarda un dato interno en la tabla de parámetros (crea o actualiza). No es un parámetro editable: no tiene definición. */
export async function guardarValorGlobal(clave: string, valor: string, tipo = "texto") {
  return prisma.parametro.upsert({
    where: { clave_ambito_categoriaId: { clave, ambito: "global", categoriaId: 0 } },
    create: { clave, valor, tipo, ambito: "global", categoriaId: 0 },
    update: { valor },
  });
}

/** Cuándo se calcularon por última vez los estados de los vencimientos (ISO), o null si nunca. */
export async function ultimoCalculoDeEstados(): Promise<string | null> {
  return valorGlobal(CLAVE_CALCULO_ESTADOS);
}

export const CLAVE_CALCULO_ESTADOS = "estados_calculados_en";
