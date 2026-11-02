import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { prisma } from "../db.js";
import { simularCruce, textoSimulacion } from "../vencimientos/simular.js";

// Uso: npm run cruzar:simular -- AAAA-MM-DD
// Imprime las cifras por estado del cruce con ese «hoy». SOLO LEE la base de DATABASE_URL: no escribe nada, no genera
// vencimientos y no tiene pantalla. Imprime solo conteos.
const texto = process.argv[2] ?? "";
const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
const hoy = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
if (!hoy || Number.isNaN(hoy.getTime()) || hoy.toISOString().slice(0, 10) !== texto) {
  console.error("Indique la fecha simulada como AAAA-MM-DD: npm run cruzar:simular -- 2026-11-05");
  process.exit(1);
}
console.log(`Base: ${nombreDeBase(env.DATABASE_URL)}`);
try {
  console.log(textoSimulacion(await simularCruce(hoy)));
} finally {
  await prisma.$disconnect();
}
