import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { calcularCobertura } from "../src/domain/cobertura.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

let app: Awaited<ReturnType<typeof crearApp>>;
let raiz: string;

beforeAll(async () => {
  await vaciarImportaciones();
  await sembrarSociedad("ZFL", "Sociedad inventada ZFL"); // el importador no crea sociedades
  raiz = mkdtempSync(path.join(tmpdir(), "estados-api-"));
  const poner = (rel: string, c: Buffer | string) => {
    mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    writeFileSync(path.join(raiz, rel), c);
  };
  poner("ZFL/CR91010710102200000001 0826 ZFL.xlsx", await M.e1());
  poner("ZFL/CR91010710102200000001 0926 ZFL.xlsx", "roto");
  poner("ZFL/CR97015107510000000007 0926 ZFL.xlsx", await M.e7());
  poner("SINSOC/CR91010710102200000009 0826 SINSOC.xlsx", await M.e1({ iban: "CR91010710102200000009" })); // carpeta sin sociedad: en revisión
  await importarCarpeta(raiz); // la importación se ejecuta desde el Backend, no por la API
  app = await crearApp();
});
afterAll(async () => {
  await app.close();
  rmSync(raiz, { recursive: true, force: true });
  await vaciarImportaciones();
});

const sinNumerosLargos = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/\d{8,}/);

describe("API de importaciones (solo lectura y sin datos sensibles)", () => {
  it("GET /api/importaciones lista archivos con estado, formato y errores, solo con el nombre del archivo", async () => {
    const get = (await app.inject("/api/importaciones")).json();
    expect(get.resumen).toEqual({ archivos: 4, leidos: 2, conError: 1, enRevision: 1, movimientos: 8 });
    const revisado = get.datos.find((a: { estado: string }) => a.estado === "en_revision");
    expect(revisado).toMatchObject({ motivo: "carpeta sin sociedad asignada", movimientos: 0, sociedad: null });
    const e1 = get.datos.find((a: { archivo: string }) => a.archivo.includes("0826") && a.archivo.includes("ZFL"));
    expect(e1).toMatchObject({ archivo: "CR****0001 0826 ZFL.xlsx", formato: "E1", estado: "leido", sociedad: "ZFL", mes: "2026-08", movimientos: 4, cuenta: "****0001" });
    expect(e1.continuidad.estado).toBe("cuadra");
    const roto = get.datos.find((a: { estado: string }) => a.estado === "error");
    expect(roto).toMatchObject({ formato: null, error: expect.stringMatching(/No se pudo abrir/) });
    for (const a of get.datos) {
      expect(a).not.toHaveProperty("ruta");
      expect(a.archivo).not.toMatch(/[\\/]/); // ni carpetas ni rutas
    }
    sinNumerosLargos(get);
    expect(JSON.stringify(get)).not.toContain(raiz);
  });

  it("GET /api/cobertura muestra qué hay, qué falta y qué falló, con cuentas enmascaradas", async () => {
    const respuesta = (await app.inject("/api/cobertura")).json();
    const { datos } = respuesta;
    expect(datos.meses).toEqual(["2026-08", "2026-09"]);
    const bct = datos.filas.find((f: { cuenta: string }) => f.cuenta === "****0001");
    expect(bct.celdas["2026-08"]).toMatchObject({ estado: "leido", movimientos: 4, formato: "E1", saldo: "cuadra", archivo: "CR****0001 0826 ZFL.xlsx" });
    expect(bct.celdas["2026-09"]).toMatchObject({ estado: "error" });
    const bncr = datos.filas.find((f: { cuenta: string }) => f.cuenta === "****0007");
    expect(bncr.celdas["2026-08"]).toMatchObject({ estado: "falta", movimientos: 0 });
    expect(bncr.celdas["2026-09"]).toMatchObject({ estado: "leido", formato: "E7" });
    sinNumerosLargos(respuesta);
    expect(JSON.stringify(respuesta)).not.toContain("ZFL/");
  });

  it("GET /api/cuentas enmascara el número (el servidor conserva el completo)", async () => {
    const r = (await app.inject("/api/cuentas")).json();
    expect(r.datos.length).toBeGreaterThan(0);
    for (const c of r.datos) expect(c.numero).toMatch(/^\*{4}\d{4}$/);
    sinNumerosLargos(r);
    expect((await prisma.cuenta.findMany()).some((c) => c.numero === "CR91010710102200000001")).toBe(true);
  });

  it("las rutas retiradas ya no existen: movimientos, importar por la API y edición de cuentas", async () => {
    for (const [method, url] of [["GET", "/api/movimientos"], ["GET", "/api/movimientos?sociedad=ZFL"], ["POST", "/api/importaciones"], ["PATCH", "/api/cuentas/1"]] as const) {
      const r = await app.inject({ method, url, ...(method === "PATCH" ? { payload: { banco: "X" } } : {}) });
      expect(r.statusCode, `${method} ${url}`).toBe(404);
      expect(r.json()).toEqual({ error: "No encontrado" });
    }
  });

  it("la obligación muestra la cuenta de pago enmascarada", async () => {
    const o = await prisma.obligacion.create({
      data: {
        sociedadId: (await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "ZFL" } })).id, categoriaId: (await prisma.categoria.findFirstOrThrow()).id,
        proveedor: "P", identificador: "1", cuentaEsperadaId: (await prisma.cuenta.findFirstOrThrow({ where: { numero: "CR91010710102200000001" } })).id,
      },
    });
    const r = (await app.inject(`/api/obligaciones/${o.id}`)).json();
    expect(r.datos.cuentaEsperada).toMatchObject({ numero: "****0001" });
    sinNumerosLargos((await app.inject("/api/obligaciones")).json());
    await prisma.obligacion.delete({ where: { id: o.id } });
  });
});

describe("errores sin detalles internos", () => {
  it("un fallo inesperado responde un texto claro, sin la ruta ni el mensaje original", async () => {
    const otra = await crearApp();
    otra.get("/api/_falla", async () => {
      throw new Error("ENOENT: no such file or directory, open 'C:\\datos\\estados\\CR91010710102200000001.xlsx'");
    });
    try {
      const r = await otra.inject("/api/_falla");
      expect(r.statusCode).toBe(500);
      expect(r.json()).toEqual({ error: "Ocurrió un error en el servidor" });
      expect(r.body).not.toMatch(/ENOENT|datos|xlsx|CR91/);
    } finally {
      await otra.close();
    }
  });

  it("una solicitud mal formada responde 400 con un texto fijo", async () => {
    const r = await app.inject({ method: "PUT", url: "/api/parametros/1", payload: "{roto", headers: { "content-type": "application/json" } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: "La solicitud no es válida" });
  });
});

describe("calcularCobertura", () => {
  it("un archivo con nombre fuera de convención va a «sinUbicar»", () => {
    const c = calcularCobertura([
      { ruta: "ZFL/raro.xlsx", sociedad: "ZFL", mes: null, estado: "error", numMovimientos: 0, numDuplicados: 0, banco: null, bancoPorConfirmar: null, moneda: null, monedaPorConfirmar: null, cuentaId: null, formato: null, detalle: null, error: "x" },
    ]);
    expect(c.sinUbicar).toHaveLength(1);
    expect(c.filas).toEqual([]);
  });
});
