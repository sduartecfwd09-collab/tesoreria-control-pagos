// Verifica los contrastes WCAG de los pares texto/fondo declarados abajo
// leyendo los valores reales de src/app/globals.css. Falla (exit 1) si alguno no cumple.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const vars = {};
for (const [, k, v] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
const aHex = (n) => Math.round(n).toString(16).padStart(2, "0");
const color = (k) => {
  let v = vars[k];
  while (v && v.startsWith("var(")) v = vars[v.slice(6, -1)];
  // un tinte con transparencia, rgb(r g b / alfa), se mezcla sobre el fondo blanco (el que tiene debajo en la pantalla)
  const t = v?.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/);
  if (t) {
    const a = Number(t[4]);
    return "#" + [t[1], t[2], t[3]].map((c) => aHex(255 - (255 - Number(c)) * a)).join("");
  }
  if (!v?.startsWith("#")) throw new Error(`Token sin color: ${k}`);
  return v;
};
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [descripción, primer plano, fondo, mínimo]: 4.5 texto normal, 3 componentes de interfaz
const pares = [
  ["Texto principal sobre fondo", "texto", "fondo", 4.5],
  ["Texto suave (gris oscuro) sobre fondo", "texto-suave", "fondo", 4.5],
  ["Texto suave sobre fondo suave", "texto-suave", "fondo-suave", 4.5],
  ["Botón: texto negro sobre verde", "texto-sobre-acento", "acento", 4.5],
  ["Cabecera: texto blanco sobre negro", "texto-sobre-cabecera", "cabecera", 4.5],
  ["Cabecera: verde sobre negro (acento)", "acento", "cabecera", 3],
  ["Borde de control sobre fondo", "borde-control", "fondo", 3],
  ["Anillo de foco sobre fondo", "garnier-gris-oscuro", "fondo", 3],
  ["Anillo de foco sobre verde", "garnier-gris-oscuro", "acento", 3],
  ["Error: rojo sobre fondo", "estado-rojo", "fondo", 4.5],
  ["Error: rojo sobre fondo de error", "estado-rojo", "estado-rojo-fondo", 4.5],
  ["Ámbar: texto sobre fondo ámbar", "estado-ambar-texto", "estado-ambar-fondo", 4.5],
  ["Por vencer: texto negro sobre ámbar", "texto", "estado-ambar", 4.5],
  ["Vencido: texto blanco sobre rojo", "fondo", "estado-rojo", 4.5],
  ["Texto negro sobre fondo suave", "texto", "fondo-suave", 4.5],
  // Tablas y filtros de Historial de cambios, Histórico y Movimientos sin obligación (tintes mezclados sobre blanco)
  ["Tabla: encabezado, texto blanco sobre gris oscuro", "texto-sobre-tabla-cabecera", "tabla-cabecera", 4.5],
  ["Tabla: texto negro sobre fila alterna", "texto", "tinte-fila", 4.5],
  ["Tabla: gris oscuro («antes», datos secundarios) sobre fila alterna", "texto-suave", "tinte-fila", 4.5],
  ["Tabla: texto negro sobre fila resaltada", "texto", "tinte-resalte", 4.5],
  ["Tabla: gris oscuro sobre fila resaltada", "texto-suave", "tinte-resalte", 4.5],
  ["Filtros: texto negro sobre el recuadro", "texto", "tinte-filtros", 4.5],
  ["Filtros: etiqueta gris oscuro sobre el recuadro", "texto-suave", "tinte-filtros", 4.5],
  ["Filtros: mensaje en rojo sobre el recuadro", "estado-rojo", "tinte-filtros", 4.5],
  ["Foco gris oscuro sobre fila alterna","garnier-gris-oscuro", "tinte-fila", 3],
  ["Foco gris oscuro sobre fila resaltada", "garnier-gris-oscuro", "tinte-resalte", 3],
  ["Foco gris oscuro sobre el recuadro de filtros", "garnier-gris-oscuro", "tinte-filtros", 3],
  ["Estado Programado/Sin información: borde punteado gris oscuro sobre fila alterna", "borde-control", "tinte-fila", 3],
  ["Estado Programado: borde punteado gris oscuro sobre fila resaltada", "borde-control", "tinte-resalte", 3],
];
let fallos = 0;
for (const [d, f, b, min] of pares) {
  const r = ratio(color(f), color(b));
  const ok = r >= min;
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${r.toFixed(2).padStart(5)}:1 (mín ${min})  ${d}`);
}
console.log("Nota: gris claro #B9B9B9 solo se usa en divisores decorativos (no se verifica como texto ni borde de control).");
process.exit(fallos ? 1 : 0);
