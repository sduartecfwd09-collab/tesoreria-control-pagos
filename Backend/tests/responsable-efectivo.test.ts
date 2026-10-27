import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { responsableEfectivo } from "../src/domain/obligaciones.js";
import { sembrarCategoriasDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

describe("responsableEfectivo", () => {
  it("es el de la obligación y, si no lo tiene, el tesorero de su sociedad", () => {
    const conTesorero = { tesorero: { nombre: "Tesorera Uno" } };
    expect(responsableEfectivo({ responsable: "Persona Propia", sociedad: conTesorero })).toEqual({ nombre: "Persona Propia", de: "obligacion" });
    expect(responsableEfectivo({ responsable: null, sociedad: conTesorero })).toEqual({ nombre: "Tesorera Uno", de: "tesorero" });
    expect(responsableEfectivo({ responsable: "", sociedad: conTesorero })).toEqual({ nombre: "Tesorera Uno", de: "tesorero" });
    expect(responsableEfectivo({ responsable: null, sociedad: { tesorero: null } })).toEqual({ nombre: null, de: null });
  });
});

describe("API: responsable efectivo y sociedades sin obligaciones (datos inventados)", () => {
  let app: Awaited<ReturnType<typeof crearApp>>;
  beforeAll(async () => {
    await vaciarImportaciones();
    await vaciarUsuarios();
    await sembrarCategoriasDelCatalogo();
    const rol = await prisma.rol.findFirstOrThrow();
    const tesorera = await prisma.usuario.create({ data: { correo: "tesorera.uno@ejemplo.test", nombre: "Tesorera Uno", nombreNormalizado: "tesorera uno", rolId: rol.id } });
    const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    const con = await prisma.sociedad.create({ data: { nombreLargo: "Sociedad Con Tesorero", tesoreroId: tesorera.id } });
    const sin = await prisma.sociedad.create({ data: { nombreLargo: "Sociedad Sin Tesorero" } });
    const conEstados = await prisma.sociedad.create({ data: { nombreLargo: "Sociedad Con Estados Sin Obligaciones" } });
    await prisma.sociedad.create({ data: { nombreLargo: "Sociedad Fuera Del Piloto" } });
    await prisma.archivoImportado.create({ data: { ruta: "ejemplo/estado.xlsx", hash: "hash-de-ejemplo", sociedadId: conEstados.id, estado: "leido" } });
    const base = { categoriaId, frecuencia: "mensual", diaEsperadoPago: 5 };
    await prisma.obligacion.create({ data: { ...base, sociedadId: con.id, proveedor: "P1", identificador: "1" } }); // toma al tesorero
    await prisma.obligacion.create({ data: { ...base, sociedadId: con.id, proveedor: "P2", identificador: "2", responsable: "Persona Propia" } });
    await prisma.obligacion.create({ data: { ...base, sociedadId: sin.id, proveedor: "P3", identificador: "3" } }); // nadie
    app = await crearApp();
  });
  afterAll(async () => {
    await app.close();
    await vaciarImportaciones();
    await vaciarUsuarios();
  });

  const listar = async (qs = "") => (await app.inject(`/api/obligaciones${qs}`)).json().datos as { proveedor: string; responsable: string | null; responsableEfectivo: string | null; responsableDe: string | null }[];

  it("cada obligación trae su responsable efectivo y de dónde viene; el propio sigue siendo lo que se edita", async () => {
    const por = Object.fromEntries((await listar()).map((o) => [o.proveedor, o]));
    expect(por.P1).toMatchObject({ responsable: null, responsableEfectivo: "Tesorera Uno", responsableDe: "tesorero" });
    expect(por.P2).toMatchObject({ responsable: "Persona Propia", responsableEfectivo: "Persona Propia", responsableDe: "obligacion" });
    expect(por.P3).toMatchObject({ responsable: null, responsableEfectivo: null, responsableDe: null });
  });

  it("«Sin responsable» cuenta y filtra solo las que no tienen responsable propio ni tesorero", async () => {
    expect((await app.inject("/api/obligaciones/resumen")).json().datos.sinResponsable).toBe(1);
    expect((await listar("?falta=responsable")).map((o) => o.proveedor)).toEqual(["P3"]);
  });

  it("la búsqueda encuentra por el nombre del tesorero", async () => {
    expect((await listar("?q=Tesorera")).map((o) => o.proveedor)).toEqual(["P1"]);
  });

  it("sociedades sin obligaciones: con estados de cuenta, aviso individual; sin estados, un solo grupo", async () => {
    const r = (await app.inject("/api/obligaciones/resumen")).json().datos;
    expect(r.sociedadesSinObligaciones).toEqual(["Sociedad Con Estados Sin Obligaciones"]);
    expect(r.sociedadesSinEstadosNiObligaciones).toEqual(["Sociedad Fuera Del Piloto"]);
  });
});
