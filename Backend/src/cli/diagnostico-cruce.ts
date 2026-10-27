import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { resumirImagenes } from "../domain/imagenes.js";
import { relojSistema } from "../domain/reloj.js";
import { listarArchivos } from "../repositories/consultas.js";
import { cargarDescripcionesPorSociedad, contarCuentasPorMoneda, primerasFechasPorCuenta } from "../repositories/cruce.js";
import { listarSociedades } from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";
import { cruzarVencimientos } from "../vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../vencimientos/diagnostico.js";
import { informeAdicionalCruce } from "../vencimientos/diagnostico-adicional.js";

// Uso: npm run cruzar:diagnostico
// Recalcula el cruce de la base de DATABASE_URL e imprime SOLO conteos y fechas agregadas por sociedad y mes:
// nunca descripciones, montos, identificadores ni cuentas (los proveedores solo en el punto 2 del bloque adicional,
// que los pide por sociedad y proveedor). Solo escribe en la base de datos.
const base = nombreDeBase(env.DATABASE_URL);
if (base.endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: el diagnóstico de datos reales va en la base de desarrollo.");
  process.exit(1);
}
const r = await cruzarVencimientos(relojSistema);
console.log(`Base: ${base}`);
const avisoDias = Number(await valorGlobal("aviso_datos_dias"));
const sociedades = (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo, nombreLargo: s.nombreLargo }));
const archivos = (await listarArchivos()).filter((a) => a.retiradoEn === null);
console.log(informeDiagnosticoCruce(r, sociedades, await contarCuentasPorMoneda(), Number.isInteger(avisoDias) ? avisoDias : 5, resumirImagenes(archivos)));
console.log(informeAdicionalCruce(r, sociedades, { descripcionesPorSociedad: await cargarDescripcionesPorSociedad(), primeraFechaPorCuenta: await primerasFechasPorCuenta(), archivos }));
await prisma.$disconnect();
