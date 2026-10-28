// Inspección de solo lectura de dónde trae un archivo su saldo (inicial y de cada fila). Pensada para entender por qué un
// archivo queda «no verificable». NUNCA devuelve montos, nombres de personas ni números completos de cuenta: solo
// etiquetas (con los números largos enmascarados), posiciones, «sí/no» y conteos.
import { detectarFormato } from "./detectar-formato.js";
import { leerEstadoDeCuenta, leerLibro } from "./lector.js";
import { parsearNombreArchivo } from "./nombre-archivo.js";
import { normalizar, parsearMonto, valorPlano } from "./utiles.js";
import { enmascararNumerosLargos } from "../domain/enmascarar.js";

const PALABRAS = ["saldo", "inicial", "anterior", "final"];
const FILAS_EXTRA = 3; // además del encabezado, las primeras filas de la tabla
const MAX_ETIQUETA = 50;

const sn = (b: boolean) => (b ? "sí" : "no");
const trae = (v: unknown) => {
  const p = valorPlano(v);
  return p !== null && !(p instanceof Date) && parsearMonto(p) !== null;
};

export async function inspeccionarSaldo(contenido: Buffer, nombreDeArchivo: string): Promise<string[]> {
  const libro = await leerLibro(contenido);
  const nombre = parsearNombreArchivo(nombreDeArchivo);
  const L: string[] = [];
  L.push(`Hojas del libro: ${libro.wb.worksheets.length}`);
  for (const h of libro.wb.worksheets) L.push(`  hoja: «${enmascararNumerosLargos(h.name).slice(0, MAX_ETIQUETA)}» · filas: ${h.rowCount}`);

  const det = detectarFormato(libro.wb.worksheets, nombre?.codigoBanco ?? null);
  if (!det.ok) {
    L.push("Formato: no se reconoció la tabla de movimientos de ningún formato");
    return L;
  }
  const { formato, hoja, filaEncabezado, columnas } = det.deteccion;
  L.push("", `Formato detectado: ${formato} · hoja leída: «${enmascararNumerosLargos(hoja.name).slice(0, MAX_ETIQUETA)}» · fila del encabezado de la tabla: ${filaEncabezado}`);

  L.push("", `Celdas de texto del encabezado y de las primeras ${FILAS_EXTRA} filas de la tabla que mencionan saldo, inicial, anterior o final:`);
  let hallazgos = 0;
  const hasta = Math.min(hoja.rowCount, filaEncabezado + FILAS_EXTRA);
  for (let f = 1; f <= hasta; f++) {
    hoja.getRow(f).eachCell({ includeEmpty: false }, (celda, col) => {
      const v = valorPlano(celda.value);
      if (typeof v !== "string") return;
      const t = normalizar(v);
      if (!PALABRAS.some((p) => t.includes(p))) return;
      hallazgos++;
      const derecha = trae(hoja.getRow(f).getCell(col + 1).value);
      let primeraADerecha = false;
      for (let c = col + 1; c <= col + 5 && !primeraADerecha; c++) {
        const w = valorPlano(hoja.getRow(f).getCell(c).value);
        if (w !== null && w !== "") { primeraADerecha = trae(w); break; }
      }
      const abajo = f < hoja.rowCount && trae(hoja.getRow(f + 1).getCell(col).value);
      const etiqueta = enmascararNumerosLargos(v.replace(/\s+/g, " ").trim()).slice(0, MAX_ETIQUETA);
      L.push(`  fila ${f}, columna ${col}: «${etiqueta}» · celda de la derecha con número: ${sn(derecha)} · primera celda con valor a la derecha con número: ${sn(primeraADerecha)} · celda de abajo con número: ${sn(abajo)}`);
    });
  }
  if (hallazgos === 0) L.push("  ninguna");

  const r = leerEstadoDeCuenta(libro, nombre);
  const colSaldo = columnas.saldo;
  L.push("", "Columna de saldo de la tabla:");
  if (!colSaldo) {
    L.push("  el formato no tiene columna de saldo reconocida");
  } else {
    const etiqueta = valorPlano(hoja.getRow(filaEncabezado).getCell(colSaldo).value);
    const llenas = r.movimientos.filter((m) => m.saldo !== null).length;
    L.push(`  columna ${colSaldo} («${typeof etiqueta === "string" ? enmascararNumerosLargos(etiqueta).slice(0, MAX_ETIQUETA) : "?"}») · filas con saldo: ${llenas} de ${r.movimientos.length}`);
  }

  L.push("", "Lo que guardó el lector:");
  L.push(`  movimientos leídos: ${r.movimientos.length}`);
  L.push(`  saldo anterior (inicial): ${r.saldoInicial !== null ? "presente" : "nulo"}`);
  L.push(`  saldo siguiente (de la última fila): ${r.saldoFinal !== null ? "presente" : "nulo"}`);
  const c = r.continuidad;
  L.push(`  resultado de la comprobación: ${c.estado}${c.razon ? ` · razón: ${c.razon}` : ""}${c.estado !== "no_verificable" ? ` · comparaciones: ${c.verificados} · fallos: ${c.fallos}` : ""}`);
  L.push(`  usó el saldo anterior del encabezado para comparar: ${sn(c.usoSaldoApertura)}`);
  L.push(`  período declarado en el encabezado: ${r.periodoDeclarado ? "sí" : "no"}`);
  return L;
}
