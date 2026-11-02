import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { esFechaIso } from "../src/domain/vencimientos.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Filtro por día exacto (fechaDesde y fechaHasta) en /api/vencimientos, con datos inventados.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number;
let jefa: number;

const FECHAS: [number, number, number][] = [[2026, 10, 1], [2026, 10, 15], [2026, 10, 31], [2026, 11, 1], [2026, 12, 31], [2027, 1, 1]];

beforeAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  const a = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } });
  const b = await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } });
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  for (const [sociedad, prefijo] of [[a.id, "A"], [b.id, "B"]] as const) {
    for (const [i, [y, m, d]] of FECHAS.entries()) {
      const o = await prisma.obligacion.create({ data: { sociedadId: sociedad, categoriaId, proveedor: `${prefijo}${i}`, identificador: `${prefijo}${i}`, diaEsperadoPago: 10 } });
      await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha: dia(y, m, d), periodo: `${y}-${String(m).padStart(2, "0")}`, estado: "proyectado", ...copiaDeObligacion(o) } });
    }
  }
  app = await crearApp({ reloj, modoPruebas: true });
});
afterAll(async () => {
  await vaciarUsuarios();
  await vaciarImportaciones();
});

const pedir = async (consulta: string, quien = jefa) => (await app.inject({ method: "GET", url: `/api/vencimientos?${consulta}`, headers: encabezado(quien) })).json();
const fechas = (r: { datos: { fecha: string }[] }) => r.datos.map((v) => v.fecha.slice(0, 10)).sort();

describe("filtro por día exacto", () => {
  it("incluye el primer y el último día del rango", async () => {
    const r = await pedir("fechaDesde=2026-10-01&fechaHasta=2026-10-31");
    expect(new Set(fechas(r))).toEqual(new Set(["2026-10-01", "2026-10-15", "2026-10-31"]));
    expect(r.total).toBe(6);
  });

  it("un solo día", async () => {
    const r = await pedir("fechaDesde=2026-10-15&fechaHasta=2026-10-15");
    expect(fechas(r)).toEqual(["2026-10-15", "2026-10-15"]);
  });

  it("cruza de un mes a otro y de un año a otro", async () => {
    expect(new Set(fechas(await pedir("fechaDesde=2026-10-31&fechaHasta=2026-11-01")))).toEqual(new Set(["2026-10-31", "2026-11-01"]));
    const r = await pedir("fechaDesde=2026-12-31&fechaHasta=2027-01-01");
    expect(r.total).toBe(4);
    expect(new Set(fechas(r))).toEqual(new Set(["2026-12-31", "2027-01-01"]));
  });

  it("solo fechaDesde o solo fechaHasta", async () => {
    expect((await pedir("fechaDesde=2026-12-31")).total).toBe(4);
    expect((await pedir("fechaHasta=2026-10-01")).total).toBe(2);
  });

  it("se combina con el periodo: el día afina dentro del mes y no sale de él", async () => {
    const r = await pedir("periodo=2026-10&fechaDesde=2026-10-10&fechaHasta=2026-11-20");
    expect(new Set(fechas(r))).toEqual(new Set(["2026-10-15", "2026-10-31"]));
  });

  it("periodo, desde y hasta siguen funcionando igual", async () => {
    expect((await pedir("periodo=2026-10")).total).toBe(6);
    expect((await pedir("desde=2026-10&hasta=2026-11")).total).toBe(8);
  });

  it("respeta el alcance: un Tesorero solo ve lo de su sociedad", async () => {
    const r = await pedir("fechaDesde=2026-10-01&fechaHasta=2026-10-31", ana);
    expect(r.total).toBe(3);
    expect(r.alcance.tipo).toBe("mio");
  });

  it("rechaza fechas inválidas o invertidas con un mensaje claro", async () => {
    for (const q of ["fechaDesde=2026-02-30", "fechaHasta=26-10-01", "fechaDesde=2026-10-31&fechaHasta=2026-10-01"]) {
      const res = await app.inject({ method: "GET", url: `/api/vencimientos?${q}`, headers: encabezado(jefa) });
      expect(res.statusCode).toBe(400);
      expect(typeof res.json().error).toBe("string");
    }
  });
});

describe("esFechaIso", () => {
  it("acepta días reales y rechaza los que no existen", () => {
    expect(esFechaIso("2028-02-29")).toBe(true);
    expect(esFechaIso("2026-02-29")).toBe(false);
    expect(esFechaIso("2026-13-01")).toBe(false);
    expect(esFechaIso("2026-1-01")).toBe(false);
  });
});
