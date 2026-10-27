import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { cruzar } from "../domain/cruce.js";
import { resumirImagenes } from "../domain/imagenes.js";
import { relojSistema } from "../domain/reloj.js";
import { listarArchivos } from "../repositories/consultas.js";
import { cargarDescripcionesPorSociedad, categoriasPorObligacion, contarCuentasPorMoneda, debitosParaFormato, primerasFechasPorCuenta } from "../repositories/cruce.js";
import { listarSociedades } from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";
import { cruzarVencimientos } from "../vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../vencimientos/diagnostico.js";
import { informeAdicionalCruce } from "../vencimientos/diagnostico-adicional.js";
import { informeMargenCruce } from "../vencimientos/diagnostico-margen.js";

// Uso: npm run cruzar:diagnostico
// Recalcula el cruce de la base de DATABASE_URL e imprime SOLO conteos y fechas agregadas por sociedad y mes:
// nunca descripciones, montos ni cuentas; los identificadores solo enmascarados a sus últimos 4 dígitos (lista del punto 8
// del bloque «margen»); los proveedores solo donde el informe los pide. Solo escribe en la base de datos.
// «Antes» de las cifras del margen = el mismo cruce con los días después de la versión anterior, calculado en memoria.
const DIAS_DESPUES_ANTERIOR = 3;
const base = nombreDeBase(env.DATABASE_URL);
if (base.endsWith("_test")) {
  console.error("DATABASE_URL apunta a una base _test: el diagnóstico de datos reales va en la base de desarrollo.");
  process.exit(1);
}
const r = await cruzarVencimientos(relojSistema);
const anterior = cruzar({ ...r.datos, ...r.parametros, diasDespues: DIAS_DESPUES_ANTERIOR });
const porEstadoAnterior: Record<string, number> = {};
for (const q of anterior.resultados) porEstadoAnterior[q.estado] = (porEstadoAnterior[q.estado] ?? 0) + 1;
console.log(`Base: ${base}`);
const avisoDias = Number(await valorGlobal("aviso_datos_dias"));
const sociedades = (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo, nombreLargo: s.nombreLargo }));
const archivos = (await listarArchivos()).filter((a) => a.retiradoEn === null);
console.log(informeDiagnosticoCruce(r, sociedades, await contarCuentasPorMoneda(), Number.isInteger(avisoDias) ? avisoDias : 5, resumirImagenes(archivos)));
console.log(informeAdicionalCruce(r, sociedades, { descripcionesPorSociedad: await cargarDescripcionesPorSociedad(), primeraFechaPorCuenta: await primerasFechasPorCuenta(), archivos }));
console.log("", "\nMARGEN DE BUSQUEDA");
console.log(informeMargenCruce(r, { diasDespues: DIAS_DESPUES_ANTERIOR, porEstado: porEstadoAnterior }, sociedades, { categorias: await categoriasPorObligacion(), debitosFormato: await debitosParaFormato() }));
await prisma.$disconnect();
