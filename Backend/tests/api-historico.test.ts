import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { coberturaDelPeriodo, rangoPorDefecto } from "../src/domain/historico.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Histórico (solo lectura), con datos inventados. Hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number;
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let categoriaId: number;

async function vencimiento(sociedadId: number, proveedor: string, fecha: Date, estado: string, movimientoId: number | null = null) {
  const o = await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador: `${proveedor}-${fecha.toISOString().slice(0, 10)}`, diaEsperadoPago: 10 } });
  return prisma.vencimiento.create({ data: { obligacionId: o.id, fecha, periodo: fecha.toISOString().slice(0, 7), estado, movimientoId, ...copiaDeObligacion(o) } });
}

beforeAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;

  // un pago cruzado en la sociedad A (cuenta con número largo: debe salir enmascarado)
  const cuenta = await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: "CR05015202001026284066", banco: "Banco X", moneda: "CRC" } });
  const archivo = await prisma.archivoImportado.create({ data: { ruta: "AAA/a.xlsx", hash: "a", sociedadId: sociedadA, cuentaId: cuenta.id, mes: "2026-09", estado: "leido" } });
  const mov = await prisma.movimiento.create({ data: { cuentaId: cuenta.id, archivoId: archivo.id, hoja: "h", fila: 1, periodo: "2026-09", fecha: dia(2026, 9, 12), debito: 1_500_000n, credito: 0n, claveDedup: "a".repeat(40) } });

  await vencimiento(sociedadA, "Luz", dia(2026, 9, 10), "pagado", mov.id);
  await vencimiento(sociedadA, "Agua", dia(2026, 10, 10), "vencido");
  await vencimiento(sociedadB, "Gas", dia(2026, 8, 10), "sin_informacion");
  await vencimiento(sociedadB, "Cable", dia(2025, 10, 31), "pagado"); // fuera del período por defecto (12 meses)
  for (let i = 1; i <= 5; i++) await vencimiento(sociedadB, `Serie${i}`, dia(2026, 7, i), "pagado");
  app = await crearApp({ reloj, modoPruebas: true });
});
afterAll(async () => {
  await vaciarUsuarios();
  await vaciarImportaciones();
});

const pedir = async (consulta = "", quien = jefa) => (await app.inject({ method: "GET", url: `/api/historico${consulta ? `?${consulta}` : ""}`, headers: encabezado(quien) })).json();

