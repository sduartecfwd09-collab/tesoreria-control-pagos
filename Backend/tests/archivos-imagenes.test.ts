import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { NOTA_SIN_MOVIMIENTOS_CON_IMAGEN } from "../src/domain/cobertura.js";
import { resumirImagenes } from "../src/domain/imagenes.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { tieneImagenes } from "../src/ingest/quitar-dibujos.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Archivos SINTÉTICOS: la «imagen» son bytes inventados dentro de xl/media; el lector nunca la interpreta.
async function conImagen(libro: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(libro);
  zip.file("xl/media/image1.png", Buffer.from([1, 2, 3, 4]));
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("detección de imágenes (solo por el nombre de las partes del archivo)", () => {
  it("distingue un libro con imagen de uno sin ella", async () => {
    const limpio = await M.e1();
    expect(await tieneImagenes(limpio)).toBe(false);
    expect(await tieneImagenes(await conImagen(limpio))).toBe(true);
    expect(await tieneImagenes(Buffer.from("no es un zip"))).toBe(false);
  });
});

describe("resumen por sociedad y mes", () => {
  const leido = (sociedad: string, mes: string, numMovimientos: number, conImagenes?: boolean, extra: object = {}) =>
    ({ sociedad, mes, estado: "leido", numMovimientos, detalle: conImagenes === undefined ? {} : { conImagenes }, ...extra });

  it("cuenta los archivos con imagen y, de ellos, los de cero movimientos; los retirados y los sin dato no entran", () => {
    const r = resumirImagenes([
      leido("A", "2026-09", 0, true),
      leido("A", "2026-09", 10, true),
      leido("A", "2026-09", 0, false),
      leido("A", "2026-10", 0, true),
      leido("B", "2026-10", 5, false),
      leido("B", "2026-10", 0, undefined), // leído antes de registrar el dato
      leido("A", "2026-10", 0, true, { retiradoEn: new Date() }),
    ]);
    expect(r.filas).toEqual([
      { sociedad: "A", mes: "2026-09", archivos: 3, conImagen: 2, conImagenSinMovimientos: 1 },
      { sociedad: "A", mes: "2026-10", archivos: 1, conImagen: 1, conImagenSinMovimientos: 1 },
    ]);
    expect(r).toMatchObject({ conImagen: 3, conImagenSinMovimientos: 2, sinDato: 1 });
  });
});

describe("importación y pantalla de archivos importados", () => {
  let raiz: string;
  let app: Awaited<ReturnType<typeof crearApp>>;

  beforeAll(async () => {
    await vaciarImportaciones();
    await sembrarSociedad("ZFL", "Sociedad inventada ZFL");
    raiz = mkdtempSync(path.join(tmpdir(), "estados-imagenes-"));
    const poner = (rel: string, c: Buffer) => {
      mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
      writeFileSync(path.join(raiz, rel), c);
    };
    // agosto: con imagen y sin movimientos; septiembre: con imagen y con movimientos; octubre: sin imagen y sin movimientos
    poner("ZFL/CR91010710102200000001 0826 ZFL.xlsx", await conImagen(await M.e1({ movs: [] })));
    poner("ZFL/CR91010710102200000001 0926 ZFL.xlsx", await conImagen(await M.e1({ mes: 9, movs: [{ y: 2026, m: 9, d: 3, ref: "R-1", desc: "Pago inventado", deb: 10 }] })));
    poner("ZFL/CR91010710102200000001 1026 ZFL.xlsx", await M.e1({ mes: 10, movs: [] }));
    await importarCarpeta(raiz);
    app = await crearApp();
  });
  afterAll(async () => {
    await app.close();
    rmSync(raiz, { recursive: true, force: true });
    await vaciarImportaciones();
  });

  it("registra si el archivo trae imágenes y la lista lo informa (sin rutas ni contenido)", async () => {
    const r = (await app.inject("/api/importaciones")).json();
    const por = Object.fromEntries(r.datos.map((a: { mes: string; conImagenes: boolean | null }) => [a.mes, a.conImagenes]));
    expect(por).toEqual({ "2026-08": true, "2026-09": true, "2026-10": false });
    expect(r.imagenes).toMatchObject({ conImagen: 2, conImagenSinMovimientos: 1, sinDato: 0 });
    expect(r.imagenes.filas).toEqual([
      expect.objectContaining({ mes: "2026-08", conImagen: 1, conImagenSinMovimientos: 1 }),
      expect.objectContaining({ mes: "2026-09", conImagen: 1, conImagenSinMovimientos: 0 }),
    ]);
  });

  it("la celda de cobertura marca «Sin movimientos (con imagen): revisar» solo con imagen y cero movimientos, sin cambiar el estado leído", async () => {
    const celdas = (await app.inject("/api/cobertura")).json().datos.filas[0].celdas;
    expect(celdas["2026-08"]).toMatchObject({ estado: "leido", movimientos: 0, nota: NOTA_SIN_MOVIMIENTOS_CON_IMAGEN });
    expect(celdas["2026-09"].nota).toBeUndefined();
    expect(celdas["2026-10"]).toMatchObject({ estado: "leido", movimientos: 0 });
    expect(celdas["2026-10"].nota).toBeUndefined();
  });

  it("no cambia cómo cuentan para la cobertura del cruce: el archivo con imagen y sin movimientos sigue siendo un archivo leído", async () => {
    const leidos = await prisma.archivoImportado.count({ where: { estado: "leido", retiradoEn: null } });
    expect(leidos).toBe(3);
  });
});
