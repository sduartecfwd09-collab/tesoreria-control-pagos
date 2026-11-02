import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { relojSistema } from "../domain/reloj.js";
import { cruzarVencimientos } from "../vencimientos/cruce.js";
import { sincronizarVencimientos } from "../vencimientos/generar.js";

// Uso: npm run cruzar
// Deja el calendario al día y recalcula el estado de todos los vencimientos de la base de DATABASE_URL. Solo escribe
// en la base de datos (nunca en las carpetas de estados de cuenta ni del catálogo) e imprime SOLO conteos.
const base = nombreDeBase(env.DATABASE_URL);
if (base.endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: el cruce de datos reales va en la base de desarrollo.");
  process.exit(1);
}
const calendario = await sincronizarVencimientos(relojSistema);
const r = await cruzarVencimientos(relojSistema);
console.log(`Base: ${base}`);
console.log(`Calendario: ${calendario.creados} creados, ${calendario.actualizados} actualizados, ${calendario.eliminados} eliminados, ${calendario.protegidos} protegidos`);
console.log(`Cruce: ${r.vencimientos} vencimientos, ${r.cambiados} con estado nuevo`);
for (const [estado, n] of Object.entries(r.porEstado).sort()) console.log(`  ${estado}: ${n}`);
await prisma.$disconnect();
