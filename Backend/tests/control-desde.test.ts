import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { importarCatalogo } from "../src/catalogo/importar.js";
import { prisma } from "../src/db.js";
import { advertenciaDiaYaPaso, mesSiguiente, periodoMasAntiguo } from "../src/domain/control-desde.js";
import { planificar, type ObligacionPlan } from "../src/domain/vencimientos.js";
import { completarControlDesdePendientes } from "../src/repositories/obligaciones.js";
import { generarVencimientos, regenerarObligacion } from "../src/vencimientos/generar.js";
import { catalogo, sembrarSociedadesDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones } from "./helpers/db.js";

const reloj = (y: number, m: number, d: number) => () => new Date(y, m - 1, d, 10, 0);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const hoy = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("dominio de «Control desde»", () => {
  it("planificar no genera nada antes del mes de control", () => {
    const ob: ObligacionPlan = { id: 1, sociedadId: 1, categoriaId: 1, proveedor: "P", cuentaEsperadaId: null, moneda: "CRC", activa: true, frecuencia: "mensual", mesArranque: null, diaEsperadoPago: 10, montoEsperado: null, controlDesde: "2026-03" };
    const r = planificar([ob], ["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(r.vencimientos.map((v) => v.periodo)).toEqual(["2026-03", "2026-04"]);
    expect(planificar([{ ...ob, controlDesde: null }], ["2026-01"]).vencimientos).toHaveLength(1); // sin definir: sin límite
  });

  it("calcula el mes más antiguo y el siguiente, también al cruzar de año", () => {
    expect(periodoMasAntiguo(["2026-05", null, "2025-11", "basura", "2026-01"])).toBe("2025-11");
    expect(periodoMasAntiguo([null])).toBeNull();
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesSiguiente("2026-09")).toBe("2026-10");
  });

  it("advierte solo si el día de pago del mes de alta ya pasó y la persona no eligió el mes", () => {
    expect(advertenciaDiaYaPaso(5, hoy(2026, 9, 10), false)).toMatchObject({ tipo: "dia_ya_paso", mesAlta: "2026-09", mesSiguiente: "2026-10" });
    expect(advertenciaDiaYaPaso(10, hoy(2026, 9, 10), false)).toBeNull(); // el mismo día aún no pasó
    expect(advertenciaDiaYaPaso(20, hoy(2026, 9, 10), false)).toBeNull();
    expect(advertenciaDiaYaPaso(5, hoy(2026, 9, 10), true)).toBeNull();
    expect(advertenciaDiaYaPaso(null, hoy(2026, 9, 10), false)).toBeNull();
    expect(advertenciaDiaYaPaso(31, hoy(2026, 2, 28), false)).toBeNull(); // el día 31 de febrero es el 28: no pasó
  });
});

describe("generación y regeneración con «Control desde»", () => {
  let id: number;
  beforeEach(async () => {
    await vaciarImportaciones();
    const s = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } });
    const c = await prisma.categoria.findFirstOrThrow();
    id = (await prisma.obligacion.create({
      data: { sociedadId: s.id, categoriaId: c.id, proveedor: "Fono", identificador: "1", diaEsperadoPago: 15, controlDesde: new Date(Date.UTC(2026, 9, 1)) },
    })).id; // desde octubre de 2026
  });
  afterAll(vaciarImportaciones);

  it("generarVencimientos no crea nada antes de ese mes", async () => {
    const r = await generarVencimientos("2026-08", "2026-12");
    expect(r.creados).toBe(3);
    const v = await prisma.vencimiento.findMany({ where: { obligacionId: id }, orderBy: { periodo: "asc" } });
    expect(v.map((x) => x.periodo)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("al mover «Control desde» a un mes posterior se quitan los futuros sin pagar anteriores; los pagados y los pasados se conservan", async () => {
    await generarVencimientos("2026-10", "2026-12");
    await prisma.vencimiento.updateMany({ where: { obligacionId: id, periodo: "2026-10" }, data: { estado: "pagado" } });
    await prisma.obligacion.update({ where: { id }, data: { controlDesde: new Date(Date.UTC(2026, 11, 1)) } });
    const r = await regenerarObligacion(id, reloj(2026, 9, 1));
    expect(r).toMatchObject({ eliminados: 1, protegidos: 1 }); // se va noviembre; octubre está pagado
    const v = await prisma.vencimiento.findMany({ where: { obligacionId: id }, orderBy: { periodo: "asc" } });
    expect(v.map((x) => x.periodo)).toEqual(["2026-10", "2026-12"]);
  });
});

describe("«Control desde» por defecto", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "control-")); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(async () => {
    await vaciarImportaciones();
    await sembrarSociedadesDelCatalogo(["AAA", "BBB"]);
  });

  const archivo = async (sociedad: string, numero: string, mes: string, estado = "leido") => {
    const s = await prisma.sociedad.findUniqueOrThrow({ where: { codigo: sociedad } });
    const cuenta = await prisma.cuenta.upsert({ where: { sociedadId_numero: { sociedadId: s.id, numero } }, create: { sociedadId: s.id, numero }, update: {} });
    await prisma.archivoImportado.create({ data: { ruta: `${sociedad}/${numero}-${mes}.xlsx`, hash: `${numero}${mes}`, sociedadId: s.id, cuentaId: cuenta.id, mes, estado } });
    return cuenta.id;
  };

  it("la importación del catálogo lo fija en el mes más antiguo con estados de la sociedad (sin cuenta esperada) o, sin estados, en el mes de carga", async () => {
    await archivo("AAA", "111", "2026-06");
    await archivo("AAA", "222", "2026-03");
    await archivo("AAA", "333", "2025-01", "error"); // un archivo con error no cuenta
    writeFileSync(path.join(dir, "c.xlsx"), await catalogo([["AAA", "Telecom", "Fono", "1", "05 DIA"], ["BBB", "Telecom", "Fono", "2", "05 DIA"]]));
    await importarCatalogo(path.join(dir, "c.xlsx"), reloj(2026, 9, 10));
    const a = await prisma.obligacion.findFirstOrThrow({ where: { identificador: "1" } });
    const b = await prisma.obligacion.findFirstOrThrow({ where: { identificador: "2" } });
    expect(iso(a.controlDesde)).toBe("2026-03-01");
    expect(iso(b.controlDesde)).toBe("2026-09-01"); // BBB sin estados: empieza el mes en que se carga
  });

  it("con cuenta esperada usa solo los estados de esa cuenta, y nunca pisa un valor ya definido", async () => {
    const c1 = await archivo("AAA", "111", "2026-06");
    await archivo("AAA", "222", "2026-02");
    const s = await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "AAA" } });
    const cat = await prisma.categoria.findFirstOrThrow();
    const con = await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: cat.id, proveedor: "P1", identificador: "1", cuentaEsperadaId: c1 } });
    const fijo = await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: cat.id, proveedor: "P2", identificador: "2", controlDesde: new Date(Date.UTC(2027, 0, 1)) } });
    expect(await completarControlDesdePendientes()).toBe(1);
    expect(iso((await prisma.obligacion.findUniqueOrThrow({ where: { id: con.id } })).controlDesde)).toBe("2026-06-01");
    expect(iso((await prisma.obligacion.findUniqueOrThrow({ where: { id: fijo.id } })).controlDesde)).toBe("2027-01-01");
  });
});

