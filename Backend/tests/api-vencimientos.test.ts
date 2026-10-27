import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { generarRango, vaciarImportaciones } from "./helpers/db.js";

let app: Awaited<ReturnType<typeof crearApp>>;
let mensual: number;

beforeAll(async () => {
  await vaciarImportaciones();
  const s = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } });
  const b = await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } });
  const c = await prisma.categoria.upsert({ where: { nombreNormalizado: "telecom" }, create: { nombre: "Telecom", nombreNormalizado: "telecom" }, update: {} }); // no depende de otras pruebas
  mensual = (await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: c.id, proveedor: "Fono", identificador: "0001", diaEsperadoPago: 15 } })).id;
  await prisma.obligacion.create({ data: { sociedadId: b.id, categoriaId: c.id, proveedor: "Otro", identificador: "0002", diaEsperadoPago: 31 } });
  await prisma.obligacion.create({ data: { sociedadId: b.id, categoriaId: c.id, proveedor: "SinDia", identificador: "0003" } });
  await generarRango("2026-08", "2026-09");
  app = await crearApp({ reloj: () => new Date(2026, 8, 10, 9, 0) }); // hoy: 10 sep 2026
});
afterAll(async () => {
  await app.close();
  await vaciarImportaciones();
});

describe("calendario automático", () => {
  it("ya no hay ruta para generar vencimientos a mano", async () => {
    expect((await app.inject({ method: "POST", url: "/api/vencimientos/generar", payload: {} })).statusCode).toBe(404);
  });

  it("generó los vencimientos de las obligaciones con día y omitió la que no lo tiene", async () => {
    expect(await prisma.vencimiento.count()).toBe(4);
  });
});

describe("GET /api/vencimientos", () => {
  it("lista por periodo con el estado proyectado y marca los futuros según el reloj", async () => {
    const r = (await app.inject("/api/vencimientos?periodo=2026-09")).json();
    expect(r).toMatchObject({ total: 2, hoy: "2026-09-10" });
    expect(r.datos[0]).toMatchObject({ sociedad: "Sociedad AAA", proveedor: "Fono", fecha: "2026-09-15", estado: "proyectado", conciliado: false, futuro: true, moneda: "CRC" });
    expect(r.datos[1]).toMatchObject({ sociedad: "Sociedad BBB", fecha: "2026-09-30" });
    const ago = (await app.inject("/api/vencimientos?periodo=2026-08")).json();
    expect(ago.datos.every((v: { futuro: boolean }) => !v.futuro)).toBe(true);
  });

  it("filtra por sociedad, categoría, rango y búsqueda, pagina y valida los filtros", async () => {
    expect((await app.inject("/api/vencimientos?sociedad=bbb")).json().total).toBe(2);
    expect((await app.inject("/api/vencimientos?desde=2026-09&hasta=2026-09&q=fono")).json().total).toBe(1);
    const c = await prisma.categoria.findFirstOrThrow({ where: { nombre: "Telecom" } });
    expect((await app.inject(`/api/vencimientos?categoria=${c.id}`)).json().total).toBe(4);
    const p = (await app.inject("/api/vencimientos?porPagina=3&pagina=2")).json();
    expect(p).toMatchObject({ total: 4, paginas: 2 });
    expect(p.datos).toHaveLength(1);
    expect((await app.inject("/api/vencimientos?periodo=septiembre")).statusCode).toBe(400);
  });

  it("GET /api/vencimientos/periodos lista los meses generados", async () => {
    expect((await app.inject("/api/vencimientos/periodos")).json().datos).toEqual([
      { periodo: "2026-08", total: 2 },
      { periodo: "2026-09", total: 2 },
    ]);
  });
});

describe("edición de obligaciones y vencimientos", () => {
  it("al editar el monto por el API se ajustan solo los vencimientos futuros y el día no se cambia por aquí", async () => {
    const dia = await app.inject({ method: "PATCH", url: `/api/obligaciones/${mensual}`, payload: { diaEsperadoPago: 20 } });
    expect(dia.statusCode).toBe(422);
    const r = (await app.inject({ method: "PATCH", url: `/api/obligaciones/${mensual}`, payload: { montoEsperado: 5000 } })).json();
    expect(r.regeneracion).toEqual({ creados: 0, actualizados: 1, eliminados: 0, protegidos: 0 });
    const v = (await app.inject("/api/vencimientos?q=fono")).json().datos;
    expect(v.map((x: { fecha: string }) => x.fecha)).toEqual(["2026-08-15", "2026-09-15"]);
    expect(v.map((x: { montoEsperado: number | null }) => x.montoEsperado)).toEqual([null, 5000]);
  });

  it("editar solo el responsable no regenera", async () => {
    const r = (await app.inject({ method: "PATCH", url: `/api/obligaciones/${mensual}`, payload: { responsable: "Ana" } })).json();
    expect(r.regeneracion).toBeNull();
  });
});
