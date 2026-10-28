// Inspección de solo lectura de la estructura de un archivo de estado de cuenta: dónde dice «saldo», cómo es cada fila de la
// hoja leída y por qué el lector leyó o descartó cada fila con forma de movimiento. Sirve para entender por qué un archivo
// queda «no verificable» o sin movimientos. NUNCA devuelve montos, fechas, nombres de personas ni números completos de cuenta:
// solo etiquetas (con los números largos enmascarados), posiciones, tipos de celda («texto», «número», «fecha»), «sí/no»,
// conteos y la FORMA de un texto (cada dígito es «9» y cada letra «a»).
import type { Worksheet } from "exceljs";
import { detectarFormato } from "./detectar-formato.js";
import { leerEstadoDeCuenta, leerLibro } from "./lector.js";
import { parsearNombreArchivo } from "./nombre-archivo.js";
import { normalizar, parsearFecha, parsearMonto, valorPlano } from "./utiles.js";
import { enmascararNumerosLargos } from "../domain/enmascarar.js";

const PALABRAS = ["saldo", "inicial", "anterior", "final", "total", "sin movimientos"];
const MAX_ETIQUETA = 50;
const MAX_HALLAZGOS = 80;
const MAX_FORMAS = 6;

const sn = (b: boolean) => (b ? "sí" : "no");
const etiquetaSegura = (t: string) => enmascararNumerosLargos(t.replace(/ +/g, " ").trim()).slice(0, MAX_ETIQUETA);
const trae = (v: unknown) => {
  const p = valorPlano(v);
  return p !== null && !(p instanceof Date) && parsearMonto(p) !== null;
};

/** La forma de un texto: cada dígito es «9» y cada letra es «a». No revela el contenido. */
export const formaDeTexto = (t: string): string =>
  t.trim().replace(/[0-9]/g, "9").replace(/[a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]/g, "a").replace(/ +/g, " ").slice(0, 20);

type Tipo = "texto" | "número" | "fecha" | "texto con forma de fecha" | "texto con forma de número";

function tipoDe(v: unknown): Tipo | null {
  const p = valorPlano(v);
  if (p === null || p === "") return null;
  if (p instanceof Date) return "fecha";
  if (typeof p === "number") return "número";
  const t = String(p).trim();
  if (!t) return null;
  if (parsearFecha(t) !== null) return "texto con forma de fecha";
  if (parsearMonto(t) !== null) return "texto con forma de número";
  return "texto";
}

/** «15-20, 22, 30-31» */
function rangos(filas: number[]): string {
  const orden = [...filas].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < orden.length; ) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1] === orden[j]! + 1) j++;
    partes.push(j > i ? `${orden[i]}-${orden[j]}` : String(orden[i]));
    i = j + 1;
  }
  return partes.join(", ");
}

interface FilaAnalizada {
  fila: number;
  /** firma de la fila: cuántas celdas de cada tipo, sin valores */
  firma: string;
  celdas: number;
  /** columnas con algo legible como fecha */
  columnasFecha: number[];
  numeros: number;
}

function analizarFila(hoja: Worksheet, fila: number, columnaFecha: number | undefined): FilaAnalizada {
  const cuenta = new Map<Tipo, number>();
  const columnasFecha: number[] = [];
  let numeros = 0;
  let celdas = 0;
  hoja.getRow(fila).eachCell({ includeEmpty: false }, (celda, col) => {
    const t = tipoDe(celda.value);
    if (t === null) return;
    celdas++;
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    const p = valorPlano(celda.value);
    // un número solo cuenta como fecha en la columna de fecha de la tabla (un importe grande también cae en el rango de las fechas de Excel)
    const esFecha = t === "fecha" || t === "texto con forma de fecha" || (t === "número" && col === columnaFecha && parsearFecha(p) !== null);
    if (esFecha) columnasFecha.push(col);
    else if (t === "número" || t === "texto con forma de número") numeros++;
  });
  const firma = celdas === 0 ? "0 celdas" : [...cuenta].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([t, n]) => `${n} ${t}`).join(", ");
  return { fila, firma, celdas, columnasFecha, numeros };
}

