import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { enmascararCuenta, nombreDeArchivoSeguro } from "../domain/enmascarar.js";
import { buscarArchivos, leerArgumentos } from "../ingest/buscar-archivo.js";
import { inspeccionarSaldo } from "../ingest/inspeccionar-saldo.js";

// Uso: npm run archivos:inspeccionar-saldo -- "<parte del nombre>"   o   npm run archivos:inspeccionar-saldo -- --id <número>
// SOLO LECTURA. Busca entre los archivos registrados en la base (por una parte del nombre, sin importar mayúsculas,
// extensión ni carpeta) y abre el elegido desde STATEMENTS_ROOT. Imprime únicamente posiciones, «sí/no» y conteos:
// nunca montos, nombres de personas ni números completos de cuenta (los nombres de archivo salen con los números enmascarados).
const { id, texto, idInvalido } = leerArgumentos(process.argv.slice(2));
if (idInvalido || (id === null && !texto)) {
  console.error('Indique parte del nombre del archivo o su número: npm run archivos:inspeccionar-saldo -- "parte del nombre"  (o  -- --id 12)');
  process.exit(1);
}
if (!env.STATEMENTS_ROOT) {
  console.error("STATEMENTS_ROOT no esta definida en .env");
  process.exit(1);
}
try {
  const registrados = await prisma.archivoImportado.findMany({
    where: { retiradoEn: null },
    select: { id: true, ruta: true, mes: true, cuenta: { select: { numero: true } }, sociedad: { select: { codigo: true } } },
    orderBy: { ruta: "asc" },
  });
  const descripcion = (a: (typeof registrados)[number]) =>
    `id ${a.id} · ${nombreDeArchivoSeguro(a.ruta)} · cuenta ${a.cuenta ? enmascararCuenta(a.cuenta.numero) : "sin cuenta"} · mes ${a.mes ?? "sin mes"}`;

  const elegido = id !== null ? registrados.find((a) => a.id === id) : undefined;
  const candidatos = id !== null ? (elegido ? [elegido] : []) : buscarArchivos(registrados, texto);
  if (candidatos.length === 0) {
    console.error(id !== null ? `No hay un archivo registrado con el número ${id}.` : `Ningún archivo registrado contiene «${texto}» en su nombre.`);
    console.error(`Hay ${registrados.length} archivos registrados. Así se guardan sus nombres (ejemplos):`);
    for (const a of registrados.slice(0, 3)) console.error(`  ${nombreDeArchivoSeguro(a.ruta)}`);
    console.error("Pruebe con una parte más corta del nombre (por ejemplo los últimos dígitos de la cuenta y el mes).");
    process.exitCode = 1;
  } else if (candidatos.length > 1) {
    console.error(`Hay ${candidatos.length} archivos que coinciden. Repita el comando con --id <número>:`);
    candidatos.forEach((a, i) => console.error(`  ${i + 1}) ${descripcion(a)}`));
    process.exitCode = 1;
  } else {
    const a = candidatos[0]!;
    console.log(`Archivo: ${descripcion(a)}`);
    const contenido = await readFile(path.join(env.STATEMENTS_ROOT, ...a.ruta.split("/")));
    console.log((await inspeccionarSaldo(contenido, path.basename(a.ruta))).join("\n"));
  }
} catch (e) {
  console.error(e instanceof Error ? `No se pudo inspeccionar: ${e.message}` : "No se pudo inspeccionar el archivo");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
