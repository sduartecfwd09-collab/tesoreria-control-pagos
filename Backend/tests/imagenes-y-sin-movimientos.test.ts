import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { clasificarArchivo, clasificarImagen, UMBRALES_IMAGEN_DEFECTO } from "../src/domain/clasificar-imagenes.js";
import { esSinMovimientos, textoSaldo } from "../src/domain/saldo.js";
import { leerEstadoDeCuenta, leerLibro } from "../src/ingest/lector.js";
import { anclasDeDibujo, medirRelativo } from "../src/ingest/medir-imagenes.js";
import { parsearNombreArchivo } from "../src/ingest/nombre-archivo.js";
import * as M from "./helpers/muestras.js";

// Archivos «sin movimientos» (con o sin imagen) y clasificación de imágenes con datos sintéticos.
const NOMBRE = "CR91010710102200000001 0826 AAA.xlsx";
const leer = async (buf: Buffer) => leerEstadoDeCuenta(await leerLibro(buf), parsearNombreArchivo(NOMBRE));

describe("textos de «archivo sin movimientos»", () => {
  it("el texto es el mismo con o sin imagen y no habla de capturas ni de pedir el Excel", () => {
    const t = textoSaldo({ estado: "no_verificable", razon: "sin_movimientos" })!;
    expect(t.queSePaso).toBe("El archivo no tiene movimientos de este mes.");
    expect(t.queSignifica).toBe("Se entiende que la cuenta no tuvo actividad, por eso se da por revisada.");
    expect(t.queHacer).toBe("Si la cuenta sí tuvo movimientos, pida el estado completo al banco.");
    expect(t.motivo).not.toMatch(/captura|imagen|Excel|CSV|Tesorería indica|nada que hacer|\(/);
  });

  it("«sin movimientos» se reconoce por la razón guardada y también en archivos guardados con la versión anterior", () => {
    expect(esSinMovimientos({ estado: "no_verificable", razon: "sin_movimientos" })).toBe(true);
    expect(esSinMovimientos({ estado: "no_verificable", motivo: "sin movimientos" })).toBe(true);
    expect(esSinMovimientos({ estado: "no_verificable", razon: "un_solo_saldo" })).toBe(false);
    expect(esSinMovimientos({ estado: "cuadra" })).toBe(false);
    expect(esSinMovimientos(undefined)).toBe(false);
  });
});

describe("clasificación de las imágenes por tamaño y posición", () => {
  const dibujo = (ancla: string) => `<xdr:wsDr xmlns:xdr="x">${ancla}</xdr:wsDr>`;
  const pic = `<xdr:pic><xdr:nvPicPr/></xdr:pic>`;

  it("lee las imágenes de un dibujo (anclas de dos celdas, de una celda y absolutas) e ignora lo que no es imagen", () => {
    const xml = dibujo(`
      <xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${pic}</xdr:twoCellAnchor>
      <xdr:oneCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1219200" cy="381000"/>${pic}</xdr:oneCellAnchor>
      <xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="609600" cy="190500"/>${pic}</xdr:absoluteAnchor>
      <xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:row>1</xdr:row></xdr:from><xdr:to><xdr:col>4</xdr:col><xdr:row>4</xdr:row></xdr:to><xdr:sp/></xdr:twoCellAnchor>`);
    const a = anclasDeDibujo(xml);
    expect(a).toHaveLength(3); // el cuadro de texto (sp) no cuenta
    expect(a[0]).toMatchObject({ desdeCol: 0, desdeFila: 0, hastaCol: 2, hastaFila: 3 });
    expect(a[1]).toMatchObject({ desdeCol: 5, desdeFila: 10, hastaCol: null, anchoEmu: 1219200, altoEmu: 381000 });
    expect(a[2]).toMatchObject({ desdeCol: 0, desdeFila: 0 });
  });

  it("pequeña en la esquina = probable logo; grande = posible captura; pequeña lejos de las esquinas = otra", () => {
    const hoja = { columnas: 10, filas: 45 };
    const logo = medirRelativo({ desdeCol: 0, desdeFila: 0, hastaCol: 1, hastaFila: 2, anchoEmu: null, altoEmu: null }, hoja.columnas, hoja.filas);
    const captura = medirRelativo({ desdeCol: 0, desdeFila: 8, hastaCol: 8, hastaFila: 40, anchoEmu: null, altoEmu: null }, hoja.columnas, hoja.filas);
    const centro = medirRelativo({ desdeCol: 4, desdeFila: 20, hastaCol: 5, hastaFila: 22, anchoEmu: null, altoEmu: null }, hoja.columnas, hoja.filas);
    expect(logo.areaPct).toBeLessThan(5);
    expect(clasificarImagen(logo, UMBRALES_IMAGEN_DEFECTO)).toBe("probable_logo");
    expect(captura.areaPct).toBeGreaterThan(50);
    expect(clasificarImagen(captura, UMBRALES_IMAGEN_DEFECTO)).toBe("posible_captura");
    expect(clasificarImagen(centro, UMBRALES_IMAGEN_DEFECTO)).toBe("otra");
  });

  it("el umbral es un parámetro: cambiarlo cambia la clase", () => {
    const mediana = medirRelativo({ desdeCol: 0, desdeFila: 0, hastaCol: 3, hastaFila: 9, anchoEmu: null, altoEmu: null }, 10, 45); // 40 celdas de 450: 8,9 %
    expect(clasificarImagen(mediana, { grandePct: 15, esquinaPct: 25 })).toBe("probable_logo");
    expect(clasificarImagen(mediana, { grandePct: 5, esquinaPct: 25 })).toBe("posible_captura");
    expect(clasificarImagen({ ...mediana, colInicioPct: 40, colFinPct: 70, filaInicioPct: 40, filaFinPct: 60 }, { grandePct: 15, esquinaPct: 25 })).toBe("otra");
    expect(clasificarImagen({ ...mediana, colInicioPct: 40, colFinPct: 70, filaInicioPct: 40, filaFinPct: 60 }, { grandePct: 15, esquinaPct: 60 })).toBe("probable_logo");
  });

  it("la clase de un archivo: captura gana a logo; sin imágenes, «sin imagen»; sin dato si es de una versión anterior", () => {
    const logo = { areaPct: 2, colInicioPct: 0, colFinPct: 20, filaInicioPct: 0, filaFinPct: 7 };
    const grande = { areaPct: 60, colInicioPct: 0, colFinPct: 90, filaInicioPct: 20, filaFinPct: 90 };
    expect(clasificarArchivo([logo], true, UMBRALES_IMAGEN_DEFECTO)).toBe("probable_logo");
    expect(clasificarArchivo([logo, grande], true, UMBRALES_IMAGEN_DEFECTO)).toBe("posible_captura");
    expect(clasificarArchivo([], false, UMBRALES_IMAGEN_DEFECTO)).toBe("sin_imagen");
    expect(clasificarArchivo(undefined, undefined, UMBRALES_IMAGEN_DEFECTO)).toBe("sin_dato");
    expect(clasificarArchivo(undefined, false, UMBRALES_IMAGEN_DEFECTO)).toBe("sin_imagen");
  });
});

describe("el lector mide las imágenes reales de un libro y lee el bloque de saldos del encabezado", () => {
  const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

  /** Un libro con el bloque de saldos del banco sobre una tabla vacía (sin movimientos) y una imagen pegada. */
  async function libroConLogo(opciones: { iguales: boolean; imagen: "logo" | "grande" | "ninguna"; bloque?: boolean }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet("Movimientos");
    hoja.addRow(["Periodo Seleccionado", null, null, "SOCIEDAD SINTETICA S.A."]);
    hoja.addRow(["Fecha", "Del: 01/08/2026", "Al: 28/08/2026", "BCT 0000"]);
    if (opciones.bloque !== false) {
      hoja.getRow(3).values = ["Saldo Inicial", "Saldo en Libros", "Saldo Disponible", "Fecha"];
      hoja.getRow(4).values = [1000, opciones.iguales ? 1000 : 1500, 900, "28/08/2026"];
    }
    hoja.getRow(5).values = ["CR91010710102200000001"];
    hoja.getRow(6).values = ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"];
    for (let f = 7; f <= 20; f++) hoja.getRow(f).values = [null]; // filas vacías: el archivo mide 20 filas
    if (opciones.imagen !== "ninguna") {
      const id = wb.addImage({ buffer: PNG_1X1 as unknown as ExcelJS.Buffer, extension: "png" });
      hoja.addImage(id, opciones.imagen === "logo" ? { tl: { col: 0, row: 0 }, ext: { width: 60, height: 25 } } : ({ tl: { col: 0, row: 7 }, br: { col: 5, row: 19 } } as unknown as ExcelJS.ImagePosition));
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("un logo pequeño en la esquina de un archivo sin movimientos: sin movimientos, con imagen, probable logo", async () => {
    const r = await leer(await libroConLogo({ iguales: true, imagen: "logo" }));
    expect(r.movimientos).toHaveLength(0);
    expect(r.conImagenes).toBe(true);
    expect(r.imagenes).toHaveLength(1);
    expect(clasificarImagen(r.imagenes[0]!, UMBRALES_IMAGEN_DEFECTO)).toBe("probable_logo");
    expect(esSinMovimientos(r.continuidad)).toBe(true);
  });

  it("una imagen grande que cubre buena parte de la hoja es una posible captura", async () => {
    const r = await leer(await libroConLogo({ iguales: true, imagen: "grande" }));
    expect(r.imagenes).toHaveLength(1);
    expect(clasificarImagen(r.imagenes[0]!, UMBRALES_IMAGEN_DEFECTO)).toBe("posible_captura");
  });

  it("sin imagen, la lista de imágenes queda vacía", async () => {
    const r = await leer(await libroConLogo({ iguales: true, imagen: "ninguna" }));
    expect(r.conImagenes).toBe(false);
    expect(r.imagenes).toEqual([]);
  });

  it("el bloque de saldos: qué etiquetas trae, si el saldo inicial es igual al saldo en libros y si trae «Fecha»; nunca los importes", async () => {
    const igual = (await leer(await libroConLogo({ iguales: true, imagen: "ninguna" }))).encabezadoSaldos;
    expect(igual).toEqual({ saldoInicial: true, saldoEnLibros: true, saldoDisponible: true, fecha: true, inicialIgualLibros: true });
    const distinto = (await leer(await libroConLogo({ iguales: false, imagen: "ninguna" }))).encabezadoSaldos;
    expect(distinto?.inicialIgualLibros).toBe(false);
    expect(JSON.stringify(igual)).not.toMatch(/1000|900|1500/);
    expect((await leer(await libroConLogo({ iguales: true, imagen: "ninguna", bloque: false }))).encabezadoSaldos).toBeNull();
    expect((await leer(await M.e1())).encabezadoSaldos).toBeNull(); // una muestra sin ese bloque
  });
});
