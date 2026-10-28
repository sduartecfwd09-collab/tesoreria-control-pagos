import { readFile } from "node:fs/promises";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { rolDesdeTexto, normalizarNombrePersona } from "../domain/usuarios.js";
import { leerLibro } from "../ingest/lector.js";
import { leerUsuarios } from "../usuarios/cargar.js";

// Uso: npm run usuarios:verificar-rol -- "<parte del nombre>"
// Compara, para una persona, el rol escrito en el Excel de USUARIOS_FILE (solo lectura) con el rol que tiene en la base.
// Imprime SOLO el texto del rol y su interpretación: nunca nombres ni correos.
const buscado = normalizarNombrePersona(process.argv.slice(2).join(" "));
if (!buscado) {
  console.error('Indique parte del nombre: npm run usuarios:verificar-rol -- "nombre"');
  process.exit(1);
}
if (!env.USUARIOS_FILE) {
  console.error("USUARIOS_FILE no esta definida en .env");
  process.exit(1);
}
try {
  const filas = leerUsuarios(await leerLibro(await readFile(env.USUARIOS_FILE))).filter((f) => normalizarNombrePersona(f.nombre).includes(buscado));
  console.log(`Filas del Excel que coinciden: ${filas.length}`);
  for (const f of filas) {
    const rol = rolDesdeTexto(f.rol);
    console.log(`  rol escrito en el Excel: «${f.rol}» -> el sistema lo lee como: ${rol ?? "no es un rol conocido (la fila se ignora)"}`);
  }
  const enBase = await prisma.usuario.findMany({ where: { nombreNormalizado: { contains: buscado } }, select: { rol: { select: { nombre: true } } } });
  console.log(`Usuarios en la base que coinciden: ${enBase.length}`);
  for (const u of enBase) console.log(`  rol en la base: ${u.rol.nombre}`);
} catch (e) {
  console.error(e instanceof Error ? `No se pudo verificar: ${e.message}` : "No se pudo verificar");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
