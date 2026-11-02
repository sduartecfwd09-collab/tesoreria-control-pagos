import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { relojSistema } from "../domain/reloj.js";
import { movimientosParaGrupos } from "../repositories/cruce.js";
import { listarSociedades } from "../repositories/obligaciones.js";
import { cruzarVencimientos } from "../vencimientos/cruce.js";
import { informeGruposCompartidos } from "../vencimientos/diagnostico-grupos.js";

// Uso: npm run cruzar:grupos
// Diagnóstico de las obligaciones de una misma sociedad que comparten número de servicio: estado de cada vencimiento por mes,
// fecha y rótulo (con los números largos enmascarados) de los movimientos con ese número, y si se reconoce el nombre del
// proveedor. Nunca imprime el número de servicio, montos ni cuentas. Solo escribe en la base de datos (recalcula el cruce).
const base = nombreDeBase(env.DATABASE_URL);
if (base.endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: el diagnóstico de datos reales va en la base de desarrollo.");
  process.exit(1);
}
const r = await cruzarVencimientos(relojSistema);
const sociedades = (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo }));
console.log(`Base: ${base}`);
console.log(informeGruposCompartidos(r, sociedades, await movimientosParaGrupos()));
await prisma.$disconnect();
