// Formatos compartidos: montos (centavos <-> pantalla), meses y periodos AAAA-MM.
import type { Frecuencia, Moneda } from "./tipos";

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const FRECUENCIAS: { valor: Frecuencia; texto: string; paso: number }[] = [
  { valor: "mensual", texto: "Mensual (todos los meses)", paso: 1 },
  { valor: "bimestral", texto: "Bimestral (cada 2 meses)", paso: 2 },
  { valor: "trimestral", texto: "Trimestral (cada 3 meses)", paso: 3 },
  { valor: "semestral", texto: "Semestral (cada 6 meses)", paso: 6 },
  { valor: "anual", texto: "Anual (una vez al año)", paso: 12 },
];

export const SIMBOLO: Record<Moneda, string> = { CRC: "₡", USD: "$" };
export const NOMBRE_MONEDA: Record<Moneda, string> = { CRC: "Colones (₡)", USD: "Dólares ($)" };

/** 150050 centavos -> "₡1 500,50" (formato de Costa Rica). */
export function monto(centavos: number | null, moneda: Moneda): string {
  if (centavos === null) return "—";
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda, minimumFractionDigits: 2 }).format(centavos / 100);
}

/** Texto del formulario ("1500,50" o "1500.50") a centavos; "" -> null; inválido -> undefined. */
export function aCentavos(texto: string): number | null | undefined {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return undefined;
  const [entero, dec = ""] = t.split(/[.,]/);
  return Number(entero) * 100 + Number(dec.padEnd(2, "0"));
}

/** Centavos a texto editable: 150050 -> "1500,50"; null -> "". */
export function aTextoMonto(centavos: number | null): string {
  if (centavos === null) return "";
  const dec = centavos % 100;
  return dec === 0 ? String(centavos / 100) : `${Math.floor(centavos / 100)},${String(dec).padStart(2, "0")}`;
}

/** "2026-08" -> "agosto 2026". */
export const nombrePeriodo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

/** "2026-08-15" -> "15 ago 2026". */
export const nombreFecha = (f: string) => `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;

/** Periodo AAAA-MM desplazado n meses. */
export function sumarMeses(p: string, n: number): string {
  const i = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export const periodoActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Meses del año en que vence según frecuencia y mes de arranque (para la vista previa del formulario). */
export function mesesQueVence(frecuencia: Frecuencia, mesArranque: number | null): number[] {
  const paso = FRECUENCIAS.find((f) => f.valor === frecuencia)?.paso ?? 1;
  if (paso === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (mesArranque === null) return [];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => (((m - mesArranque) % paso) + paso) % paso === 0);
}
