import { env } from "../config/env.js";
import { importarCarpeta } from "../ingest/importar-carpeta.js";
import { informeImportacion } from "../ingest/informe.js";
import { prisma } from "../db.js";

// Uso: npm run importar [-- --informe]   (solo imprime conteos y rutas, nunca descripciones de movimientos)
if (!env.STATEMENTS_ROOT) {
  console.error("STATEMENTS_ROOT no está definida en .env");
  process.exit(1);
}
if (!process.argv.includes("--solo-informe")) {
  const r = await importarCarpeta(env.STATEMENTS_ROOT);
  console.log(`Importación: ${r.leidos} leídos, ${r.conError} con error, ${r.sinCambios} sin cambios; ${r.movimientos} movimientos (${r.duplicados} duplicados entre archivos)`);
}
console.log(await informeImportacion());
await prisma.$disconnect();
