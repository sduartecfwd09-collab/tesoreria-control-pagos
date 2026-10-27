import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { relojSistema } from "../domain/reloj.js";
import { contarCuentasPorMoneda } from "../repositories/cruce.js";
import { valorGlobal } from "../repositories/parametros.js";
import { resumirImagenes } from "../domain/imagenes.js";
import { listarArchivos } from "../repositories/consultas.js";
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
const sociedades = (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo, nombreLargo: s.nombreLargo }));
console.log(informeDiagnosticoCruce(r, sociedades, await contarCuentasPorMoneda(), Number.isInteger(avisoDias) ? avisoDias : 5, resumirImagenes((await listarArchivos()).filter((a) => a.retiradoEn === null))));
await prisma.$disconnect();