describe("API: alta y edición con «Control desde»", () => {
  let app: Awaited<ReturnType<typeof crearApp>>;
  let cat: number;
  beforeAll(async () => {
    await vaciarImportaciones();
    await sembrarSociedadesDelCatalogo(["AAA"]);
    cat = (await prisma.categoria.findFirstOrThrow()).id;
    app = await crearApp({ reloj: reloj(2026, 9, 10) });
  });
  afterAll(async () => {
    await app.close();
    await vaciarImportaciones();
  });
  const sociedadId = async () => (await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "AAA" } })).id;
  const crear = async (payload: object) => app.inject({ method: "POST", url: "/api/obligaciones", payload: { sociedadId: await sociedadId(), categoriaId: cat, ...payload } });

  it("el alta manual usa el mes de alta y avisa si el día de pago de ese mes ya pasó", async () => {
    const r = await crear({ proveedor: "Agua", identificador: "10", diaEsperadoPago: 5 });
    expect(r.statusCode).toBe(201);
    expect(r.json().datos.controlDesde).toBe("2026-09"); // el valor por defecto sigue siendo el mes de alta
    expect(r.json().advertencias).toEqual([expect.objectContaining({ tipo: "dia_ya_paso", mesAlta: "2026-09", mesSiguiente: "2026-10" })]);
    expect(iso((await prisma.obligacion.findFirstOrThrow({ where: { proveedor: "Agua" } })).controlDesde)).toBe("2026-09-01");
  });

  it("sin aviso si el día no pasó o si la persona ya eligió el mes; acepta el mes siguiente", async () => {
    expect((await crear({ proveedor: "Luz", identificador: "11", diaEsperadoPago: 20 })).json().advertencias).toEqual([]);
    const elegido = await crear({ proveedor: "Gas", identificador: "12", diaEsperadoPago: 5, controlDesde: "2026-10" });
    expect(elegido.json()).toMatchObject({ advertencias: [], datos: { controlDesde: "2026-10" } });
  });

  it("valida el formato del mes y permite editarlo (regenera los vencimientos)", async () => {
    expect((await crear({ proveedor: "X", identificador: "13", controlDesde: "octubre" })).statusCode).toBe(422);
    const o = (await prisma.obligacion.findFirstOrThrow({ where: { proveedor: "Luz" } }));
    const r = await app.inject({ method: "PATCH", url: `/api/obligaciones/${o.id}`, payload: { controlDesde: "2026-12" } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ datos: { controlDesde: "2026-12" }, regeneracion: expect.any(Object) });
    expect((await app.inject({ method: "PATCH", url: `/api/obligaciones/${o.id}`, payload: { controlDesde: "2026-13" } })).statusCode).toBe(422);
    expect(await sociedadId()).toBeGreaterThan(0);
  });
});