describe("GET /api/historico", () => {
  it("sin fechas abre en los últimos 12 meses (parámetro), del más reciente al más antiguo", async () => {
    const r = await pedir();
    expect(r.rango).toEqual({ desde: "2025-11-01", hasta: "2026-10-31" });
    expect(r.porDefecto).toBe(true);
    expect(r.total).toBe(8); // sin «Cable» (2025-10-31)
    const fechas = r.datos.map((v: { fecha: string }) => v.fecha);
    expect(fechas).toEqual([...fechas].sort().reverse());
    expect(fechas[0]).toBe("2026-10-10");
  });

  it("trae las columnas del Histórico: pago cruzado con cuenta enmascarada y monto en centavos", async () => {
    const r = await pedir("desde=2026-09-01&hasta=2026-09-30");
    expect(r.total).toBe(1);
    const v = r.datos[0];
    expect(v).toMatchObject({ sociedad: expect.any(String), proveedor: "Luz", periodo: "2026-09", fecha: "2026-09-10", estado: "pagado" });
    expect(v.pago).toMatchObject({ fecha: "2026-09-12", monto: 1_500_000, moneda: "CRC" });
    expect(v.pago.cuenta).not.toContain("CR05015202001026284066");
    expect(JSON.stringify(r)).not.toContain("1026284066");
  });

  it("un vencimiento sin pago trae pago null", async () => {
    const r = await pedir("desde=2026-10-01&hasta=2026-10-31&estado=vencido");
    expect(r.datos).toHaveLength(1);
    expect(r.datos[0].pago).toBeNull();
  });

  it("filtra por sociedad, estado y búsqueda; el resumen cuenta por estado", async () => {
    const porSociedad = await pedir(`sociedadId=${sociedadB}`);
    expect(porSociedad.datos.every((v: { sociedad: string }) => typeof v.sociedad === "string")).toBe(true);
    expect(porSociedad.total).toBe(6);
    expect((await pedir("estado=sin_informacion")).total).toBe(1);
    expect((await pedir("q=Luz")).total).toBe(1);
    expect((await pedir()).resumen).toMatchObject({ pagado: 6, vencido: 1, sin_informacion: 1 });
  });

  it("pagina en el servidor", async () => {
    const p1 = await pedir("porPagina=3&pagina=1");
    const p3 = await pedir("porPagina=3&pagina=3");
    expect(p1.datos).toHaveLength(3);
    expect(p1.total).toBe(8);
    expect(p1.paginas).toBe(3);
    expect(p3.datos).toHaveLength(2);
    expect(new Set([...p1.datos, ...p3.datos].map((v: { id: number }) => v.id)).size).toBe(5);
  });

  it("respeta el alcance: un Tesorero ve solo lo de su sociedad", async () => {
    const r = await pedir("", ana);
    expect(r.alcance.tipo).toBe("mio");
    expect(r.total).toBe(2);
  });

  it("indica la cobertura de estados del período: parcial, sin información", async () => {
    const r = await pedir();
    expect(r.coberturaEstados).toEqual({ primera: "2026-09-12", ultima: "2026-09-12" });
    expect(r.cobertura).toEqual({ sinInformacion: false, parcial: true });
    const fuera = await pedir("desde=2024-01-01&hasta=2024-12-31");
    expect(fuera.total).toBe(0);
    expect(fuera.cobertura.sinInformacion).toBe(true);
  });

  it("rechaza fechas inválidas o invertidas", async () => {
    for (const q of ["desde=2026-02-30", "hasta=26-10-01", "desde=2026-10-31&hasta=2026-10-01"]) {
      const res = await app.inject({ method: "GET", url: `/api/historico?${q}`, headers: encabezado(jefa) });
      expect(res.statusCode).toBe(400);
      expect(typeof res.json().error).toBe("string");
    }
  });

  it("el parámetro historico_meses cambia el período por defecto", async () => {
    await prisma.parametro.upsert({ where: { clave_ambito_categoriaId: { clave: "historico_meses", ambito: "global", categoriaId: 0 } }, create: { clave: "historico_meses", valor: "3", tipo: "entero", ambito: "global", categoriaId: 0 }, update: { valor: "3" } });
    try {
      expect((await pedir()).rango).toEqual({ desde: "2026-08-01", hasta: "2026-10-31" });
    } finally {
      await prisma.parametro.update({ where: { clave_ambito_categoriaId: { clave: "historico_meses", ambito: "global", categoriaId: 0 } }, data: { valor: "12" } });
    }
  });
});

describe("reglas puras del Histórico", () => {
  it("período por defecto: N meses de calendario contando el actual, a través del año", () => {
    expect(rangoPorDefecto("2026-10-27", 12)).toEqual({ desde: "2025-11-01", hasta: "2026-10-31" });
    expect(rangoPorDefecto("2026-02-10", 12)).toEqual({ desde: "2025-03-01", hasta: "2026-02-28" });
    expect(rangoPorDefecto("2026-10-27", 1)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
  });
  it("cobertura del período", () => {
    const c = { primera: "2026-03-10", ultima: "2026-09-30" };
    expect(coberturaDelPeriodo({ desde: "2026-04-01", hasta: "2026-06-30" }, c)).toEqual({ sinInformacion: false, parcial: false });
    expect(coberturaDelPeriodo({ desde: "2026-01-01", hasta: "2026-12-31" }, c)).toEqual({ sinInformacion: false, parcial: true });
    expect(coberturaDelPeriodo({ desde: "2025-01-01", hasta: "2026-03-09" }, c)).toEqual({ sinInformacion: true, parcial: false });
    expect(coberturaDelPeriodo({ desde: "2026-10-01", hasta: "2026-10-31" }, c)).toEqual({ sinInformacion: true, parcial: false });
    expect(coberturaDelPeriodo({ desde: "2026-01-01", hasta: "2026-12-31" }, null)).toEqual({ sinInformacion: true, parcial: false });
  });
});
