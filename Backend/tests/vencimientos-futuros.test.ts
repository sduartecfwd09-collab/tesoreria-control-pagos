import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../src/vencimientos/diagnostico.js";
import { sinMesesFuturos } from "../src/vencimientos/diagnostico-margen.js";
import { mesesAdelante, sincronizarVencimientos } from "../src/vencimientos/generar.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarMesesAdelante, vaciarImportaciones } from "./helpers/db.js";

// Generación anticipada: 12 meses por delante. Datos inventados. Hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const desde = (periodo: string) => new Date(`${periodo}-01T00:00:00Z`);
let sociedadId: number;
let categoriaId: number;

async function crear(proveedor: string, data: object) {
  return (await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador: proveedor, controlDesde: desde("2026-10"), diaEsperadoPago: 5, ...data } })).id;
}
const periodos = async (obligacionId: number) => (await prisma.vencimiento.findMany({ where: { obligacionId }, orderBy: { periodo: "asc" } })).map((v) => v.periodo);

beforeAll(() => fijarMesesAdelante(12));
beforeEach(async () => {
  await vaciarImportaciones();
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
});
afterAll(async () => {
  await vaciarImportaciones();
  await fijarMesesAdelante(0);
});

describe("meses de vencimientos por adelantado", () => {
  it("genera hasta el fin del mes de hoy + 12 meses y respeta las cinco frecuencias y «Control desde»", async () => {
    const mensual = await crear("Mensual", {});
    const bimestral = await crear("Bimestral", { frecuencia: "bimestral", mesArranque: 10 });
    const trimestral = await crear("Trimestral", { frecuencia: "trimestral", mesArranque: 11 });
    const semestral = await crear("Semestral", { frecuencia: "semestral", mesArranque: 3 });
    const anual = await crear("Anual", { frecuencia: "anual", mesArranque: 6 });
    const tardia = await crear("Tardia", { controlDesde: desde("2027-03") });
    await sincronizarVencimientos(reloj);
    expect(await periodos(mensual)).toHaveLength(13); // octubre 2026 a octubre 2027
    expect((await periodos(mensual)).at(-1)).toBe("2027-10");
    expect(await periodos(bimestral)).toEqual(["2026-10", "2026-12", "2027-02", "2027-04", "2027-06", "2027-08", "2027-10"]);
    expect(await periodos(trimestral)).toEqual(["2026-11", "2027-02", "2027-05", "2027-08"]);
    expect(await periodos(semestral)).toEqual(["2027-03", "2027-09"]);
    expect(await periodos(anual)).toEqual(["2027-06"]);
    expect((await periodos(tardia))[0]).toBe("2027-03");
  });

  it("el parámetro manda: con 0 solo el mes en curso; sin fila o inválido, 12", async () => {
    await crear("Mensual", {});
    await fijarMesesAdelante(0);
    await sincronizarVencimientos(reloj);
    expect(await prisma.vencimiento.count()).toBe(1);
    await prisma.parametro.deleteMany({ where: { clave: "meses_vencimientos_adelante" } });
    expect(await mesesAdelante()).toBe(12);
    await prisma.parametro.create({ data: { clave: "meses_vencimientos_adelante", valor: "abc", tipo: "entero", ambito: "global", categoriaId: 0 } });
    expect(await mesesAdelante()).toBe(12);
    await prisma.parametro.updateMany({ where: { clave: "meses_vencimientos_adelante" }, data: { valor: "12" } });
  });
});

describe("los vencimientos futuros", () => {
  it("quedan Programado: nunca Vencido ni Sin información, y no generan avisos; los de fechas actuales no cambian", async () => {
    const id = await crear("Mensual", { diaEsperadoPago: 20 });
    await actualizarVencimientos(reloj);
    const todos = await prisma.vencimiento.findMany({ where: { obligacionId: id }, orderBy: { periodo: "asc" } });
    const futuros = todos.filter((v) => iso(v.fecha) > "2026-10-30"); // más allá de hoy + 3 días de aviso
    expect(futuros.length).toBeGreaterThanOrEqual(12);
    expect(new Set(futuros.map((v) => v.estado))).toEqual(new Set(["proyectado"]));
    // la fecha actual: el 20 de octubre ya pasó y no hay estados de cuenta cargados, así que sigue «Sin información»
    expect(todos.find((v) => v.periodo === "2026-10")!.estado).toBe("sin_informacion");
    const app = await crearApp({ reloj, modoPruebas: false });
    const avisos = (await app.inject("/api/avisos")).json() as { grupos: { filas: { fecha: string; estado: string }[] }[] };
    const filas = avisos.grupos.flatMap((g) => g.filas);
    expect(filas.map((f) => f.estado)).not.toContain("proyectado");
    expect(filas.every((f) => f.fecha <= "2026-10-30")).toBe(true);
  });

  it("Por vencer sigue siendo Por vencer dentro de los días de aviso", async () => {
    const id = await crear("Mensual", { diaEsperadoPago: 29 });
    await actualizarVencimientos(reloj);
    const v = await prisma.vencimiento.findMany({ where: { obligacionId: id }, orderBy: { periodo: "asc" } });
    expect(v[0]).toMatchObject({ periodo: "2026-10", estado: "por_vencer" });
    expect(v[1]).toMatchObject({ periodo: "2026-11", estado: "proyectado" });
  });
});

