import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { MOTIVO_CARPETA_SIN_SOCIEDAD, MOTIVO_NOMBRE_NO_COINCIDE, estadoDeArchivo, motivoDeArchivo, resumirEstados } from "../src/domain/estado-archivo.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

describe("estado de archivo: una sola definición", () => {
  it("leído, con error (con motivo), sin sociedad y retirado", () => {
    expect(estadoDeArchivo({ estado: "leido" })).toBe("leido");
    expect(estadoDeArchivo({ estado: "error", error: "x" })).toBe("con_error");
    expect(estadoDeArchivo({ estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD })).toBe("sin_sociedad");
    expect(estadoDeArchivo({ estado: "en_revision", motivo: MOTIVO_NOMBRE_NO_COINCIDE })).toBe("con_error");
    expect(estadoDeArchivo({ estado: "pendiente" })).toBe("con_error");
    expect(estadoDeArchivo({ estado: "leido", retiradoEn: new Date() })).toBe("retirado");
  });
  it("«Con error» y «Sin sociedad» siempre traen motivo visible; leído y retirado, ninguno", () => {
    expect(motivoDeArchivo({ estado: "error", error: "No se pudo abrir" })).toBe("No se pudo abrir");
    expect(motivoDeArchivo({ estado: "error" })).toBeTruthy();
    expect(motivoDeArchivo({ estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD })).toBe(MOTIVO_CARPETA_SIN_SOCIEDAD);
    expect(motivoDeArchivo({ estado: "en_revision", motivo: null })).toBeTruthy();
    expect(motivoDeArchivo({ estado: "leido" })).toBeNull();
    expect(motivoDeArchivo({ estado: "error", error: "x", retiradoEn: new Date() })).toBeNull();
  });
  it("Archivos = Leídos + Con error + Sin sociedad; los retirados se cuentan aparte", () => {
    expect(resumirEstados(["leido", "leido", "con_error", "sin_sociedad", "retirado", "retirado"])).toEqual({ archivos: 4, leidos: 2, conError: 1, sinSociedad: 1, retirados: 2 });
  });
});

describe("archivos retirados de la carpeta", () => {
  let raiz: string;
  let app: Awaited<ReturnType<typeof crearApp>>;
  const poner = (rel: string, c: Buffer | string) => {
    mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    writeFileSync(path.join(raiz, rel), c);
  };
  const A = "ZFL/CR91010710102200000001 0826 ZFL.xlsx";
  const B = "ZFL/CR97015107510000000007 0926 ZFL.xlsx";
  const importaciones = async () => (await app.inject("/api/importaciones")).json();
  const cobertura = async () => (await app.inject("/api/cobertura")).json().datos;

  beforeAll(async () => {
    await vaciarImportaciones();
    await sembrarSociedad("ZFL", "Sociedad inventada ZFL");
    raiz = mkdtempSync(path.join(tmpdir(), "estados-retirados-"));
    poner(A, await M.e1());
    poner(B, await M.e7());
    poner("ZFL/CR96010710102100000006 0826 ZFL.xlsx", "roto");
    poner("SINSOC/CR91010710102200000009 0826 SINSOC.xlsx", await M.e1({ iban: "CR91010710102200000009" }));
    app = await crearApp();
  });
  afterAll(async () => {
    await app.close();
    rmSync(raiz, { recursive: true, force: true });
    await vaciarImportaciones();
  });

  it("las tarjetas suman y la cobertura enlaza cada celda con problema a su motivo", async () => {
    await importarCarpeta(raiz);
    const { resumen, datos } = await importaciones();
    expect(resumen).toMatchObject({ archivos: 4, leidos: 2, conError: 1, sinSociedad: 1, retirados: 0 });
    expect(resumen.archivos).toBe(resumen.leidos + resumen.conError + resumen.sinSociedad);
    for (const a of datos) if (a.estado === "con_error" || a.estado === "sin_sociedad") expect(a.motivo).toBeTruthy();

    const celdas = (await cobertura()).filas.flatMap((f: { celdas: Record<string, { estado: string }> }) => Object.values(f.celdas)) as { estado: string; archivoId?: number; error?: string }[];
    const conProblema = celdas.filter((c) => c.estado === "error" || c.estado === "sin_sociedad");
    expect(conProblema.map((c) => c.estado).sort()).toEqual(["error", "sin_sociedad"]);
    for (const c of conProblema) {
      expect(c.error).toBeTruthy();
      expect(datos.some((a: { id: number }) => a.id === c.archivoId)).toBe(true); // el detalle tiene ese archivo
    }
  });

  it("un archivo que ya no está en la carpeta se marca retirado: no se borra y no cuenta en totales ni cobertura", async () => {
    const antes = await prisma.archivoImportado.count();
    const movsAntes = await prisma.movimiento.count();
    unlinkSync(path.join(raiz, A));
    expect((await importarCarpeta(raiz)).retirados).toBe(1);

    expect(await prisma.archivoImportado.count()).toBe(antes); // se conserva el registro
    expect(await prisma.movimiento.count()).toBe(movsAntes); // y su historial
    const { resumen, datos } = await importaciones();
    expect(resumen).toMatchObject({ archivos: 3, leidos: 1, conError: 1, sinSociedad: 1, retirados: 1 });
    expect(resumen.movimientos).toBe(datos.filter((a: { estado: string }) => a.estado !== "retirado").reduce((s: number, a: { movimientos: number }) => s + a.movimientos, 0));
    const retirado = datos.find((a: { estado: string }) => a.estado === "retirado");
    expect(retirado).toMatchObject({ motivo: null, movimientos: 0 });
    const cob = await cobertura();
    expect(cob.filas.map((f: { cuenta: string }) => f.cuenta)).not.toContain("****0001"); // la cuenta del retirado no aparece en la cobertura
  });

  it("si el archivo vuelve a aparecer se reactiva", async () => {
    poner(A, await M.e1());
    const r = await importarCarpeta(raiz);
    expect(r.retirados).toBe(0);
    expect(r.sinCambios).toBe(1); // mismo contenido: no se vuelve a leer, solo se reactiva
    const { resumen } = await importaciones();
    expect(resumen).toMatchObject({ archivos: 4, leidos: 2, retirados: 0 });
    expect((await prisma.archivoImportado.findMany({ where: { retiradoEn: { not: null } } })).length).toBe(0);
  });

  it("los movimientos de un retirado no cuentan para las sociedades con estados", async () => {
    unlinkSync(path.join(raiz, A));
    unlinkSync(path.join(raiz, B));
    unlinkSync(path.join(raiz, "ZFL/CR96010710102100000006 0826 ZFL.xlsx"));
    await importarCarpeta(raiz);
    const { resumen } = await importaciones();
    expect(resumen.leidos).toBe(0);
    expect(resumen.movimientos).toBe(0);
    const r = (await app.inject("/api/obligaciones/resumen")).json().datos;
    expect(r.sociedadesSinEstadosNiObligaciones).toContain("Sociedad inventada ZFL");
  });
});
