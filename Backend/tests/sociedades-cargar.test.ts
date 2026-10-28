import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { codigoPorAlias } from "../src/config/alias-sociedades.js";
import { normalizarNombreSociedad } from "../src/domain/sociedades.js";
import { leerLibro } from "../src/ingest/lector.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { crearUsuario } from "../src/repositories/usuarios.js";
import { cargarSociedades, leerListaSociedades, textoInformeSociedades } from "../src/sociedades/cargar.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Datos inventados. Las sociedades "del piloto" se siembran con los mismos nombres largos que usa el seed.
const libroLista = async (filas: unknown[][]) => {
  const todas: Record<number, unknown[]> = { 1: ["Lista de sociedades inventada"], 4: ["Nombre sociedad", "Tesorero"] };
  filas.forEach((f, i) => { todas[5 + i] = f; });
  return leerLibro(await M.libro([{ nombre: "Hoja1", filas: todas }]));
};
const lista = async (filas: unknown[][]) => leerListaSociedades(await libroLista(filas));

const FILAS = [
  ["WW Costa Rica", "Tesorera Uno"],
  ["INVERSIONES MEMEC, S.A", "tesorero dos"], // error de digitación de Tesorería: alias de MEMEMC
  ["Zona Franca La Lima S.R.L", "TESORERA UNO"], // mismo nombre sin puntuación ni mayúsculas
  ["ZONA FRANCA LA LIMA CONDOMINIO", "Tesorera Uno"], // parecida pero distinta: debe crearse
  ["Sociedad Nueva Uno", "Tesorero Dos"],
  ["Sociedad Nueva Dos", "Persona Sin Usuario"],
  ["Sociedad Nueva Tres", ""],
  ["Sociedad Nueva Uno", "Tesorero Dos"], // repetida
  ["", "Tesorera Uno"], // sin nombre
  [null, null],
];

let uno: number;
let dos: number;

beforeAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await sembrarSociedad("WW", "WW Costa Rica");
  await sembrarSociedad("MEMEMC", "INVERSIONES MEMEMC, S.A");
  await sembrarSociedad("ZFL", "ZONA FRANCA LA LIMA, S.R.L.");
  const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: "Tesorero" } });
  uno = (await crearUsuario({ correo: "uno@ejemplo.invalid", nombre: "Tesorera Uno", rolId: rol.id })).id;
  dos = (await crearUsuario({ correo: "dos@ejemplo.invalid", nombre: "Tesorero Dos", rolId: rol.id })).id;
});
afterAll(async () => { await vaciarImportaciones(); await vaciarUsuarios(); });

describe("nombres y alias", () => {
  it("la clave ignora mayúsculas, tildes, puntuación y espacios", () => {
    expect(normalizarNombreSociedad("ZONA FRANCA LA LIMA, S.R.L.")).toBe(normalizarNombreSociedad("  zona  franca la lima S R L"));
    expect(normalizarNombreSociedad("Inversiones Ñandú, S.A.")).toBe("inversiones nandu s a");
  });
  it("no hay coincidencia difusa: nombres parecidos tienen claves distintas", () => {
    expect(normalizarNombreSociedad("ZONA FRANCA LA LIMA, S.R.L.")).not.toBe(normalizarNombreSociedad("ZONA FRANCA LA LIMA CONDOMINIO"));
  });
  it("los cinco alias de la lista apuntan a su abreviatura", () => {
    expect(codigoPorAlias("INVERSIONES INMOBILIARIAS BONAVISTA IIBV")).toBe("BONAVISTA");
    expect(codigoPorAlias("GARNIER Y GARNIER DESARROLLOS INMOBILIARIOS S.A.")).toBe("GGDI");
    expect(codigoPorAlias("inversiones memec, s.a")).toBe("MEMEMC");
    expect(codigoPorAlias("WW Costa Rica")).toBe("WW");
    expect(codigoPorAlias("ZONA FRANCA LA LIMA, S.R.L.")).toBe("ZFL");
    expect(codigoPorAlias("ZONA FRANCA LA LIMA CONDOMINIO")).toBeNull();
  });
});

