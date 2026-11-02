// Comprueba las tarjetas que filtran: (a) el número de cada tarjeta es igual a las filas que deja su filtro,
// (b) un segundo toque quita el filtro, (c) cada pantalla dibuja la tarjeta como botón con aria-pressed y «Filtro activo».
// Usa datos sintéticos. Uso: npm run tarjetas
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const leer = (r) => readFileSync(new URL(`../src/${r}`, import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "tarjetas-"));
const js = ts.transpileModule(leer("lib/filtro-tarjetas.ts"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const ruta = join(dir, "filtro-tarjetas.mjs");
writeFileSync(ruta, js);
const m = await import(pathToFileURL(ruta).href);

let fallos = 0;
const ok = (cond, texto) => {
  console.log(`${cond ? "OK    " : "FALLA "} ${texto}`);
  if (!cond) fallos++;
};

// Datos sintéticos: varias filas por estado, con repartos distintos.
const ESTADOS = ["vencido", "por_vencer", "por_revisar", "sin_informacion", "pagado", "pagado_con_inconsistencia", "proyectado"];
const vencimientos = ESTADOS.flatMap((estado, i) => Array.from({ length: i + 1 }, (_, k) => ({ id: i * 100 + k, estado })));
const archivos = [
  ...Array.from({ length: 5 }, () => ({ estado: "leido" })),
  ...Array.from({ length: 2 }, () => ({ estado: "con_error" })),
  { estado: "sin_sociedad" },
  ...Array.from({ length: 3 }, () => ({ estado: "retirado" })),
];
const grupos = ["vencidos", "por_vencer", "por_revisar", "sin_informacion"].map((clave, i) => ({ clave, filas: Array.from({ length: i + 2 }, (_, k) => ({ id: i * 10 + k })) }));
const avisos = m.aplanarAvisos(grupos);

const casos = [
  ["Pagos del mes", vencimientos, m.TARJETAS_PAGOS],
  ["Estados de cuenta", archivos, m.TARJETAS_ARCHIVOS],
  ["Avisos", avisos, m.TARJETAS_AVISOS],
];
for (const [pantalla, lista, defs] of casos) {
  const cuentas = m.contarPorTarjeta(lista, defs);
  for (const d of defs) {
    const filas = m.filtrarPorTarjeta(lista, defs, d.clave);
    ok(filas.length === cuentas[d.clave] && filas.length > 0 && filas.every(d.coincide), `${pantalla} · ${d.clave}: tarjeta ${cuentas[d.clave]} = filas ${filas.length}`);
  }
  ok(m.filtrarPorTarjeta(lista, defs, null).length === lista.length, `${pantalla} · sin tarjeta activa muestra todo (${lista.length})`);
  // un solo estado a la vez: las filas de dos tarjetas distintas no se mezclan
  const a = m.filtrarPorTarjeta(lista, defs, defs[0].clave);
  ok(a.every((x) => defs[0].coincide(x) && !defs[1].coincide(x)), `${pantalla} · tarjetas distintas no se mezclan`);
}
// Avisos: el número de cada tarjeta coincide con las filas de su grupo
for (const g of grupos) ok(m.contarPorTarjeta(avisos, m.TARJETAS_AVISOS)[g.clave] === g.filas.length, `Avisos · ${g.clave} coincide con las filas del grupo`);

// (b) segundo toque
ok(m.alternarTarjeta(null, "vencidos") === "vencidos", "primer toque activa la tarjeta");
ok(m.alternarTarjeta("vencidos", "vencidos") === null, "segundo toque quita el filtro");
ok(m.alternarTarjeta("vencidos", "pagados") === "pagados", "tocar otra tarjeta cambia la activa (solo una a la vez)");
ok(m.filtrarPorTarjeta(vencimientos, m.TARJETAS_PAGOS, m.alternarTarjeta("pagados", "pagados")).length === vencimientos.length, "tras el segundo toque vuelve a «todos»");
ok(m.filtrarPorTarjeta(vencimientos, m.TARJETAS_PAGOS, "no_existe").length === vencimientos.length, "una tarjeta desconocida no oculta filas");

// (c) código de cada pantalla
const tarjeta = leer("components/pagos/TarjetaEstado.tsx");
ok(/<button\s[^>]*type="button"/.test(tarjeta) || /<button\s+type="button"/.test(tarjeta), "Tarjeta se dibuja como <button type=\"button\"> con filtro");
ok(/aria-pressed=\{filtro\.activa\}/.test(tarjeta), "Tarjeta renderiza aria-pressed según la tarjeta activa");
ok(/Filtro activo/.test(tarjeta), "Tarjeta muestra el texto «Filtro activo»");
ok(/scrollIntoView\(\{ behavior: reducir \? "auto" : "smooth", block: "start" \}\)/.test(leer("lib/useFiltroTarjeta.ts")) && /prefers-reduced-motion/.test(leer("lib/useFiltroTarjeta.ts")), "el desplazamiento es suave y respeta «reducir movimiento»");
const pantallas = [
  ["Pagos del mes", "components/pagos/PagosDelMes.tsx", true],
  ["Avisos", "components/pagos/PanelAvisos.tsx", true],
  ["Estados de cuenta", "components/PanelArchivos.tsx", true],
  ["Obligaciones", "components/obligaciones/ResumenCalidad.tsx", false],
];
for (const [nombre, archivo, comparte] of pantallas) {
  const f = leer(archivo);
  ok(/filtro=\{/.test(f) && /<Tarjeta/.test(f.replace(/TarjetaDeEstado/g, "Tarjeta")), `${nombre}: sus tarjetas pasan \`filtro\` (botón con aria-pressed y «Filtro activo»)`);
  if (comparte) ok(/contarPorTarjeta/.test(f) && /filtrarPorTarjeta/.test(f), `${nombre}: cuenta y filtra con las mismas funciones puras`);
}
const obl = leer("components/obligaciones/PanelObligaciones.tsx");
ok(/desplazarSuave\(destinoLista\.current\)/.test(obl) && /falta,\s*activa:\s*true/.test(obl) === false && /setFiltro\(\{ activa: true, falta \}\)/.test(obl), "Obligaciones: la tarjeta quita los otros filtros y baja a la lista (total del servidor = tarjeta)");
// textos antiguos fuera de Estados de cuenta
const textos = leer("components/PanelArchivos.tsx") + leer("components/archivos/FichaArchivo.tsx");
ok(!/Tesorería indica|No hay nada que hacer/.test(textos), "Estados de cuenta: sin los textos fijos antiguos");

process.exit(fallos ? 1 : 0);
