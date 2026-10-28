// Comprueba que ningún estado se señale solo con color: cada estado debe tener etiqueta de texto, ícono propio y ayuda.
// Uso: npm run estados
import { readFileSync } from "node:fs";

const fuente = readFileSync(new URL("../src/components/pagos/EstadoPago.tsx", import.meta.url), "utf8");
const tipos = readFileSync(new URL("../src/lib/tipos.ts", import.meta.url), "utf8");

const union = /export type EstadoVencimiento =([^;]+);/.exec(tipos)?.[1] ?? "";
const estados = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const desde = (nombre) => {
  const i = fuente.indexOf(nombre);
  return i < 0 ? "" : fuente.slice(i);
};
const iconos = desde("const ICONOS");
const definiciones = desde("export const ESTADO");

let fallos = 0;
for (const e of estados) {
  const tieneIcono = new RegExp(`\\b${e}:\\s*\\(?\\s*<Svg>`).test(iconos);
  const tieneTexto = new RegExp(`\\b${e}:[\\s\\S]{0,40}?texto:\\s*"[^"]+"`).test(definiciones);
  const tieneAyuda = new RegExp(`\\b${e}:[\\s\\S]{0,400}?ayuda:\\s*"[^"]+"`).test(definiciones);
  const ok = tieneIcono && tieneTexto && tieneAyuda;
  console.log(`${ok ? "OK    " : "FALLA "} ${e}: ícono ${tieneIcono ? "sí" : "NO"} · etiqueta de texto ${tieneTexto ? "sí" : "NO"} · ayuda ${tieneAyuda ? "sí" : "NO"}`);
  if (!ok) fallos++;
}
if (estados.length !== 7) {
  console.log(`FALLA se esperaban 7 estados y hay ${estados.length}`);
  fallos++;
}
if (!/\{ICONOS\[estado\]\}\s*\{e\.texto\}/.test(fuente)) {
  console.log("FALLA la etiqueta no dibuja ícono y texto juntos");
  fallos++;
}
process.exit(fallos ? 1 : 0);
