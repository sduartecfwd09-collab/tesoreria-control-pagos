// Utilidades de lectura de celdas: texto normalizado, fechas y montos en centavos.
// Nada aquí imprime ni registra el contenido de las celdas.

export type ValorCelda = string | number | boolean | Date | null | undefined | Record<string, unknown>;

/** Valor "plano" de una celda de exceljs (fórmulas -> resultado, texto enriquecido -> texto). */
export function valorPlano(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return valorPlano(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    if (typeof o.text === "string") return o.text;
    if (typeof o.error === "string") return null;
  }
  return null;
}

/** minúsculas, sin tildes, espacios colapsados y sin asteriscos finales. */
export function normalizar(v: unknown): string {
  const p = valorPlano(v);
  if (p === null || p instanceof Date) return "";
  return String(p)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\*+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MS_DIA = 86_400_000;

/** Fecha (solo día) como Date a medianoche UTC. */
export function fechaUTC(y: number, m: number, d: number): Date | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f : null;
}

/**
 * Acepta: Date nativa, serial de Excel (número), texto dd/mm/aaaa (también d/m/aa, con hora opcional)
 * y aaaa-mm-dd. Devuelve null si no es una fecha. SUPUESTO: el texto con barras es día/mes/año.
 */
export function parsearFecha(v: unknown): Date | null {
  const p = valorPlano(v);
  if (p === null) return null;
  if (p instanceof Date) {
    if (Number.isNaN(p.getTime())) return null;
    return fechaUTC(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate());
  }
  if (typeof p === "number") {
    // serial de Excel (1900): 36526 = 2000-01-01, 73051 = 2099-12-31
    if (!Number.isFinite(p) || p < 36526 || p > 73051) return null;
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(p) * MS_DIA);
    return fechaUTC(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  if (typeof p === "string") {
    const s = p.trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)?$/i.exec(s);
    if (m) {
      const anio = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return fechaUTC(anio, Number(m[2]), Number(m[1]));
    }
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
    if (m) return fechaUTC(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return null;
}

/**
 * Monto a centavos (entero con signo). Acepta número, texto con comas de miles ("211,264.14"),
 * paréntesis o guion como negativo, y símbolos de moneda. Vacío -> null.
 * SUPUESTO: punto = decimal y coma = miles; "12,5" (coma + 1 o 2 decimales, sin punto) se toma como decimal.
 */
export function parsearMonto(v: unknown): number | null {
  const p = valorPlano(v);
  if (p === null) return null;
  if (typeof p === "number") return Number.isFinite(p) ? Math.round(p * 100) : null;
  if (typeof p !== "string") return null;
  let s = p.trim().replace(/[₡$\s]|CRC|USD/gi, "");
  if (s === "" || s === "-") return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negativo = !negativo;
    s = s.slice(0, -1);
  }
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return negativo ? -c : c;
}

export function textoOpcional(v: unknown): string | null {
  const p = valorPlano(v);
  if (p === null) return null;
  const s = p instanceof Date ? p.toISOString().slice(0, 10) : String(p).trim();
  return s === "" ? null : s;
}

export function periodoDeFecha(f: Date): string {
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
}
