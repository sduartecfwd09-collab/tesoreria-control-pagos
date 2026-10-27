import ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import { quitarDibujos, tieneImagenes } from "./quitar-dibujos.js";
import { detectarFormato } from "./detectar-formato.js";
import { especDe } from "./formatos.js";
import { verificarContinuidad } from "./calidad.js";
import type { NombreArchivo } from "./nombre-archivo.js";
import type { Discrepancia, MovimientoLeido, ResultadoLectura } from "./tipos.js";
import { normalizar, parsearFecha, parsearMonto, periodoDeFecha, textoOpcional, valorPlano } from "./utiles.js";

/** Súbala cuando cambien las reglas de lectura: fuerza a releer los archivos aunque su hash no haya cambiado. */
export const LECTOR_VERSION = 6; // 6: registra si el archivo trae imágenes

export class ErrorLectura extends Error {}

type Moneda = "CRC" | "USD";

export interface LibroLeido {
  wb: ExcelJS.Workbook;
  dibujosOmitidos: boolean;
  /** el archivo trae imágenes (no se leen ni se hace OCR: solo se registra que existen) */
  conImagenes: boolean;
}

/**
 * Solo lectura: abre el libro desde un buffer, nunca lo guarda. Si exceljs falla por un dibujo incrustado,
 * reintenta con una copia en memoria sin dibujos. Los mensajes de error no incluyen contenido de celdas.
 */
export async function leerLibro(contenido: Buffer): Promise<LibroLeido> {
  let dibujosOmitidos = false;
  let wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(contenido as unknown as ArrayBuffer);
  } catch {
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await quitarDibujos(contenido)) as unknown as ArrayBuffer);
      dibujosOmitidos = true;
    } catch {
      throw new ErrorLectura("No se pudo abrir el archivo como Excel (.xlsx)");
    }
  }
  if (wb.worksheets.length === 0) throw new ErrorLectura("El libro no tiene hojas");
  return { wb, dibujosOmitidos, conImagenes: await tieneImagenes(contenido) };
}

export function leerEstadoDeCuenta(libro: LibroLeido, nombre: NombreArchivo | null): ResultadoLectura {
  const wb = libro.wb;
  const det = detectarFormato(wb.worksheets, nombre?.codigoBanco ?? null);
  if (!det.ok) throw new ErrorLectura(det.error);
  const { formato, hoja, filaEncabezado, columnas } = det.deteccion;
  const spec = especDe(formato);
  const advertencias: string[] = [];
  const discrepancias: Discrepancia[] = [];

  const meta = leerMetadatos(wb, hoja, filaEncabezado);
  if (libro.dibujosOmitidos) advertencias.push("El archivo trae un dibujo/imagen incrustado que exceljs no puede abrir: se leyó una copia en memoria sin él");
  if (meta.monedaConflicto) advertencias.push("El encabezado menciona dos monedas distintas; se tomó la primera");

  // --- Movimientos ---
  const movimientos: MovimientoLeido[] = [];
  const sinFecha: { fila: number; conImporte: boolean }[] = [];
  const get = (fila: number, col: number | undefined) => (col ? valorPlano(hoja.getRow(fila).getCell(col).value) : null);
  let negativos = 0;
  let ambos = 0;
  let sinImporte = 0;
  let importeNoLegible = 0;

  for (let fila = filaEncabezado + 1; fila <= hoja.rowCount; fila++) {
    const fecha = parsearFecha(get(fila, columnas.fecha));
    const debRaw = parsearMonto(get(fila, columnas.debito));
    const creRaw = parsearMonto(get(fila, columnas.credito));
    const montoRaw = parsearMonto(get(fila, columnas.monto));
    if (!fecha) {
      if (hoja.getRow(fila).hasValues) sinFecha.push({ fila, conImporte: [debRaw, creRaw, montoRaw].some((v) => v !== null && v !== 0) });
      continue;
    }
    let debito: number;
    let credito: number;
    if (spec.montoConSigno) {
      if (montoRaw === null) importeNoLegible++;
      const m = montoRaw ?? 0;
      debito = m < 0 ? -m : 0;
      credito = m > 0 ? m : 0;
    } else {
      if (debRaw !== null && debRaw < 0) negativos++;
      if (creRaw !== null && creRaw < 0) negativos++;
      debito = Math.abs(debRaw ?? 0);
      credito = Math.abs(creRaw ?? 0);
      if (debito > 0 && credito > 0) ambos++;
    }
    if (debito === 0 && credito === 0) sinImporte++;
    movimientos.push({
      hoja: hoja.name,
      fila,
      fecha,
      referencia: textoOpcional(get(fila, columnas.referencia)),
      codigo: textoOpcional(get(fila, columnas.codigo)),
      descripcion: textoOpcional(get(fila, columnas.descripcion)),
      debito,
      credito,
      saldo: parsearMonto(get(fila, columnas.saldo)),
    });
  }

  const ultima = movimientos.length ? movimientos[movimientos.length - 1]!.fila : filaEncabezado;
  const filasPieIgnoradas = sinFecha.filter((f) => f.fila > ultima).length;
  const huecos = sinFecha.filter((f) => f.fila < ultima && f.conImporte).length;
  if (huecos > 0) advertencias.push(`${huecos} fila(s) con importe pero sin fecha legible entre movimientos: no se importaron`);
  if (negativos > 0) advertencias.push(`${negativos} importe(s) negativos en columnas de débito/crédito: se tomó el valor absoluto`);
  if (ambos > 0) advertencias.push(`${ambos} fila(s) con débito y crédito a la vez`);
  if (importeNoLegible > 0) advertencias.push(`${importeNoLegible} fila(s) con monto no legible: se importaron con importe 0`);
  if (sinImporte > 0) advertencias.push(`${sinImporte} movimiento(s) con importe cero o vacío`);

  // --- Coherencia con el nombre del archivo ---
  if (nombre) {
    const cuentaOk = verificarCuenta(wb, hoja, filaEncabezado, nombre.cuenta);
    if (cuentaOk === "distinta") discrepancias.push({ tipo: "cuenta", mensaje: "La cuenta que aparece dentro del archivo no coincide con la del nombre" });
    if (meta.periodoMes && meta.periodoMes !== nombre.periodo) {
      discrepancias.push({ tipo: "periodo", mensaje: `El periodo indicado en el archivo (${meta.periodoMes}) no coincide con el del nombre (${nombre.periodo})` });
    }
    const fuera = movimientos.filter((m) => periodoDeFecha(m.fecha) !== nombre.periodo).length;
    if (fuera > 0) {
      discrepancias.push({ tipo: "periodo", mensaje: `${fuera} de ${movimientos.length} movimientos tienen fecha fuera del mes ${nombre.periodo}` });
    }
  }

  const continuidad = verificarContinuidad(movimientos, { apertura: meta.apertura, saldoDiario: spec.saldoDiario });

  return {
    formato,
    hoja: hoja.name,
    filaEncabezado,
    monedaArchivo: meta.moneda,
    bancoArchivo: meta.banco,
    movimientos,
    continuidad,
    discrepancias,
    advertencias,
    filasPieIgnoradas,
    conImagenes: libro.conImagenes,
  };
}