describe("regeneración al editar", () => {
  it("al cambiar el día se regeneran los futuros sin historial; el pasado no se toca", async () => {
    const id = await crear("Mensual", { diaEsperadoPago: 20 });
    await sincronizarVencimientos(reloj);
    await prisma.obligacion.update({ where: { id }, data: { diaEsperadoPago: 8 } });
    await sincronizarVencimientos(reloj, id);
    const v = await prisma.vencimiento.findMany({ where: { obligacionId: id }, orderBy: { periodo: "asc" } });
    expect(iso(v.find((x) => x.periodo === "2026-11")!.fecha)).toBe("2026-11-08");
    expect(iso(v.find((x) => x.periodo === "2027-10")!.fecha)).toBe("2027-10-08");
    expect(iso(v.find((x) => x.periodo === "2026-10")!.fecha)).toBe("2026-10-20"); // octubre ya pasó el 20: su fecha no se mueve
  });

  it("al cambiar la frecuencia se quitan los futuros que sobran", async () => {
    const id = await crear("Mensual", {});
    await sincronizarVencimientos(reloj);
    await prisma.obligacion.update({ where: { id }, data: { frecuencia: "trimestral", mesArranque: 1 } });
    const r = await sincronizarVencimientos(reloj, id);
    expect(r.eliminados).toBeGreaterThan(0);
    expect(await periodos(id)).toEqual(["2026-10", "2027-01", "2027-04", "2027-07", "2027-10"]); // octubre es pasado (el día 5): se conserva
  });

  it("al desactivar se quitan los futuros y se conserva el historial (lo pasado y lo pagado)", async () => {
    const id = await crear("Mensual", { controlDesde: desde("2026-08") });
    await sincronizarVencimientos(reloj);
    const pagado = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: id, periodo: "2027-02" } });
    await prisma.vencimiento.update({ where: { id: pagado.id }, data: { estado: "pagado" } }); // un futuro ya pagado se protege
    await prisma.obligacion.update({ where: { id }, data: { activa: false } });
    await sincronizarVencimientos(reloj, id);
    expect(await periodos(id)).toEqual(["2026-08", "2026-09", "2026-10", "2027-02"]); // el pasado y el futuro pagado
  });
});

describe("diagnóstico", () => {
  it("informa programado: N y los programados por sociedad y mes", async () => {
    await crear("Mensual", { diaEsperadoPago: 20 });
    await actualizarVencimientos(reloj);
    const informe = informeDiagnosticoCruce(await cruzarVencimientos(reloj), [{ id: sociedadId, codigo: "AAA" }]);
    expect(informe).toMatch(/programado: 12\b/);
    expect(informe).toContain("Programados por sociedad y mes:");
    expect(informe).toContain("AAA | 2026-11: 1");
    expect(informe).toContain("AAA | 2027-10: 1");
  });

  it("las secciones de cobertura excluyen los meses futuros; el informe base conserva programado: N", async () => {
    await crear("Mensual", { diaEsperadoPago: 20 });
    await actualizarVencimientos(reloj);
    const r = await cruzarVencimientos(reloj);
    const { r: actual, antes } = sinMesesFuturos(r, { diasDespues: 3, resultados: r.resultados });
    expect(r.datos.vencimientos).toHaveLength(13);
    expect(actual.datos.vencimientos.map((v) => v.fecha.toISOString().slice(0, 7))).toEqual(["2026-10"]);
    expect(actual.vencimientos).toBe(1);
    expect(actual.resultados).toHaveLength(1);
    expect(antes.resultados).toHaveLength(1);
    expect(informeDiagnosticoCruce(r, [{ id: sociedadId, codigo: "AAA" }])).toContain("programado: 12");
  });
});