describe("sociedades:cargar", () => {
  it("falla sin mostrar contenido si los encabezados no están donde se esperan", async () => {
    const libro = await leerLibro(await M.libro([{ nombre: "H", filas: { 1: ["x", "y"] } }]));
    expect(() => leerListaSociedades(libro)).toThrow(/fila 4/);
  });

  it("no modifica las existentes, crea las nuevas sin abreviatura y asigna el tesorero con su historial", async () => {
    const r = await cargarSociedades(await lista(FILAS));
    expect(r).toMatchObject({
      filasLeidas: 9, existentes: 3, creadas: 4,
      tesorerosEncontrados: 2, tesoreroSinUsuario: 1, filasSinTesorero: 1,
      asignacionesNuevas: 5, cambiosDeTesorero: 0, sinCambioDeTesorero: 0, sociedadesEnBase: 7,
    });
    expect(r.ignoradas).toEqual({ "sociedad repetida en el archivo": 1, "fila sin nombre de sociedad": 1 });
    expect(r.sociedadesPorTesorero).toEqual([3, 2]);

    const memec = await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "MEMEMC" } });
    expect(memec).toMatchObject({ nombreLargo: "INVERSIONES MEMEMC, S.A", tesoreroId: dos }); // nombre largo intacto
    const nueva = await prisma.sociedad.findUniqueOrThrow({ where: { nombreLargo: "Sociedad Nueva Uno" } });
    expect(nueva).toMatchObject({ codigo: null, activa: true, tesoreroId: dos });
    const condominio = await prisma.sociedad.findUniqueOrThrow({ where: { nombreLargo: "ZONA FRANCA LA LIMA CONDOMINIO" } });
    expect(condominio.codigo).toBeNull();
    expect((await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "ZFL" } })).tesoreroId).toBe(uno);
    expect((await prisma.sociedad.findUniqueOrThrow({ where: { nombreLargo: "Sociedad Nueva Dos" } })).tesoreroId).toBeNull();
    expect((await prisma.sociedad.findUniqueOrThrow({ where: { nombreLargo: "Sociedad Nueva Tres" } })).tesoreroId).toBeNull();

    const historial = await prisma.sociedadTesoreroHistorial.findMany({ where: { sociedadId: nueva.id } });
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({ usuarioId: dos, hasta: null, motivo: "carga inicial" });
    expect(await prisma.sociedadTesoreroHistorial.count()).toBe(5);
  });

  it("repetir la carga no duplica sociedades ni historial", async () => {
    const r = await cargarSociedades(await lista(FILAS));
    expect(r).toMatchObject({ existentes: 7, creadas: 0, asignacionesNuevas: 0, cambiosDeTesorero: 0, sinCambioDeTesorero: 5, sociedadesEnBase: 7 });
    expect(await prisma.sociedad.count()).toBe(7);
    expect(await prisma.sociedadTesoreroHistorial.count()).toBe(5);
  });

  it("si cambia el tesorero, cierra la fila vigente y abre otra con el motivo del cambio", async () => {
    const cambiadas = FILAS.map((f) => (f[0] === "WW Costa Rica" ? ["WW Costa Rica", "Tesorero Dos"] : f));
    const r = await cargarSociedades(await lista(cambiadas));
    expect(r).toMatchObject({ cambiosDeTesorero: 1, sinCambioDeTesorero: 4, asignacionesNuevas: 0 });
    const ww = await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "WW" } });
    expect(ww.tesoreroId).toBe(dos);
    const h = await prisma.sociedadTesoreroHistorial.findMany({ where: { sociedadId: ww.id }, orderBy: { id: "asc" } });
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ usuarioId: uno, motivo: "carga inicial" });
    expect(h[0]!.hasta).not.toBeNull();
    expect(h[1]).toMatchObject({ usuarioId: dos, hasta: null, motivo: "cambio en lista de Tesorería" });
  });

  it("al cargarse el usuario que faltaba, la sociedad pendiente recibe su tesorero", async () => {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: "Tesorero" } });
    await crearUsuario({ correo: "sin@ejemplo.invalid", nombre: "Persona Sin Usuario", rolId: rol.id });
    const r = await cargarSociedades(await lista(FILAS));
    expect(r).toMatchObject({ tesoreroSinUsuario: 0, asignacionesNuevas: 1 });
  });

  it("el informe imprime solo conteos: ni nombres de sociedades ni de personas", async () => {
    const texto = textoInformeSociedades(await cargarSociedades(await lista(FILAS)));
    expect(texto).toContain("existentes encontradas: 7");
    expect(texto).not.toMatch(/Tesorera Uno|Tesorero Dos|Persona|Sociedad Nueva|WW|MEMEC|ZONA|ejemplo/i);
  });
});
