import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db.js";
import { catalogo, sembrarSociedadesDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones } from "./helpers/db.js";

let app: Awaited<ReturnType<typeof crearApp>>;
let dir: string;
const original = env.CATALOGO_FILE;
type Ob = { id: number; identificador: string; proveedor: string; sociedad: string; etiquetas: { codigo: string }[] } & Record<string, unknown>;

const listar = async (qs = "") => (await app.inject(`/api/obligaciones${qs}`)).json() as { datos: Ob[]; total: number; paginas: number };
const porId = async (identificador: string, proveedor?: string) =>
  (await listar("?porPagina=500")).datos.find((o) => o.identificador === identificador && (!proveedor || o.proveedor === proveedor))!;
/** Alta por el API: la sociedad se indica con su abreviatura de prueba y se envía como sociedadId (así la usa el Frontend). */
const alta = async (payload: { sociedad?: string } & Record<string, unknown>) => {
  const { sociedad, ...resto } = payload;
  const sociedadId = sociedad ? (await prisma.sociedad.findUniqueOrThrow({ where: { codigo: sociedad.toUpperCase() } })).id : undefined;
  return app.inject({ method: "POST", url: "/api/obligaciones", payload: { ...(sociedadId ? { sociedadId } : {}), ...resto } });
};
const patch = (id: number, payload: object) => app.inject({ method: "PATCH", url: `/api/obligaciones/${id}`, payload });

beforeAll(async () => {
  await vaciarImportaciones();
  await sembrarSociedadesDelCatalogo(["AAA", "BBB", "DM"]); // DM: sociedad sin obligaciones
  dir = mkdtempSync(path.join(tmpdir(), "catalogo-api-"));
  writeFileSync(path.join(dir, "catalogo.xlsx"), await catalogo());
  writeFileSync(path.join(dir, "sin-cabecera.xlsx"), await catalogo([], { cabecera: ["Otra", "Cosa"] }));
  app = await crearApp();
});
afterAll(async () => {
  env.CATALOGO_FILE = original;
  await app.close();
  rmSync(dir, { recursive: true, force: true });
  await vaciarImportaciones();
});

describe("POST /api/catalogo/importar", () => {
  it("responde 422 si CATALOGO_FILE falta, no existe o no tiene la cabecera", async () => {
    const importar = () => app.inject({ method: "POST", url: "/api/catalogo/importar" });
    env.CATALOGO_FILE = undefined;
    expect((await importar()).json()).toEqual({ error: "CATALOGO_FILE no está configurada en el servidor" });
    env.CATALOGO_FILE = path.join(dir, "no-existe.xlsx");
    expect((await importar()).statusCode).toBe(422);
    env.CATALOGO_FILE = path.join(dir, "sin-cabecera.xlsx");
    expect((await importar()).json().error).toMatch(/No se encontró la cabecera/);
  });

  it("importa el catálogo y reimportar no duplica", async () => {
    env.CATALOGO_FILE = path.join(dir, "catalogo.xlsx");
    const r1 = await app.inject({ method: "POST", url: "/api/catalogo/importar" });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().datos).toMatchObject({ creadas: 6, porSociedad: { AAA: 4, BBB: 2 } });
    const r2 = (await app.inject({ method: "POST", url: "/api/catalogo/importar" })).json();
    expect(r2.datos).toMatchObject({ creadas: 0, sinCambios: 6 });
  });
});

