// Formatos de los textos que el servidor arma para la pantalla (fechas, montos y listas), iguales a los de la interfaz.
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-08-15" -> "15 ago 2026". */
export const fechaTexto = (f: string) => `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1] ?? "?"} ${f.slice(0, 4)}`;

/** Centavos con la moneda de la cuenta (CRC o USD con su símbolo); sin moneda, solo el número, sin símbolo ni código. */
export function montoTexto(centavos: number, moneda: string | null): string {
  const f = moneda === "CRC" || moneda === "USD"
    ? new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda, minimumFractionDigits: 2 })
    : new Intl.NumberFormat("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return f.format(centavos / 100).replace(/[  ]/g, " "); // espacios normales: el texto se compara y se copia sin sorpresas
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** ["A", "B", "C"] -> "A, B y C". */
export function listaTexto(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}
