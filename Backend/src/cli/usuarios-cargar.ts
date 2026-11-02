import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { ErrorLectura } from "../ingest/lector.js";
import { cargarUsuariosDesdeArchivo, textoInformeUsuarios } from "../usuarios/cargar.js";
import { prisma } from "../db.js";

// Uso: npm run usuarios:cargar
// Lee el Excel de USUARIOS_FILE (solo lectura) y crea o actualiza usuarios en la base de DATABASE_URL.
// Imprime SOLO conteos: nunca correos ni nombres. Se puede repetir sin duplicar.
if (!env.USUARIOS_FILE) {
  console.error("USUARIOS_FILE no esta definida en .env");
  process.exit(1);
}
if (nombreDeBase(env.DATABASE_URL).endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: la carga de usuarios reales va en la base de desarrollo.");
  process.exit(1);
}
try {
  console.log(textoInformeUsuarios(await cargarUsuariosDesdeArchivo(env.USUARIOS_FILE)));
} catch (e) {
  console.error(e instanceof ErrorLectura || e instanceof Error ? `No se pudo cargar: ${e.message}` : "No se pudo cargar los usuarios");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