describe("catálogo: lectura", () => {
  it("GET /api/sociedades incluye las que no tienen obligaciones y GET /api/categorias cuenta", async () => {
    const s = (await app.inject("/api/sociedades")).json().datos;
    expect(s.map((x: { codigo: string }) => x.codigo)).toEqual(["AAA", "BBB", "DM"]);
    expect(s.find((x: { codigo: string }) => x.codigo === "DM").obligaciones).toBe(0);
    const c = (await app.inject("/api/categorias")).json().datos;
    expect(c.find((x: { nombre: string }) => x.nombre === "Electricidad").obligaciones).toBe(3);
  });

  it("GET /api/obligaciones filtra por sociedad, categoría, activa, búsqueda y faltantes, y pagina", async () => {
    expect((await listar("?sociedad=aaa")).total).toBe(4);
    const tel = (await app.inject("/api/categorias")).json().datos.find((x: { nombre: string }) => x.nombre === "Telecom");
    expect((await listar(`?categoria=${tel.id}`)).total).toBe(2);
    expect((await listar("?q=luz")).total).toBe(3);
    expect((await listar("?q=0001234")).total).toBe(2);
    expect((await listar("?falta=monto")).total).toBe(6);
    expect((await listar("?activa=false")).total).toBe(0);
    const pag = await listar("?porPagina=4&pagina=2");
    expect(pag).toMatchObject({ total: 6, paginas: 2 });
    expect(pag.datos).toHaveLength(2);
  });

  it("valida los filtros", async () => {
    for (const qs of ["?activa=si", "?categoria=abc", "?falta=todo", "?pagina=0", "?porPagina=1000"]) {
      const r = await app.inject(`/api/obligaciones${qs}`);
      expect(r.statusCode, qs).toBe(400);
      expect(r.json().error).toEqual(expect.any(String));
    }
  });

  it("cada obligación trae sus observaciones (solo problemas reales) y su estado; monto, cuenta y responsable ausentes no se señalan", async () => {
    const o = await porId("00012345");
    expect(o).toMatchObject({ sociedad: "Sociedad AAA", diaEsperadoPago: 15, frecuencia: "mensual", moneda: "CRC", montoEsperado: null, cuentaEsperada: null });
    expect(o).toMatchObject({ etiquetas: [], estado: "activa", frecuenciaPorConfirmar: true, monedaPorConfirmar: true }); // lo supuesto se conserva como dato, no como observación
    const repetido = await porId("77777777", "Fono Uno");
    expect(repetido.etiquetas.map((e) => e.codigo)).toContain("id_repetido");
    expect(repetido.estado).toBe("en_revision");
    expect((await porId("CR12000000000000000001")).etiquetas.map((e) => e.codigo)).toContain("formato_iban");
  });

  it("GET /api/obligaciones/resumen reporta las alertas de calidad", async () => {
    const r = (await app.inject("/api/obligaciones/resumen")).json().datos;
    expect(r).toMatchObject({
      total: 6, activas: 6, sinMonto: 6, sinCuenta: 6, sinResponsable: 6, sinDia: 0,
      sociedadesSinObligaciones: [], sociedadesSinEstadosNiObligaciones: ["Sociedad DM"],
      porSociedad: { "Sociedad AAA": 4, "Sociedad BBB": 2, "Sociedad DM": 0 },
      porCategoria: { Electricidad: 3, Telecom: 2, CCSS: 1 },
    });
    expect(r.identificadoresRepetidos).toEqual([expect.objectContaining({ sociedad: "Sociedad AAA", identificador: "77777777", proveedores: ["Fono Uno", "Fono Dos"] })]);
    expect(r.formatoIban).toEqual([expect.objectContaining({ sociedad: "Sociedad BBB", proveedor: "Luz Dos" })]);
  });
});

