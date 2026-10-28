import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { inspeccionarSaldo } from "../ingest/inspeccionar-saldo.js";

// Uso: npm run archivos:inspeccionar-saldo -- "<nombre del archivo>"
// SOLO LECTURA. Busca el archivo entre los registrados en la base (por el final de su ruta) y lo abre desde STATEMENTS_ROOT.
// Imprime únicamente posiciones, «sí/no» y conteos: nunca montos, nombres de personas ni números completos de cuenta.
const buscado = process.argv.slice(2).join(" ").trim().toLowerCase();
if (!buscado) {
  console.error('Indique el nombre del archivo: npm run archivos:inspeccionar-saldo -- "nombre.xlsx"');
  process.exit(1);
}
if (!env.STATEMENTS_ROOT) {
  console.error("STATEMENTS_ROOT no esta definida en .env");
  process.exit(1);
}
try {
  const registrados = await prisma.archivoImportado.findMany({ where: { retiradoEn: null }, select: { ruta: true } });
  const coinciden = registrados.filter((a) => a.ruta.toLowerCase().endsWith(buscado));
  if (coinciden.length !== 1) {
    console.error(coinciden.length === 0 ? "No hay un archivo registrado con ese nombre." : `Hay ${coinciden.length} archivos con ese nombre: escriba la ruta completa (carpeta/nombre).`);
    process.exitCode = 1;
  } else {
    const ruta = coinciden[0]!.ruta;
    const contenido = await readFile(path.join(env.STATEMENTS_ROOT, ruta));
    console.log((await inspeccionarSaldo(contenido, path.basename(ruta))).join("\n"));
  }
} catch (e) {
  console.error(e instanceof Error ? `No se pudo inspeccionar: ${e.message}` : "No se pudo inspeccionar el archivo");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
