import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { importarCarpeta } from "../ingest/importar-carpeta.js";
import { informeConteos } from "../ingest/informe-conteos.js";
import { listarArchivos, contarMovimientosPorArchivo } from "../repositories/consultas.js";
import { prisma } from "../db.js";

// Uso: npm run reimportar
// Importa los estados de cuenta de STATEMENTS_ROOT (solo lectura) en la base de DATABASE_URL e imprime
// SOLO conteos: nunca rutas, cuentas, montos, beneficiarios ni descripciones. Se puede repetir sin duplicar.
if (!env.STATEMENTS_ROOT) {
  console.error("STATEMENTS_ROOT no esta definida en .env");
  process.exit(1);
}
const base = nombreDeBase(env.DATABASE_URL);
if (base.endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: la importacion de datos reales va en la base de desarrollo.");
  process.exit(1);
}

const r = await importarCarpeta(env.STATEMENTS_ROOT);
const porArchivo = await contarMovimientosPorArchivo();
const filas = (await listarArchivos()).filter((a) => a.retiradoEn === null).map((a) => ({
  sociedad: a.sociedad, mes: a.mes, estado: a.estado, error: a.error, motivo: a.motivo, movimientos: porArchivo.get(a.id) ?? 0,
}));
console.log(informeConteos(base, r, filas));
await prisma.$disconnect();
