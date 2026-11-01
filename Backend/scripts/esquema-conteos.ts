import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { crearAdaptador } from "../src/conexion.js";

// Imprime SOLO el número de filas de cada tabla de DATABASE_URL (nombre de tabla y conteo): nada de contenido, ni la
// dirección de la base. Se ejecuta antes y después de una migración para comprobar que ninguna tabla existente cambió
// (la tabla de historia de migraciones suma una fila por cada migración nueva, y las tablas nuevas aparecen en 0).
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL: falló (variable vacía o ausente)");
  process.exit(1);
}
let cliente: PrismaClient | undefined;
try {
  cliente = new PrismaClient({ adapter: crearAdaptador(url) });
  const tablas = await cliente.$queryRaw<{ nombre: string }[]>`SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`;
  let total = 0;
  for (const t of tablas) {
    const nombre = t.nombre.replaceAll("`", "");
    const [{ n }] = await cliente.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM \`${nombre}\``);
    console.log(`${nombre}: ${n}`);
    total += Number(n);
  }
  console.log(`${tablas.length} tablas, ${total} filas en total`);
} catch (e) {
  const tipo = e instanceof Error ? ((e as { code?: string }).code ?? e.name) : "desconocido";
  console.log(`conteo: falló (${tipo})`);
  process.exitCode = 1;
} finally {
  await cliente?.$disconnect().catch(() => {});
}
