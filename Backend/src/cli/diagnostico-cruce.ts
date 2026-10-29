import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { cargarUmbralesImagen } from "../ingest/umbrales-imagen.js";
import { cruzar } from "../domain/cruce.js";
import { resumirImagenes } from "../domain/imagenes.js";
import { relojSistema } from "../domain/reloj.js";
import { listarArchivos } from "../repositories/consultas.js";
import { cargarDescripcionesPorSociedad, categoriasPorObligacion, contarCuentasPorMoneda, creditosParaDiagnostico, debitosParaFormato, primerasFechasPorCuenta } from "../repositories/cruce.js";
import { listarSociedades } from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";
import { cruzarVencimientos } from "../vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../vencimientos/diagnostico.js";
import { informeAdicionalCruce } from "../vencimientos/diagnostico-adicional.js";
import { DIAS_LEJOS_DEFECTO, informeMargenCruce } from "../vencimientos/diagnostico-margen.js";

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
console.log(`Base: ${base}`);
const lejos = Number(await valorGlobal("diagnostico_dias_lejos"));
const diasLejos = Number.isInteger(lejos) && lejos > 0 ? lejos : DIAS_LEJOS_DEFECTO;
const umbralesImagen = await cargarUmbralesImagen();
const avisoDias = Number(await valorGlobal("aviso_datos_dias"));
const sociedades = (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo, nombreLargo: s.nombreLargo }));
const archivos = (await listarArchivos()).filter((a) => a.retiradoEn === null);
console.log(informeDiagnosticoCruce(r, sociedades, await contarCuentasPorMoneda(), Number.isInteger(avisoDias) ? avisoDias : 5, resumirImagenes(archivos)));
console.log(informeAdicionalCruce(r, sociedades, { descripcionesPorSociedad: await cargarDescripcionesPorSociedad(), primeraFechaPorCuenta: await primerasFechasPorCuenta(), archivos }));
console.log("", "\nMARGEN DE BUSQUEDA");
console.log(informeMargenCruce(r, { diasDespues: DIAS_DESPUES_ANTERIOR, resultados: anterior.resultados }, sociedades, { categorias: await categoriasPorObligacion(), debitosFormato: await debitosParaFormato(), creditos: await creditosParaDiagnostico(), archivos, diasLejos, umbralesImagen }));
await prisma.$disconnect();
