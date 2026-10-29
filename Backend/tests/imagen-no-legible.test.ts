import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { esImagenNoLegible, esSinMovimientos, textoSaldo, type ContinuidadGuardada } from "../src/domain/saldo.js";
import { MOTIVOS } from "../src/domain/cruce.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones } from "./helpers/db.js";

// Textos de saldo (qué pasó / qué significa / qué hacer) y regla de la «imagen no legible», con datos inventados. Hoy = 2026-10-27.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("textos de saldo: una frase corta por línea, sin «Tesorería indica» ni «nada que hacer»", () => {
  const casos: [string, ContinuidadGuardada][] = [
    ["cuadra", { estado: "cuadra" }],
    ["no cuadra", { estado: "no_cuadra", verificados: 10, fallos: 2 }],
    ["no cuadra sin conteos", { estado: "no_cuadra" }],
    ["sin movimientos", { estado: "no_verificable", razon: "sin_movimientos" }],
    ["imagen no legible", { estado: "no_verificable", razon: "imagen_no_legible" }],
    ["un solo movimiento", { estado: "no_verificable", razon: "un_solo_saldo", movimientos: 1 }],
    ["un solo día", { estado: "no_verificable", razon: "un_solo_saldo", movimientos: 4 }],
    ["saldo vacío en todas", { estado: "no_verificable", razon: "saldo_vacio_todas" }],
    ["saldo vacío en algunas", { estado: "no_verificable", razon: "saldo_vacio_algunas", filasSinSaldo: 2, movimientos: 9 }],
    ["otro", { estado: "no_verificable", razon: "otro" }],
  ];

  it.each(casos)("%s: tres partes de una sola frase, sin términos prohibidos", (_n, c) => {
    const t = textoSaldo(c)!;
    for (const parte of [t.queSePaso, t.queSignifica, t.queHacer]) {
      expect(parte.length).toBeGreaterThan(10);
      expect(parte.endsWith(".")).toBe(true);
      expect(parte.slice(0, -1)).not.toMatch(/\.\s/); // una sola frase por línea
      expect(parte).not.toMatch(/Tesorería indica|nada que hacer/i);
    }
    expect(t.motivo).toBe(`${t.queSePaso} ${t.queSignifica} ${t.queHacer}`);
  });

  it("los tres textos pedidos, tal cual", () => {
    expect(textoSaldo({ estado: "no_verificable", razon: "sin_movimientos" })).toMatchObject({
      queSePaso: "El archivo no tiene movimientos de este mes.",
      queSignifica: "Se entiende que la cuenta no tuvo actividad, por eso se da por revisada.",
      queHacer: "Si la cuenta sí tuvo movimientos, pida el estado completo al banco.",
    });
    expect(textoSaldo({ estado: "no_verificable", razon: "imagen_no_legible" })).toMatchObject({
      queSePaso: "Los movimientos vienen como imagen y el sistema no puede leerlos.",
      queSignifica: "No se puede confirmar qué se pagó con esta cuenta.",
      queHacer: "Pida al banco el estado en Excel o CSV.",
    });
    expect(textoSaldo({ estado: "no_verificable", razon: "un_solo_saldo", movimientos: 1 })).toMatchObject({
      queSePaso: "El archivo trae un solo movimiento.",
      queSignifica: "No hay saldo anterior con qué comparar.",
      queHacer: "Si el mes tuvo más movimientos, pida el estado completo.",
    });
  });

  it("«imagen no legible» no es «sin movimientos» (no da cobertura)", () => {
    const c: ContinuidadGuardada = { estado: "no_verificable", razon: "imagen_no_legible" };
    expect(esImagenNoLegible(c)).toBe(true);
    expect(esSinMovimientos(c)).toBe(false);
    expect(esImagenNoLegible({ estado: "no_verificable", razon: "sin_movimientos" })).toBe(false);
  });
});

