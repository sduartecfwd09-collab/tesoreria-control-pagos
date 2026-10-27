import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { relojSistema } from "../domain/reloj.js";
import { contarCuentasPorMoneda } from "../repositories/cruce.js";
import { valorGlobal } from "../repositories/parametros.js";
import { listarSociedades } from "../repositories/obligaciones.js";
import { cruzarVencimientos } from "../vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../vencimientos/diagnostico.js";

// Uso: npm run cruzar:diagnostico
// Recalcula el cruce de la base de DATABASE_URL e imprime SOLO conteos y fechas agregadas por sociedad y mes:
// nunca descripciones, montos, identificadores, proveedores ni cuentas. Solo escribe en la base de datos.
const base = nombreDeBase(env.DATABASE_URL);
if (base.endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: el diagnóstico de datos reales va en la base de desarrollo.");
  process.exit(1);
}
const r = await cruzarVencimientos(relojSistema);
console.log(`Base: ${base}`);
const avisoDias = Number(await valorGlobal("aviso_datos_dias"));
console.log(informeDiagnosticoCruce(r, await listarSociedades(), await contarCuentasPorMoneda(), Number.isInteger(avisoDias) ? avisoDias : 5));
await prisma.$disconnect();