export async function inspeccionarSaldo(contenido: Buffer, nombreDeArchivo: string): Promise<string[]> {
  const libro = await leerLibro(contenido);
  const nombre = parsearNombreArchivo(nombreDeArchivo);
  const L: string[] = [];
  L.push(`Hojas del libro: ${libro.wb.worksheets.length}`);
  for (const h of libro.wb.worksheets) L.push(`  hoja: «${etiquetaSegura(h.name)}» · filas: ${h.rowCount} · columnas: ${h.columnCount}`);

  const det = detectarFormato(libro.wb.worksheets, nombre?.codigoBanco ?? null);
  const hoja: Worksheet = det.ok ? det.deteccion.hoja : libro.wb.worksheets[0]!;
  const filaEncabezado = det.ok ? det.deteccion.filaEncabezado : 0;
  const columnas = det.ok ? det.deteccion.columnas : {};
  if (det.ok) {
    L.push("", `Formato detectado: ${det.deteccion.formato} · hoja leída: «${etiquetaSegura(hoja.name)}» · fila del encabezado de la tabla: ${filaEncabezado} · filas de la hoja: ${hoja.rowCount}`);
    L.push(`  columnas reconocidas: ${Object.entries(columnas).map(([campo, col]) => `${campo} = columna ${col}`).join(" · ")}`);
    const etiquetas: string[] = [];
    hoja.getRow(filaEncabezado).eachCell({ includeEmpty: false }, (c, col) => {
      const v = valorPlano(c.value);
      if (typeof v === "string") etiquetas.push(`${col}: «${etiquetaSegura(v).slice(0, 25)}»`);
    });
    L.push(`  títulos de la fila del encabezado: ${etiquetas.join(" · ")}`);
  } else {
    L.push("", "Formato: no se reconoció la tabla de movimientos de ningún formato (se revisa la primera hoja completa)");
  }

  // 1. Todas las celdas de texto con palabras de saldo o de totales, en TODA la hoja
  L.push("", `Celdas de texto de toda la hoja que mencionan saldo, inicial, anterior, final, total o «sin movimientos»:`);
  let hallazgos = 0;
  for (let f = 1; f <= hoja.rowCount; f++) {
    hoja.getRow(f).eachCell({ includeEmpty: false }, (celda, col) => {
      const v = valorPlano(celda.value);
      if (typeof v !== "string") return;
      const t = normalizar(v);
      if (!PALABRAS.some((p) => t.includes(p))) return;
      hallazgos++;
      if (hallazgos > MAX_HALLAZGOS) return;
      const derecha = trae(hoja.getRow(f).getCell(col + 1).value);
      let primeraADerecha = false;
      for (let c = col + 1; c <= col + 5; c++) {
        const w = valorPlano(hoja.getRow(f).getCell(c).value);
        if (w !== null && w !== "") { primeraADerecha = trae(w); break; }
      }
      const abajo = f < hoja.rowCount && trae(hoja.getRow(f + 1).getCell(col).value);
      const zona = filaEncabezado === 0 ? "" : f < filaEncabezado ? " · antes de la tabla" : f === filaEncabezado ? " · en el encabezado de la tabla" : " · dentro o después de la tabla";
      L.push(`  fila ${f}, columna ${col}: «${etiquetaSegura(v)}»${zona} · celda de la derecha con número: ${sn(derecha)} · primera celda con valor a la derecha con número: ${sn(primeraADerecha)} · celda de abajo con número: ${sn(abajo)}`);
    });
  }
  if (hallazgos === 0) L.push("  ninguna");
  else if (hallazgos > MAX_HALLAZGOS) L.push(`  y ${hallazgos - MAX_HALLAZGOS} más`);

  if (!det.ok) return L;

  // 2. La forma de cada fila posterior al encabezado, agrupando filas consecutivas iguales
  const filas: FilaAnalizada[] = [];
  for (let f = filaEncabezado + 1; f <= hoja.rowCount; f++) filas.push(analizarFila(hoja, f, columnas.fecha));
  L.push("", `Forma de cada fila posterior al encabezado (filas ${filaEncabezado + 1} a ${hoja.rowCount}; sin valores):`);
  if (filas.length === 0) L.push("  la hoja no tiene filas después del encabezado");
  for (let i = 0; i < filas.length; ) {
    let j = i;
    while (j + 1 < filas.length && filas[j + 1]!.firma === filas[i]!.firma) j++;
    L.push(`  ${j > i ? `filas ${filas[i]!.fila} a ${filas[j]!.fila}` : `fila ${filas[i]!.fila}`}: ${filas[i]!.firma}`);
    i = j + 1;
  }

  // 3. Filas con forma de movimiento (una fecha y al menos un número) y si el lector las leyó
  const r = leerEstadoDeCuenta(libro, nombre);
  const leidas = new Set(r.movimientos.map((m) => m.fila));
  const conForma = filas.filter((f) => f.columnasFecha.length > 0 && f.numeros > 0);
  const noLeidas = conForma.filter((f) => !leidas.has(f.fila));
  const colFecha = columnas.fecha;
  L.push("", "Filas con forma de movimiento (una fecha y al menos un número) y qué hizo el lector:");
  L.push(`  filas con forma de movimiento: ${conForma.length} · leídas por el lector: ${conForma.length - noLeidas.length} · no leídas: ${noLeidas.length}`);
  L.push(`  filas leídas por el lector en total: ${leidas.size} · la columna de fecha del encabezado es la ${colFecha ?? "?"}`);
  const porCausa = new Map<string, number[]>();
  for (const f of noLeidas) {
    const donde = f.columnasFecha.join(", ");
    const causa = colFecha !== undefined && !f.columnasFecha.includes(colFecha)
      ? `no leídas: la columna de fecha del encabezado (${colFecha}) no trae una fecha legible en estas filas; la fecha legible está en la columna ${donde}`
      : "no leídas por otra causa (la fecha de la columna de fecha sí es legible)";
    porCausa.set(causa, [...(porCausa.get(causa) ?? []), f.fila]);
  }
  for (const [causa, fs] of porCausa) L.push(`  filas ${rangos(fs)}: ${causa}`);
  const conAlgo = filas.filter((f) => f.celdas > 0);
  const sinForma = conAlgo.filter((f) => !(f.columnasFecha.length > 0 && f.numeros > 0));
  L.push(`  filas con algo escrito y sin forma de movimiento: ${sinForma.length}${sinForma.length ? ` (filas ${rangos(sinForma.map((f) => f.fila))}); el lector las ignora si no tienen una fecha legible en la columna de fecha` : ""}`);
  L.push(`  filas completamente vacías: ${filas.length - conAlgo.length}`);

  // 4. Cómo se ven las celdas de la columna de fecha de la tabla (solo la forma)
  if (colFecha !== undefined) {
    const formas = new Map<string, number>();
    for (let f = filaEncabezado + 1; f <= hoja.rowCount; f++) {
      const v = valorPlano(hoja.getRow(f).getCell(colFecha).value);
      const t = tipoDe(v);
      if (t === null) continue;
      const clave = t === "texto" || t === "texto con forma de fecha" || t === "texto con forma de número" ? `${t}: «${formaDeTexto(String(v))}»` : t;
      formas.set(clave, (formas.get(clave) ?? 0) + 1);
    }
    L.push("", `Cómo se ven las celdas de la columna de fecha (columna ${colFecha}) debajo del encabezado (solo la forma; 9 = dígito, a = letra):`);
    const orden = [...formas].sort((a, b) => b[1] - a[1]);
    for (const [forma, n] of orden.slice(0, MAX_FORMAS)) L.push(`  ${forma} · ${n} celdas`);
    if (orden.length > MAX_FORMAS) L.push(`  y ${orden.length - MAX_FORMAS} formas más`);
    if (orden.length === 0) L.push("  ninguna celda con valor");
  }

  // 5. Columna de saldo y lo que guardó el lector
  const colSaldo = columnas.saldo;
  L.push("", "Columna de saldo de la tabla:");
  if (!colSaldo) {
    L.push("  el formato no tiene columna de saldo reconocida");
  } else {
    const etiqueta = valorPlano(hoja.getRow(filaEncabezado).getCell(colSaldo).value);
    const llenas = r.movimientos.filter((m) => m.saldo !== null).length;
    L.push(`  columna ${colSaldo} («${typeof etiqueta === "string" ? etiquetaSegura(etiqueta) : "?"}») · filas con saldo: ${llenas} de ${r.movimientos.length}`);
  }

  L.push("", "Lo que guardó el lector:");
  L.push(`  movimientos leídos: ${r.movimientos.length}`);
  L.push(`  filas del pie ignoradas (después del último movimiento): ${r.filasPieIgnoradas}`);
  L.push(`  saldo anterior (inicial): ${r.saldoInicial !== null ? "presente" : "nulo"}`);
  L.push(`  saldo siguiente (de la última fila): ${r.saldoFinal !== null ? "presente" : "nulo"}`);
  const c = r.continuidad;
  L.push(`  resultado de la comprobación: ${c.estado}${c.razon ? ` · razón: ${c.razon}` : ""}${c.estado !== "no_verificable" ? ` · comparaciones: ${c.verificados} · fallos: ${c.fallos}` : ""}`);
  L.push(`  usó el saldo anterior del encabezado para comparar: ${sn(c.usoSaldoApertura)}`);
  L.push(`  período declarado en el encabezado: ${r.periodoDeclarado ? "sí" : "no"}`);
  return L;
}
