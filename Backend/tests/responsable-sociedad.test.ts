import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// El responsable es el tesorero de la sociedad y solo lo recibe Jefatura. Datos inventados. Hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number;
let jefa: number;
let sinTesoreroId: number;

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  const conTesorero = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } });
  const sinTesorero = await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } });
  sinTesoreroId = sinTesorero.id;
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  const crear = async (sociedadId: number, identificador: string, extra: object = {}) => {
    const o = await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor: `P${identificador}`, identificador, diaEsperadoPago: 10, ...extra } });
    await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha: new Date(Date.UTC(2026, 9, 10)), periodo: "2026-10", estado: "vencido", ...copiaDeObligacion(o) } });
    return o;
  };
  await crear(conTesorero.id, "1");
  await crear(conTesorero.id, "2", { frecuenciaPorConfirmar: false });
  await crear(sinTesorero.id, "3");
});
afterAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
});

describe("el responsable es el tesorero de la sociedad y solo lo recibe Jefatura", () => {
  it("Obligaciones: Jefatura lo recibe; un tesorero, no", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const jefatura = (await app.inject({ method: "GET", url: "/api/obligaciones", headers: encabezado(jefa) })).json().datos as { proveedor: string; responsableEfectivo?: string | null }[];
    expect(Object.fromEntries(jefatura.map((o) => [o.proveedor, o.responsableEfectivo]))).toEqual({ P1: "Ana Uno", P2: "Ana Uno", P3: null });
    const tesorero = (await app.inject({ method: "GET", url: "/api/obligaciones", headers: encabezado(ana) })).json().datos as object[];
    expect(tesorero).toHaveLength(2);
    for (const o of tesorero) {
      expect(o).not.toHaveProperty("responsableEfectivo");
      expect(o).not.toHaveProperty("responsable");
    }
  });

  it("Avisos: Jefatura lo recibe; un tesorero, no", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    type Aviso = { grupos: { filas: object[] }[] };
    const filas = async (id: number) => ((await app.inject({ method: "GET", url: "/api/avisos", headers: encabezado(id) })).json() as Aviso).grupos.flatMap((g) => g.filas);
    const deJefatura = await filas(jefa);
    expect(deJefatura.length).toBe(3);
    expect(deJefatura.every((f) => "responsableEfectivo" in f)).toBe(true);
    const deTesorero = await filas(ana);
    expect(deTesorero.length).toBe(2);
    expect(deTesorero.some((f) => "responsableEfectivo" in f)).toBe(false);
  });

  it("«Sin responsable» cuenta las obligaciones activas cuya sociedad no tiene tesorero, y solo Jefatura recibe el conteo", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const jefatura = (await app.inject({ method: "GET", url: "/api/obligaciones/resumen", headers: encabezado(jefa) })).json().datos;
    expect(jefatura.sinResponsable).toBe(1);
    // una obligación con texto propio en la columna antigua no cambia nada: manda la sociedad
    await prisma.obligacion.updateMany({ where: { sociedadId: sinTesoreroId }, data: { responsable: "Alguien" } });
    expect((await app.inject({ method: "GET", url: "/api/obligaciones/resumen", headers: encabezado(jefa) })).json().datos.sinResponsable).toBe(1);
    // al asignar un tesorero a la sociedad, baja
    await prisma.sociedad.update({ where: { id: sinTesoreroId }, data: { tesoreroId: ana } });
    expect((await app.inject({ method: "GET", url: "/api/obligaciones/resumen", headers: encabezado(jefa) })).json().datos.sinResponsable).toBe(0);
    const tesorero = (await app.inject({ method: "GET", url: "/api/obligaciones/resumen", headers: encabezado(ana) })).json().datos;
    expect(tesorero).not.toHaveProperty("sinResponsable");
  });
});

describe("«Frecuencia sin confirmar»", () => {
  it("cuenta y filtra dentro del alcance de cada persona, y baja al confirmar", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const resumen = async (id: number) => (await app.inject({ method: "GET", url: "/api/obligaciones/resumen", headers: encabezado(id) })).json().datos.frecuenciaPorConfirmar as number;
    expect(await resumen(jefa)).toBe(2); // P1 y P3
    expect(await resumen(ana)).toBe(1); // solo P1 es de su sociedad
    const lista = async (id: number) => ((await app.inject({ method: "GET", url: "/api/obligaciones?falta=frecuencia&activa=true", headers: encabezado(id) })).json().datos as { proveedor: string }[]).map((o) => o.proveedor).sort();
    expect(await lista(jefa)).toEqual(["P1", "P3"]);
    expect(await lista(ana)).toEqual(["P1"]);
    // confirmar la frecuencia de P1 desde Editar baja el conteo
    const p1 = await prisma.obligacion.findFirstOrThrow({ where: { proveedor: "P1" } });
    const r = await app.inject({ method: "PATCH", url: `/api/obligaciones/${p1.id}`, headers: encabezado(jefa), payload: { frecuenciaPorConfirmar: false } });
    expect(r.statusCode).toBe(200);
    expect(await resumen(jefa)).toBe(1);
    expect(await resumen(ana)).toBe(0);
  });
});
