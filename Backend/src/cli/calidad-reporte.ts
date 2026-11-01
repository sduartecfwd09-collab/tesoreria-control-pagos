import { resolve } from "node:path";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { aNumero } from "../domain/montos.js";
import { calidadCatalogo, responsableEfectivo } from "../domain/obligaciones.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { listarSociedades, sociedadesConEstados, todasLasObligaciones } from "../repositories/obligaciones.js";
import { relojSistema } from "../domain/reloj.js";
import { carpetaPermitida, fechaDeReporte, guardarReporte, reporteDeCalidad } from "../reportes/calidad.js";

// Uso: npm run calidad:reporte
// Escribe un archivo Markdown con los pendientes de calidad del catálogo (de TODO el sistema, no de una persona) en la carpeta
// `resultados/` de Backend (ignorada por git) o en la indicada en RESULTADOS_DIR. No envía nada. La consola solo muestra conteos y la ruta.
const carpeta = resolve(process.env.RESULTADOS_DIR ?? "resultados");
if (!carpetaPermitida(carpeta, [env.STATEMENTS_ROOT, env.CATALOGO_FILE])) {
  console.error("La carpeta del reporte no puede estar en la de los estados de cuenta ni en la del catálogo (son de solo lectura).");
  process.exit(1);
}
const [obs, sociedades, conEstados] = await Promise.all([todasLasObligaciones(), listarSociedades(), sociedadesConEstados()]);
const c = calidadCatalogo(
  obs.map((o) => ({ ...o, sociedad: etiquetaSociedad(o.sociedad), montoEsperado: aNumero(o.montoEsperado), responsable: responsableEfectivo(o).nombre })),
  sociedades.map((s) => ({ nombre: etiquetaSociedad(s), conEstados: conEstados.has(s.id) })),
);
const fecha = fechaDeReporte(relojSistema);
const ruta = guardarReporte(carpeta, fecha, reporteDeCalidad(c, fecha));
console.log(`Reporte escrito en ${ruta}`);
console.log(`  Identificadores repetidos: ${c.identificadoresRepetidos.length} · con formato de IBAN: ${c.formatoIban.length} · sociedades sin obligaciones: ${c.sociedadesSinObligaciones.length + c.sociedadesSinEstadosNiObligaciones.length} · frecuencia sin confirmar: ${c.frecuenciaPorConfirmar}`);
await prisma.$disconnect();