interface Metadatos {
  moneda: Moneda | null;
  monedaConflicto: boolean;
  banco: string | null;
  apertura: number | null;
  periodoMes: string | null;
}

function textosMeta(hoja: Worksheet, hasta: number): string[] {
  const out: string[] = [];
  for (let f = 1; f < hasta; f++) {
    hoja.getRow(f).eachCell({ includeEmpty: false }, (c) => {
      const v = valorPlano(c.value);
      if (typeof v === "string") out.push(v);
    });
  }
  return out;
}

function leerMetadatos(wb: ExcelJS.Workbook, hoja: Worksheet, filaEncabezado: number): Metadatos {
  const textos = textosMeta(hoja, filaEncabezado);
  const norm = [...new Set(textos.map((t) => normalizar(t)))];
  const monedas = new Set<Moneda>();
  let primera: Moneda | null = null;
  for (const t of norm) {
    // También acepta el símbolo al final del texto (p. ej. «Nombre de la cuenta ¢» o «… $»). SUPUESTO: ¢/₡ = colones, $ = dólares.
    const esUsd = /\busd\b|\bdol\b|dolar|\$\s*$/.test(t);
    const esCrc = /\bcrc\b|\bcol\b|\bcolon(es)?\b|[¢₡]\s*$/.test(t);
    if (esUsd) { monedas.add("USD"); primera ??= "USD"; }
    if (esCrc) { monedas.add("CRC"); primera ??= "CRC"; }
  }
  const junto = [...norm, ...wb.worksheets.map((w) => normalizar(w.name))].join(" | ");
  const banco = /\bbct\b/.test(junto) ? "BCT" : /davivienda/.test(junto) ? "Davivienda" : /\bbncr\b|banco nacional/.test(junto) ? "BNCR" : null;

  let periodoMes: string | null = null;
  for (const t of textos) {
    const m = /del:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(t);
    if (m) { periodoMes = `${m[3]}-${m[2]}`; break; }
  }

  return { moneda: primera, monedaConflicto: monedas.size > 1, banco, apertura: leerApertura(hoja, filaEncabezado), periodoMes };
}

/** Saldo inicial/anterior: la primera celda numérica a la derecha de una etiqueta "Saldo inicial" (o "Saldo anterior"). */
function leerApertura(hoja: Worksheet, filaEncabezado: number): number | null {
  const hasta = Math.min(hoja.rowCount, filaEncabezado + 3);
  for (const prefijo of ["saldo inicial", "saldo anterior"]) {
    for (let f = 1; f <= hasta; f++) {
      const fila = hoja.getRow(f);
      let colEtiqueta = 0;
      fila.eachCell({ includeEmpty: false }, (c, i) => {
        if (!colEtiqueta && normalizar(c.value).startsWith(prefijo)) colEtiqueta = i;
      });
      if (!colEtiqueta) continue;
      for (let i = colEtiqueta + 1; i <= hoja.columnCount; i++) {
        const v = valorPlano(fila.getCell(i).value);
        if (typeof v === "string" && normalizar(v).startsWith(prefijo)) continue;
        const m = parsearMonto(v);
        if (m !== null) return m;
      }
    }
  }
  return null;
}

/** "coincide" | "distinta" | "no_verificable": busca la cuenta en el encabezado y en el nombre de las hojas. */
function verificarCuenta(wb: ExcelJS.Workbook, hoja: Worksheet, filaEncabezado: number, cuenta: string): "coincide" | "distinta" | "no_verificable" {
  const candidatos = [...textosMeta(hoja, filaEncabezado), ...wb.worksheets.map((w) => w.name)].map((t) => t.toUpperCase());
  if (candidatos.some((t) => t.includes(cuenta))) return "coincide";
  const ibans = candidatos.flatMap((t) => t.match(/CR\d{20}/g) ?? []);
  if (ibans.length > 0) return "distinta";
  const sufijos = candidatos.flatMap((t) => t.match(/\d{6,}/g) ?? []);
  if (sufijos.some((s) => cuenta.endsWith(s))) return "coincide";
  return "no_verificable";
}