describe("identificador duplicado: avisa, no bloquea", () => {
  const crear = alta;
  it("el alta con un identificador que ya existe devuelve el aviso con sociedad, categoría y proveedor de la otra (sin ceros) y se confirma con «Es intencional»", async () => {
    const cat = (await app.inject("/api/categorias")).json().datos[0];
    const base = { sociedad: "DM", categoriaId: cat.id, proveedor: "Proveedor Nuevo", identificador: "12345", diaEsperadoPago: 7 }; // existe como 00012345 en AAA
    const aviso = await crear(base);
    expect(aviso.statusCode).toBe(409);
    expect(aviso.json()).toMatchObject({
      campo: "identificador",
      advertencia: { tipo: "identificador_duplicado", otras: [{ sociedad: "Sociedad AAA", categoria: "Electricidad", proveedor: "Luz Uno", activa: true }] },
    });
    expect(JSON.stringify(aviso.json())).not.toContain("12345"); // el aviso no repite el identificador
    expect(await prisma.obligacion.count({ where: { proveedor: "Proveedor Nuevo" } })).toBe(0);

    const ok = await crear({ ...base, esIntencional: true });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().datos).toMatchObject({ identificador: "12345", proveedor: "Proveedor Nuevo" }); // guardado como texto tal cual
    expect(ok.json().datos).not.toHaveProperty("esIntencional");
  });

  it("solo bloquea si coinciden sociedad, proveedor, identificador y categoría; con otra categoría avisa y se confirma", async () => {
    const cats = (await app.inject("/api/categorias")).json().datos as { id: number; nombre: string }[];
    const base = { sociedad: "DM", proveedor: "Paquete Combo", identificador: "4040", diaEsperadoPago: 9 };
    expect((await crear({ ...base, categoriaId: cats[0]!.id })).statusCode).toBe(201);
    const igual = await crear({ ...base, identificador: "004040", categoriaId: cats[0]!.id, esIntencional: true });
    expect(igual.statusCode).toBe(409); // mismos cuatro datos (sin ceros): bloquea aunque se diga «intencional»
    expect(igual.json()).not.toHaveProperty("advertencia");
    const otra = await crear({ ...base, categoriaId: cats[1]!.id });
    expect(otra.statusCode).toBe(409);
    expect(otra.json().advertencia).toMatchObject({ tipo: "identificador_duplicado", otras: [{ proveedor: "Paquete Combo", categoria: cats[0]!.nombre }] });
    expect((await crear({ ...base, categoriaId: cats[1]!.id, esIntencional: true })).statusCode).toBe(201);
  });

  it("la otra obligación cuenta aunque esté inactiva", async () => {
    const cat = (await app.inject("/api/categorias")).json().datos[0];
    const o = await porId("000999888777");
    await patch(o.id, { activa: false });
    const r = await crear({ sociedad: "DM", categoriaId: cat.id, proveedor: "Otro Nuevo", identificador: "999888777" });
    expect(r.statusCode).toBe(409);
    expect(r.json().advertencia.otras[0]).toMatchObject({ activa: false, sociedad: "Sociedad BBB" });
    await patch(o.id, { activa: true });
  });
});

