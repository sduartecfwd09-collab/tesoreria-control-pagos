import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { crearAdaptador } from "../src/conexion.js";

// Comprueba la conexión a las tres bases y dice solo «conectó» o «falló» (con el tipo de error).
// Nunca imprime la dirección, el usuario, la clave ni el mensaje del error (puede contenerlos).
const bases = ["DATABASE_URL", "TEST_DATABASE_URL", "SHADOW_DATABASE_URL"] as const;
let fallos = 0;

for (const variable of bases) {
  const url = process.env[variable];
  if (!url) {
    console.log(`${variable}: falló (variable vacía o ausente)`);
    fallos++;
    continue;
  }
  let cliente: PrismaClient | undefined;
  try {
    cliente = new PrismaClient({ adapter: crearAdaptador(url) });
    await cliente.$queryRaw`SELECT 1`;
    console.log(`${variable}: conectó`);
  } catch (e) {
    const tipo = e instanceof Error ? ((e as { code?: string }).code ?? e.name) : "desconocido";
    console.log(`${variable}: falló (${tipo})`);
    fallos++;
  } finally {
    await cliente?.$disconnect().catch(() => {});
  }
}
process.exit(fallos ? 1 : 0);
