import { execSync } from "node:child_process";
import { vaciarBase } from "../../src/mantenimiento/vaciar-base.js";
import { exigirBaseDePruebas } from "../../src/config/proteccion-pruebas.js";

/**
 * Reinicia la base de pruebas: la borra, aplica las migraciones (asi tambien se prueban) y la siembra.
 * Solo corre si el nombre de la base de TEST_DATABASE_URL termina en _test.
 */
export async function prepararBaseDePruebas(): Promise<void> {
  const url = exigirBaseDePruebas(process.env.TEST_DATABASE_URL);
  await vaciarBase(url);
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx seed/seed.ts", { env, stdio: "ignore" });
}