describe("catálogo: edición y alta", () => {
  it("PATCH guarda los campos editables, confirma los supuestos y protege el día de la reimportación", async () => {
    const o = await porId("00012346");
    const r = await patch(o.id, { frecuencia: "trimestral", mesArranque: 2, montoEsperado: 1_500_000, moneda: "USD" });
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toMatchObject({
      frecuencia: "trimestral", frecuenciaPorConfirmar: false, mesArranque: 2, diaEsperadoPago: 10,
      montoEsperado: 1_500_000, moneda: "USD", monedaPorConfirmar: false,
    });
    await app.inject({ method: "POST", url: "/api/catalogo/importar" });
    expect(await porId("00012346")).toMatchObject({ diaEsperadoPago: 10, frecuencia: "trimestral", montoEsperado: 1_500_000 });
    // al volver a mensual se limpia el mes de arranque
    expect((await patch(o.id, { frecuencia: "mensual" })).json().datos.mesArranque).toBeNull();
  });

  it("PATCH no cambia un día ya definido (exige motivo y autor: servicio aparte) pero sí permite indicarlo si falta", async () => {
    const o = await porId("00012345");
    const r = await patch(o.id, { diaEsperadoPago: 20 });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ campo: "diaEsperadoPago" });
    expect((await patch(o.id, { diaEsperadoPago: 15 })).statusCode).toBe(200); // el mismo valor no es un cambio
    await prisma.obligacion.update({ where: { id: o.id }, data: { diaEsperadoPago: null } });
    const lleno = await patch(o.id, { diaEsperadoPago: 12 });
    expect(lleno.json().datos).toMatchObject({ diaEsperadoPago: 12, diaEditado: true });
    await prisma.obligacion.update({ where: { id: o.id }, data: { diaEsperadoPago: 15, diaEditado: false } });
  });

  it("el monto admite más de ₡21,4 millones (en centavos) y rechaza lo que un número no puede representar", async () => {
    const o = await porId("00012346");
    const grande = await patch(o.id, { montoEsperado: 5_000_000_000 }); // ₡50 millones
    expect(grande.statusCode).toBe(200);
    expect(grande.json().datos.montoEsperado).toBe(5_000_000_000);
    expect((await porId("00012346")).montoEsperado).toBe(5_000_000_000);
    const r = await patch(o.id, { montoEsperado: 2 ** 60 });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ campo: "montoEsperado" });
    await patch(o.id, { montoEsperado: null });
  });

  it("PATCH desactiva sin borrar, y al desactivar una del par repetido la alerta desaparece", async () => {
    const o = await porId("77777777", "Fono Dos");
    expect((await patch(o.id, { activa: false })).json().datos.activa).toBe(false);
    expect((await listar("?activa=false")).total).toBe(1);
    expect((await app.inject("/api/obligaciones/resumen")).json().datos.identificadoresRepetidos).toEqual([]);
    await patch(o.id, { activa: true });
  });

  it("PATCH valida con mensajes claros y el campo afectado", async () => {
    const o = await porId("00012345");
    const otra = await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "BBB" } });
    const ajena = await prisma.cuenta.create({ data: { sociedadId: otra.id, numero: "CR00000000000000000077" } });
    const casos: [object, number, string, RegExp][] = [
      [{ proveedor: "Otro" }, 422, "proveedor", /no se puede editar/],
      [{ diaEsperadoPago: 0 }, 422, "diaEsperadoPago", /1 a 31/],
      [{ mesArranque: 4 }, 422, "mesArranque", /solo aplica/],
      [{ cuentaEsperadaId: ajena.id }, 422, "cuentaEsperadaId", /otra sociedad/],
      [{ cuentaEsperadaId: 999_999 }, 422, "cuentaEsperadaId", /no existe/],
      [{ montoEsperado: "mucho" }, 422, "montoEsperado", /número/],
    ];
    for (const [payload, codigo, campo, msg] of casos) {
      const r = await patch(o.id, payload);
      expect(r.statusCode, JSON.stringify(payload)).toBe(codigo);
      expect(r.json()).toMatchObject({ campo, error: expect.stringMatching(msg) });
    }
    expect((await patch(o.id, {})).json().error).toBe("No se indicó ningún cambio");
    expect((await patch(999_999, { activa: true })).statusCode).toBe(404);
    expect((await patch(0, { activa: true })).statusCode).toBe(400);
  });

  it("POST crea una obligación manual y rechaza duplicados y datos inválidos", async () => {
    const cat = (await app.inject("/api/categorias")).json().datos[0];
    const crear = alta;
    const r = await crear({ sociedad: "dm", categoriaId: cat.id, proveedor: "Agua Uno", identificador: "000555", diaEsperadoPago: 5 });
    expect(r.statusCode).toBe(201);
    expect(r.json().datos).toMatchObject({ sociedad: "Sociedad DM", identificador: "000555", origen: "manual", frecuencia: "mensual", frecuenciaPorConfirmar: true });
    expect((await app.inject("/api/obligaciones/resumen")).json().datos.sociedadesSinObligaciones).toEqual([]);

    const dup = await crear({ sociedad: "DM", categoriaId: cat.id, proveedor: "AGUA UNO", identificador: "000555" });
    expect(dup.statusCode).toBe(409);
    expect((await crear({ sociedadId: 999_999, categoriaId: cat.id, proveedor: "P", identificador: "1" })).json()).toMatchObject({ campo: "sociedadId", error: "La sociedad no existe" });
    expect((await crear({ categoriaId: cat.id, proveedor: "P", identificador: "1" })).json()).toMatchObject({ campo: "sociedadId" });
    expect((await crear({ sociedad: "DM", categoriaId: cat.id, proveedor: "Grande", identificador: "9999", montoEsperado: 3_000_000_000 })).statusCode).toBe(201); // más de ₡21,4 millones
    expect((await crear({ sociedad: "DM", categoriaId: 999_999, proveedor: "P", identificador: "1" })).json()).toMatchObject({ campo: "categoriaId" });
    expect((await crear({ sociedad: "DM", categoriaId: cat.id, proveedor: "P" })).json()).toMatchObject({ campo: "identificador" });
  });
});
