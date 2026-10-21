import { env } from "../config/env.js";
import { importarCatalogo } from "../catalogo/importar.js";
import { calidadCatalogo } from "../domain/obligaciones.js";
import { listarSociedades, todasLasObligaciones } from "../repositories/obligaciones.js";
import { prisma } from "../db.js";

// Uso: npm run catalogo   (imprime conteos, proveedores y números de fila; nunca identificadores)
if (!env.CATALOGO_FILE) {
  console.error("CATALOGO_FILE no está definida en .env");
  process.exit(1);
}
const r = await importarCatalogo(env.CATALOGO_FILE);
const lineas = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `  ${k}: ${n}`).join("\n");

console.log(`Catálogo (hoja «${r.hoja}»): ${r.filasLeidas} filas leídas · ${r.creadas} creadas, ${r.actualizadas} actualizadas, ${r.sinCambios} sin cambios, ${r.noEnArchivo} ya no están en el archivo`);
console.log(`Por sociedad:\n${lineas(r.porSociedad)}`);
console.log(`Por categoría:\n${lineas(r.porCategoria)}`);
console.log(`Proveedores distintos (${r.proveedores.length}):\n${r.proveedores.map((p) => `  ${p.nombre}: ${p.filas}`).join("\n")}`);
console.log(r.variantes.length ? `Variantes del mismo nombre:\n${r.variantes.map((v) => `  ${v.campo} «${v.nombre}» también escrito: ${v.variantes.join(", ")}`).join("\n")}` : "Variantes del mismo nombre: ninguna");
console.log(r.problemas.length ? `Filas con problemas (${r.problemas.length}):\n${r.problemas.map((p) => `  fila ${p.fila}: ${p.motivo}`).join("\n")}` : "Filas con problemas: ninguna");

const [obs, sociedades] = await Promise.all([todasLasObligaciones(), listarSociedades()]);
const c = calidadCatalogo(obs.map((o) => ({ ...o, sociedad: o.sociedad.codigo })), sociedades.map((s) => s.codigo));
console.log("Alertas de calidad:");
for (const g of c.identificadoresRepetidos) console.log(`  ${g.sociedad}: 1 identificador con ${g.proveedores.length} proveedores (${g.proveedores.join(", ")})`);
for (const o of c.formatoIban) console.log(`  ${o.sociedad}: identificador con formato de IBAN (${o.proveedor})`);
console.log(`  Sociedades sin obligaciones: ${c.sociedadesSinObligaciones.join(", ") || "ninguna"}`);
console.log(`  De ${c.activas} activas: ${c.sinMonto} sin monto, ${c.sinCuenta} sin cuenta, ${c.sinResponsable} sin responsable, ${c.sinDia} sin día, ${c.frecuenciaPorConfirmar} con frecuencia por confirmar`);
await prisma.$disconnect();
