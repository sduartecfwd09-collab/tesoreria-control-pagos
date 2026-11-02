import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { cargarSociedadesDesdeArchivo, textoInformeSociedades } from "../sociedades/cargar.js";
import { prisma } from "../db.js";

// Uso: npm run sociedades:cargar
// Lee el Excel de SOCIEDADES_FILE (solo lectura), crea las sociedades que falten (sin abreviatura) y asigna a cada
// una su tesorero entre los usuarios ya cargados. Imprime SOLO conteos. Se puede repetir sin duplicar.
if (!env.SOCIEDADES_FILE) {
  console.error("SOCIEDADES_FILE no esta definida en .env");
  process.exit(1);
}
if (nombreDeBase(env.DATABASE_URL).endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: la carga de sociedades reales va en la base de desarrollo.");
  process.exit(1);
}
try {
  console.log(textoInformeSociedades(await cargarSociedadesDesdeArchivo(env.SOCIEDADES_FILE)));
} catch (e) {
  console.error(e instanceof Error ? `No se pudo cargar: ${e.message}` : "No se pudo cargar las sociedades");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
