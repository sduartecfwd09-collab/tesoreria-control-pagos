import { PrismaClient } from "../generated/prisma/client.js";
import { crearAdaptador } from "../conexion.js";

/**
 * Borra todas las tablas de la base de la dirección dada (incluida la historia de migraciones).
 * No comprueba el nombre de la base: quien la llama debe haber validado antes que es una base desechable
 * (exigirBaseDePruebas o exigirBaseDeDesarrollo).
 */
export async function vaciarBase(url: string): Promise<void> {
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
