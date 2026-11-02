// Algunos bancos (p. ej. BAC) traen sobre la tabla un bloque de saldos: «Saldo Inicial», «Saldo en Libros», «Saldo Disponible» y
// «Fecha». Esta función solo registra qué etiquetas hay y si el saldo inicial es igual al saldo en libros: nunca guarda montos.
import type { Worksheet } from "exceljs";
import { normalizar, parsearMonto, valorPlano } from "./utiles.js";

export interface EncabezadoSaldos {
  saldoInicial: boolean;
  saldoEnLibros: boolean;
  saldoDisponible: boolean;
  /** hay una etiqueta «Fecha» en el bloque de saldos (encima del encabezado de la tabla) */
  fecha: boolean;
  /** true/false si se pudieron comparar el saldo inicial y el saldo en libros; null si falta alguno de los dos importes */
  inicialIgualLibros: boolean | null;
}

/** El importe de una etiqueta: el primer número a su derecha (hasta 5 celdas) o, si no hay, el de la celda de abajo. */
function importeDe(hoja: Worksheet, fila: number, col: number): number | null {
  for (let c = col + 1; c <= col + 5; c++) {
    const v = valorPlano(hoja.getRow(fila).getCell(c).value);
    if (v !== null && v !== "") {
      const m = parsearMonto(v);
      if (m !== null) return m;
      if (typeof v === "string" && normalizar(v).startsWith("saldo")) break; // la siguiente etiqueta: el valor está debajo
    }
  }
  return fila < hoja.rowCount ? parsearMonto(valorPlano(hoja.getRow(fila + 1).getCell(col).value)) : null;
}

/**
 * null si el archivo no trae ninguna etiqueta de saldo («Saldo Inicial», «Saldo en Libros» o «Saldo Disponible»). Se busca encima
 * del encabezado de la tabla y en él. La «Fecha» solo cuenta si está pegada al bloque de saldos (en su misma fila o la contigua),
 * porque casi todos los encabezados traen una «Fecha» que no tiene que ver con los saldos.
 */
export function leerEncabezadoSaldos(hoja: Worksheet, filaEncabezado: number): EncabezadoSaldos | null {
  const r: EncabezadoSaldos = { saldoInicial: false, saldoEnLibros: false, saldoDisponible: false, fecha: false, inicialIgualLibros: null };
  let inicial: number | null = null;
  let libros: number | null = null;
  const filasDeSaldos: number[] = [];
  const filasDeFecha: number[] = [];
  for (let f = 1; f <= Math.min(filaEncabezado, hoja.rowCount); f++) {
    hoja.getRow(f).eachCell({ includeEmpty: false }, (celda, col) => {
      const v = valorPlano(celda.value);
      if (typeof v !== "string") return;
      const t = normalizar(v);
      if (t.startsWith("saldo inicial")) { r.saldoInicial = true; filasDeSaldos.push(f); inicial ??= importeDe(hoja, f, col); }
      else if (t.startsWith("saldo en libros")) { r.saldoEnLibros = true; filasDeSaldos.push(f); libros ??= importeDe(hoja, f, col); }
      else if (t.startsWith("saldo disponible")) { r.saldoDisponible = true; filasDeSaldos.push(f); }
      else if (t === "fecha" && f < filaEncabezado) filasDeFecha.push(f);
    });
  }
  if (filasDeSaldos.length === 0) return null;
  const desde = Math.min(...filasDeSaldos) - 1;
  const hasta = Math.max(...filasDeSaldos) + 1;
  r.fecha = filasDeFecha.some((f) => f >= desde && f <= hasta);
  r.inicialIgualLibros = inicial !== null && libros !== null ? inicial === libros : null;
  return r;
}
