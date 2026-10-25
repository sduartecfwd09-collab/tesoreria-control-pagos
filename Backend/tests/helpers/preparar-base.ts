import { execSync } from "node:child_process";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { crearAdaptador } from "../../src/conexion.js";
import { exigirBaseDePruebas } from "../../src/config/proteccion-pruebas.js";

/** Borra todas las tablas de la base de pruebas (incluida la historia de migraciones). */
async function vaciarBase(url: string) {
  const prisma = new PrismaClient({ adapter: crearAdaptador(url) });
  try {
    const tablas = await prisma.$queryRaw<{ nombre: string }[]>`SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = DATABASE()`;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of tablas) await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${t.nombre.replaceAll("`", "")}\``);
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    });
  } finally {
    await prisma.$disconnect();
  }
}

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
