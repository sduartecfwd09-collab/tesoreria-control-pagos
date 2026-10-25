import "dotenv/config";
import { execSync } from "node:child_process";
import { exigirBaseDeDesarrollo } from "../src/config/proteccion-reinicio.js";
import { nombreDeBaseDe } from "../src/config/proteccion-pruebas.js";
import { vaciarBase } from "../src/mantenimiento/vaciar-base.js";

// Uso: npm run db:reiniciar
// Borra TODO el contenido de la base de desarrollo (DATABASE_URL), la recrea con las migraciones y la siembra
// (roles, sociedades del piloto, categorias y parametros). Despues se vuelven a cargar los datos:
// usuarios:cargar, sociedades:cargar y reimportar. Se niega a correr contra una base _test o de produccion.
let url: string;
try {
  url = exigirBaseDeDesarrollo(process.env.DATABASE_URL);
} catch (e) {
  console.error(e instanceof Error ? e.message : "No se pudo validar la base.");
  process.exit(1);
}
console.log(`Reiniciando la base de desarrollo «${nombreDeBaseDe(url)}»...`);
try {
  console.log("1/3 Borrando las tablas");
  await vaciarBase(url);
  const env = { ...process.env, DATABASE_URL: url };
  console.log("2/3 Aplicando las migraciones");
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  console.log("3/3 Sembrando roles, sociedades del piloto, categorias y parametros");
  execSync("npx tsx seed/seed.ts", { env, stdio: "inherit" });
  console.log("Base de desarrollo lista. Siguiente: npm run usuarios:cargar");
} catch {
  console.error("No se pudo reiniciar la base (revise que MySQL este encendido y que las migraciones apliquen).");
  process.exit(1);
}
