// Comprueba la accesibilidad básica de los avisos emergentes leyendo el código fuente del componente y del módulo de avisos.
// Uso: npm run toasts
import { readFileSync } from "node:fs";

const componente = readFileSync(new URL("../src/components/Avisos.tsx", import.meta.url), "utf8");
const modulo = readFileSync(new URL("../src/lib/avisos.ts", import.meta.url), "utf8");

const bloqueTipos = (() => {
  const i = componente.indexOf("const TIPOS");
  return i < 0 ? "" : componente.slice(i, componente.indexOf("function ItemAviso"));
})();
const tipo = (nombre) => new RegExp(`${nombre}:\\s*\\{([^\\n]+)\\}`).exec(bloqueTipos)?.[1] ?? "";

const comprobaciones = [
  ["región aria-live polite siempre montada", /aria-live="polite"/.test(componente)],
  ["región aria-live assertive siempre montada", /aria-live="assertive"/.test(componente)],
  ["el error usa role alert y los demás role status", /role=\{aviso\.tipo === "error" \? "alert" : "status"\}/.test(componente)],
  ["botón de cierre con aria-label «Cerrar aviso»", /<button[^>]*[\s\S]{0,200}aria-label="Cerrar aviso"/.test(componente)],
  ["límite de avisos en una constante igual a 3", /export const MAXIMO_AVISOS = 3;/.test(modulo)],
  ["cierre automático en una constante igual a 5000 ms", /const DURACION_MS = 5000;/.test(componente)],
  ["el error no se cierra solo", /const seCierraSolo = aviso\.tipo !== "error"/.test(componente)],
  ["los temporizadores se limpian", /clearTimeout\(temporizador\.current\)/.test(componente)],
  ["el texto del aviso se dibuja junto al rótulo y al ícono", /\{t\.icono\}[\s\S]{0,200}\{t\.rotulo\}[\s\S]{0,100}\{aviso\.texto\}/.test(componente)],
];
for (const nombre of ["exito", "error", "informacion"]) {
  const t = tipo(nombre);
  comprobaciones.push([`${nombre}: rótulo de texto`, /rotulo:\s*"[^"]+"/.test(t)]);
  comprobaciones.push([`${nombre}: ícono`, /icono:\s*(<IconoEstado|IconoInformacion)/.test(t)]);
  comprobaciones.push([`${nombre}: color (clase)`, /clase:\s*"[^"]*bg-[^"]+"/.test(t)]);
}

let fallos = 0;
for (const [nombre, ok] of comprobaciones) {
  console.log(`${ok ? "OK    " : "FALLA "} ${nombre}`);
  if (!ok) fallos++;
}
process.exit(fallos ? 1 : 0);
