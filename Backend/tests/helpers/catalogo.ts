// Catálogos SINTÉTICOS con la estructura de la tabla de pagos frecuentes (cabecera en la fila 3).
// Proveedores e identificadores inventados; no derivan de datos reales.
import { prisma } from "../../src/db.js";
import { claveCategoria } from "../../src/domain/categorias.js";
import { libro, type Fila } from "./muestras.js";

/** El importador nunca crea categorías: las pruebas siembran las del catálogo sintético. */
export async function sembrarCategoriasDelCatalogo(nombres: string[] = ["Electricidad", "Telecom", "CCSS", "Cable", "Internet"]) {
  for (const nombre of nombres) {
    const nombreNormalizado = claveCategoria(nombre);
    await prisma.categoria.upsert({ where: { nombreNormalizado }, create: { nombre, nombreNormalizado }, update: {} });
  }
}

/** El importador nunca crea sociedades ni categorías: las pruebas siembran las del catálogo sintético. */
export async function sembrarSociedadesDelCatalogo(codigos: string[] = ["AAA", "BBB"]) {
  await sembrarCategoriasDelCatalogo();
  for (const codigo of codigos) await prisma.sociedad.upsert({ where: { codigo }, create: { codigo, nombreLargo: `Sociedad ${codigo}` }, update: {} });
}

export const CABECERA_CATALOGO: Fila = ["Sociedad", "Categoría", "Proveedor", "NISE / Cuenta / Identificador", "Última fecha de pago"];

export const FILAS_BASE: Fila[] = [
  ["AAA", "Electricidad", "Luz Uno", "00012345", "15 DIA"], // ceros a la izquierda
  ["AAA", "Electricidad", "Luz Uno", "00012346", "10 DIA"],
  ["AAA", "Telecom", "Fono Uno", "77777777", "01 DIA"],
  ["AAA", "Telecom", "Fono Dos", "77777777", "20 DIA"], // mismo identificador, otro proveedor
  ["BBB", "CCSS", "CCSS", "000999888777", "15 DIA"],
  ["BBB", "Electricidad", "Luz Dos", "CR12000000000000000001", "10 DIA"], // con formato de IBAN
];

/** Libro con dos filas de título vacías, la cabecera en la fila 3 y las filas dadas desde la 4. */
export function catalogo(filas: Fila[] = FILAS_BASE, opts: { cabecera?: Fila; hoja?: string } = {}) {
  const spec: Record<number, Fila> = { 3: opts.cabecera ?? CABECERA_CATALOGO };
  filas.forEach((f, i) => (spec[4 + i] = f));
  return libro([{ nombre: opts.hoja ?? "Hoja1", filas: spec }]);
}