describe("importación: logo y sin imagen dan cobertura; imagen grande no", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const IBAN = (n: number) => `CR9101071010220000000${n}`;
  let raiz: string;

  /** Un archivo sin ningún movimiento (solo encabezado) con una imagen pequeña, una grande o ninguna. */
  async function vacio(imagen: "logo" | "grande" | "ninguna"): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet("Movimientos");
    hoja.addRow(["Periodo Seleccionado"]);
    hoja.addRow(["Fecha", "Del: 01/08/2026", "Al: 28/08/2026", "BCT 0000"]);
    hoja.getRow(5).values = ["CR91010710102200000001"];
    hoja.getRow(6).values = ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"];
    for (let f = 7; f <= 20; f++) hoja.getRow(f).values = [null];
    if (imagen !== "ninguna") {
      const id = wb.addImage({ buffer: PNG as unknown as ExcelJS.Buffer, extension: "png" });
      hoja.addImage(id, imagen === "logo" ? { tl: { col: 0, row: 0 }, ext: { width: 60, height: 25 } } : ({ tl: { col: 0, row: 7 }, br: { col: 5, row: 19 } } as unknown as ExcelJS.ImagePosition));
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  beforeEach(async () => {
    await vaciarImportaciones();
    await sembrarSociedad("AAA", "Sociedad inventada AAA");
    raiz = mkdtempSync(path.join(tmpdir(), "imagen-no-legible-"));
    const poner = (rel: string, contenido: Buffer) => {
      const p = path.join(raiz, rel);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, contenido);
    };
    poner(`AAA/${IBAN(1)} 0826 AAA.xlsx`, await vacio("logo"));
    poner(`AAA/${IBAN(2)} 0826 AAA.xlsx`, await vacio("grande"));
    poner(`AAA/${IBAN(3)} 0826 AAA.xlsx`, await vacio("ninguna"));
  });
  afterAll(async () => {
    if (raiz) rmSync(raiz, { recursive: true, force: true });
    await vaciarImportaciones();
  });

  const detalleDe = async (n: number) => JSON.parse((await prisma.archivoImportado.findFirstOrThrow({ where: { ruta: { contains: IBAN(n) } } })).detalle!) as { claseImagen: string; continuidad: ContinuidadGuardada };

  it("guarda la clase de la imagen y marca «imagen no legible» solo si es grande", async () => {
    const r = await importarCarpeta(raiz, reloj);
    expect(r.leidos).toBe(3);
    expect(await detalleDe(1)).toMatchObject({ claseImagen: "probable_logo", continuidad: { razon: "sin_movimientos" } });
    expect(await detalleDe(2)).toMatchObject({ claseImagen: "posible_captura", continuidad: { razon: "imagen_no_legible" } });
    expect(await detalleDe(3)).toMatchObject({ claseImagen: "sin_imagen", continuidad: { razon: "sin_movimientos" } });
  });

  it("la API lo expone en la lista, en la ficha y en la cobertura; la imagen no legible no es «sin movimientos»", async () => {
    await importarCarpeta(raiz, reloj);
    const app = await crearApp({ reloj, modoPruebas: false });
    try {
      const lista = (await app.inject({ method: "GET", url: "/api/importaciones" })).json().datos as { id: number; archivo: string; imagenNoLegible: boolean; sinMovimientos: boolean; saldo: { queSePaso: string } }[];
      const fichas = await Promise.all(lista.map(async (a) => ({ a, ficha: (await app.inject({ method: "GET", url: `/api/archivos/${a.id}` })).json().datos })));
      const noLegibles = lista.filter((a) => a.imagenNoLegible);
      expect(noLegibles).toHaveLength(1);
      expect(noLegibles[0]!.sinMovimientos).toBe(false);
      expect(noLegibles[0]!.saldo.queSePaso).toBe("Los movimientos vienen como imagen y el sistema no puede leerlos.");
      expect(lista.filter((a) => a.sinMovimientos)).toHaveLength(2);
      expect(fichas.filter((f) => f.ficha.imagenNoLegible)).toHaveLength(1);
      const cob = (await app.inject({ method: "GET", url: "/api/cobertura" })).json().datos.filas as { celdas: Record<string, { imagenNoLegible?: boolean }> }[];
      expect(cob.filter((f) => f.celdas["2026-08"]?.imagenNoLegible)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});

describe("cobertura en el cruce: un archivo con imagen no legible no cubre", () => {
  let sociedadId: number;
  let archivoId: number;
  let obligacionId: number;
  let n = 0;
  const venc = () => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId, periodo: "2026-10" } });

  beforeEach(async () => {
    await vaciarImportaciones();
    await fijarRango(3, 3);
    sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
    const cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001234" } })).id;
    const categoria = await prisma.categoria.findFirstOrThrow();
    obligacionId = (await prisma.obligacion.create({
      data: { sociedadId, categoriaId: categoria.id, proveedor: "Luz Uno", identificador: "7771234", diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) },
    })).id;
    for (const mes of ["2026-09", "2026-10"]) {
      const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido" } });
      if (mes === "2026-10") archivoId = a.id;
    }
    const mov = (fecha: Date, descripcion: string) =>
      prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito: 5000n, credito: 0n, claveDedup: `k${n}`.padEnd(40, "0") } });
    await mov(dia(2026, 9, 3), "COMISION INICIAL");
    await mov(dia(2026, 10, 26), "COMISION SIN RELACION");
  });
  afterAll(async () => {
    await fijarRango(10, 12);
    await vaciarImportaciones();
  });

  const marcar = (razon: string) =>
    prisma.archivoImportado.update({ where: { id: archivoId }, data: { detalle: JSON.stringify({ continuidad: { estado: "no_verificable", razon, movimientos: 0 } }) } });

  it("sin movimientos (logo o sin imagen): sigue cubriendo y el vencimiento sin pago queda Vencido", async () => {
    await marcar("sin_movimientos");
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("vencido");
  });

  it("imagen no legible: no cubre; el vencimiento pasa de Vencido a Sin información, nunca Vencido", async () => {
    await marcar("sin_movimientos");
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("vencido");
    await marcar("imagen_no_legible");
    await actualizarVencimientos(reloj);
    expect(await venc()).toMatchObject({ estado: "sin_informacion", motivo: MOTIVOS.sinInformacionImagen });
    await prisma.parametro.updateMany({ where: { clave: "marcar_vencido_sin_estado" }, data: { valor: "true" } });
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("sin_informacion"); // ni siquiera con el parámetro encendido
    await prisma.parametro.updateMany({ where: { clave: "marcar_vencido_sin_estado" }, data: { valor: "false" } });
  });
});
