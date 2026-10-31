// Reporte local de los pendientes de calidad del catálogo (lo que antes mostraba el panel «Pendientes con Tesorería»).
// Se escribe como un archivo Markdown en una carpeta ignorada por git: nunca se envía a ningún lado ni se versiona.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { calidadCatalogo } from "../domain/obligaciones.js";

type Calidad = ReturnType<typeof calidadCatalogo>;

const n = (x: number) => x.toLocaleString("es-CR");

export function reporteDeCalidad(c: Calidad, fecha: string): string {
  const L: string[] = [`# Pendientes de calidad del catálogo (${fecha})`, "", "Archivo local: no se versiona ni se envía. Se genera con `npm run calidad:reporte`.", ""];
  const total = c.identificadoresRepetidos.length + c.formatoIban.length + c.sociedadesSinObligaciones.length + (c.frecuenciaPorConfirmar > 0 ? 1 : 0) + (c.sociedadesSinEstadosNiObligaciones.length > 0 ? 1 : 0);
  L.push(`Pendientes: ${n(total)}`, "");

  L.push("## Identificadores repetidos con otro proveedor", "");
  if (c.identificadoresRepetidos.length === 0) L.push("Ninguno.");
  for (const g of c.identificadoresRepetidos) L.push(`- ${g.sociedad}: \`${g.identificador}\` aparece con ${g.proveedores.join(", ")}. Verificar cuál es el correcto.`);

  L.push("", "## Identificadores con formato de IBAN", "");
  if (c.formatoIban.length === 0) L.push("Ninguno.");
  for (const o of c.formatoIban) L.push(`- ${o.sociedad} (${o.proveedor}): \`${o.identificador}\` parece una cuenta bancaria y no un número de servicio.`);

  L.push("", "## Sociedades con estados de cuenta y sin obligaciones activas", "");
  if (c.sociedadesSinObligaciones.length === 0) L.push("Ninguna.");
  for (const s of c.sociedadesSinObligaciones) L.push(`- ${s}`);

  L.push("", "## Sociedades sin estados de cuenta ni obligaciones", "");
  if (c.sociedadesSinEstadosNiObligaciones.length === 0) L.push("Ninguna.");
  for (const s of c.sociedadesSinEstadosNiObligaciones) L.push(`- ${s}`);

  L.push("", "## Conteos", "");
  L.push(`- Obligaciones activas: ${n(c.activas)} (inactivas: ${n(c.inactivas)})`);
  L.push(`- Frecuencia sin confirmar: ${n(c.frecuenciaPorConfirmar)}`);
  L.push(`- Moneda por confirmar (se aplicó colones): ${n(c.monedaPorConfirmar)}`);
  L.push(`- Frecuencia no mensual sin mes de arranque (no generan vencimientos): ${n(c.sinMesArranque)}`);
  L.push(`- Sin día de pago (no generan vencimientos): ${n(c.sinDia)}`);
  L.push(`- Sin monto: ${n(c.sinMonto)} · sin cuenta de pago: ${n(c.sinCuenta)} · sin responsable: ${n(c.sinResponsable)}`);
  return L.join("\n") + "\n";
}

/** Escribe el reporte en `carpeta` (se crea si falta) y devuelve la ruta del archivo. */
export function guardarReporte(carpeta: string, fecha: string, markdown: string): string {
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `calidad-${fecha}.md`);
  writeFileSync(ruta, markdown, "utf8");
  return ruta;
}
