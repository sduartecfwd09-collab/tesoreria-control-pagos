import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Alcance de las escrituras sobre obligaciones: sin persona 401, fuera de las sociedades de la persona 403, Jefatura todo.
// Datos inventados. Hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let categoriaId: number;
let obligacionA: number;
let obligacionB: number;

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  const persona = async (correo: string, nombre: string, rol: string) =>
    (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  jefa = await persona("jefa@x.cr", "Jefa Tres", "Jefatura");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  const crear = async (sociedadId: number, identificador: string) =>
    (await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor: `P${identificador}`, identificador, diaEsperadoPago: 10 } })).id;
  obligacionA = await crear(sociedadA, "1");
  obligacionB = await crear(sociedadB, "2");
});
afterAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
});

const patch = (app: Awaited<ReturnType<typeof crearApp>>, id: number, actor: number | null, payload: object) =>
  app.inject({ method: "PATCH", url: `/api/obligaciones/${id}`, headers: actor === null ? {} : encabezado(actor), payload });

describe("quién puede escribir obligaciones", () => {
  it("PATCH: sin persona 401; un tesorero no toca la sociedad de otro (403) y la base no cambia; Jefatura y el tesorero propio sí", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    expect((await patch(app, obligacionB, null, { frecuencia: "anual", mesArranque: 3 })).statusCode).toBe(401);
    const ajena = await patch(app, obligacionB, ana, { frecuencia: "anual", mesArranque: 3 });
    expect(ajena.statusCode).toBe(403);
    expect(ajena.json()).toEqual({ error: expect.any(String) });
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacionB } })).frecuencia).toBe("mensual");
    expect((await patch(app, obligacionB, beto, { frecuenciaPorConfirmar: false })).statusCode).toBe(200);
    expect((await patch(app, obligacionB, jefa, { frecuenciaPorConfirmar: true })).statusCode).toBe(200);
    expect((await patch(app, obligacionA, jefa, { frecuenciaPorConfirmar: false })).statusCode).toBe(200);
  });

  it("PATCH sin modo de pruebas: no hay persona posible, así que 401", async () => {
    const app = await crearApp({ reloj, modoPruebas: false });
    expect((await patch(app, obligacionA, ana, { frecuenciaPorConfirmar: false })).statusCode).toBe(401);
  });

  it("POST (alta): sin persona 401; un tesorero no crea en la sociedad de otro (403) y no queda nada; en la suya sí; Jefatura en cualquiera", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const alta = (actor: number | null, sociedadId: number, identificador: string) =>
      app.inject({ method: "POST", url: "/api/obligaciones", headers: actor === null ? {} : encabezado(actor), payload: { sociedadId, categoriaId, proveedor: "Nuevo", identificador, diaEsperadoPago: 5 } });
    expect((await alta(null, sociedadA, "10")).statusCode).toBe(401);
    expect((await alta(ana, sociedadB, "11")).statusCode).toBe(403);
    expect(await prisma.obligacion.count({ where: { identificador: { in: ["10", "11"] } } })).toBe(0);
    expect((await alta(ana, sociedadA, "12")).statusCode).toBe(201);
    expect((await alta(jefa, sociedadB, "13")).statusCode).toBe(201);
  });

  it("POST /frecuencia: sin persona 401; si alguna obligación es ajena, 403 y no se cambia ninguna; Jefatura y el propio tesorero sí", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const masivo = (actor: number | null, ids: number[]) =>
      app.inject({ method: "POST", url: "/api/obligaciones/frecuencia", headers: actor === null ? {} : encabezado(actor), payload: { ids, frecuencia: "trimestral", mesArranque: 2 } });
    expect((await masivo(null, [obligacionA])).statusCode).toBe(401);
    expect((await masivo(ana, [obligacionA, obligacionB])).statusCode).toBe(403);
    expect(await prisma.obligacion.count({ where: { frecuencia: "trimestral" } })).toBe(0);
    expect((await masivo(ana, [obligacionA])).statusCode).toBe(200);
    expect((await masivo(jefa, [obligacionA, obligacionB])).statusCode).toBe(200);
  });
});
