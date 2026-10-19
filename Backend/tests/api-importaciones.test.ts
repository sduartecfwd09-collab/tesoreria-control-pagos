import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { calcularCobertura } from "../src/domain/cobertura.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

let app: Awaited<ReturnType<typeof crearApp>>;
let raiz: string;
const original = env.STATEMENTS_ROOT;

beforeAll(async () => {
  await vaciarImportaciones();
  raiz = mkdtempSync(path.join(tmpdir(), "estados-api-"));
  const poner = (rel: string, c: Buffer | string) => {
    mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    writeFileSync(path.join(raiz, rel), c);
  };
  poner("ZFL/CR91010710102200000001 0826 ZFL.xlsx", await M.e1());
  poner("ZFL/CR91010710102200000001 0926 ZFL.xlsx", "roto");
  poner("ZFL/CR97015107510000000007 0926 ZFL.xlsx", await M.e7());
  app = await crearApp();
});
afterAll(async () => {
  env.STATEMENTS_ROOT = original;
  await app.close();
  rmSync(raiz, { recursive: true, force: true });
  await vaciarImportaciones();
});

describe("API de importaciones", () => {
  it("POST sin STATEMENTS_ROOT o con carpeta inexistente responde 422", async () => {
    env.STATEMENTS_ROOT = undefined;
    expect((await app.inject({ method: "POST", url: "/api/importaciones" })).statusCode).toBe(422);
    env.STATEMENTS_ROOT = path.join(raiz, "no-existe");
    expect((await app.inject({ method: "POST", url: "/api/importaciones" })).statusCode).toBe(422);
  });

  it("POST importa la carpeta y GET lista archivos con estado, formato y errores", async () => {
    env.STATEMENTS_ROOT = raiz;
    const post = await app.inject({ method: "POST", url: "/api/importaciones" });
    expect(post.statusCode).toBe(200);
    expect(post.json().datos).toMatchObject({ leidos: 2, conError: 1, movimientos: 8 });

    const get = (await app.inject("/api/importaciones")).json();
    expect(get.resumen).toEqual({ archivos: 3, leidos: 2, conError: 1, movimientos: 8 });
    const e1 = get.datos.find((a: { ruta: string }) => a.ruta.includes("0826"));
    expect(e1).toMatchObject({ formato: "E1", estado: "leido", sociedad: "ZFL", mes: "2026-08", movimientos: 4 });
    expect(e1.continuidad.estado).toBe("cuadra");
    const roto = get.datos.find((a: { ruta: string }) => a.ruta.includes("0926") && a.ruta.includes("CR91"));
    expect(roto).toMatchObject({ estado: "error", formato: null, error: expect.stringMatching(/No se pudo abrir/) });
  });

  it("GET /api/movimientos filtra por sociedad, cuenta y periodo, y pagina", async () => {
    const todos = (await app.inject("/api/movimientos?sociedad=ZFL&porPagina=5")).json();
    expect(todos).toMatchObject({ total: 8, pagina: 1, porPagina: 5, paginas: 2 });
    expect(todos.datos).toHaveLength(5);
    expect(todos.datos[0]).toMatchObject({ sociedad: "ZFL", archivo: expect.stringContaining("ZFL/"), hoja: expect.any(String), fila: expect.any(Number) });
    const pag2 = (await app.inject("/api/movimientos?sociedad=ZFL&porPagina=5&pagina=2")).json();
    expect(pag2.datos).toHaveLength(3);
    const porCuenta = (await app.inject("/api/movimientos?cuenta=CR97015107510000000007&periodo=2026-09")).json();
    expect(porCuenta.total).toBe(4);
    expect(porCuenta.datos.every((m: { periodo: string }) => m.periodo === "2026-09")).toBe(true);
    expect((await app.inject("/api/movimientos?sociedad=NOEXISTE")).json().total).toBe(0);
  });

  it("valida los filtros de movimientos", async () => {
    expect((await app.inject("/api/movimientos?periodo=agosto")).statusCode).toBe(400);
    expect((await app.inject("/api/movimientos?porPagina=100000")).statusCode).toBe(400);
    expect((await app.inject("/api/movimientos?pagina=0")).statusCode).toBe(400);
  });

  it("GET /api/cobertura muestra qué hay, qué falta y qué falló", async () => {
    const { datos } = (await app.inject("/api/cobertura")).json();
    expect(datos.meses).toEqual(["2026-08", "2026-09"]);
    const bct = datos.filas.find((f: { cuenta: string }) => f.cuenta === "CR91010710102200000001");
    expect(bct.celdas["2026-08"]).toMatchObject({ estado: "leido", movimientos: 4, formato: "E1", saldo: "cuadra" });
    expect(bct.celdas["2026-09"]).toMatchObject({ estado: "error" });
    const bncr = datos.filas.find((f: { cuenta: string }) => f.cuenta === "CR97015107510000000007");
    expect(bncr.celdas["2026-08"]).toMatchObject({ estado: "falta", movimientos: 0 });
    expect(bncr.celdas["2026-09"]).toMatchObject({ estado: "leido", formato: "E7" });
  });

  it("PATCH /api/cuentas/:id permite a Tesorería editar el banco a mano", async () => {
    const cuentas = (await app.inject("/api/cuentas")).json().datos as { id: number; numero: string; bancoPorConfirmar: boolean }[];
    const c = cuentas.find((x) => x.numero === "CR97015107510000000007")!;
    expect(c.bancoPorConfirmar).toBe(true);
    const r = await app.inject({ method: "PATCH", url: `/api/cuentas/${c.id}`, payload: { banco: "BNCR" } });
    expect(r.json().datos).toMatchObject({ banco: "BNCR", bancoPorConfirmar: false });
    expect((await app.inject({ method: "PATCH", url: `/api/cuentas/${c.id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/api/cuentas/99999", payload: { banco: "X" } })).statusCode).toBe(404);
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
