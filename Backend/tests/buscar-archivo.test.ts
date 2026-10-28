import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { buscarArchivos, leerArgumentos, normalizarBusqueda } from "../src/ingest/buscar-archivo.js";
import { vaciarImportaciones } from "./helpers/db.js";

const registrados = [
  { id: 1, ruta: "AAA/CR91010710102200000001 1026 AAA.xlsx" },
  { id: 2, ruta: "AAA/CR91010710102200000001 0926 AAA.xlsx" },
  { id: 3, ruta: "BBB/CR91010710102200000002 1026 BBB.XLSX" },
];

describe("búsqueda amigable de un archivo", () => {
  it("acepta una parte del nombre sin importar mayúsculas, extensión ni carpeta", () => {
    expect(buscarArchivos(registrados, "0001 1026").map((a) => a.id)).toEqual([1]);
    expect(buscarArchivos(registrados, "0002 1026 bbb.xlsx").map((a) => a.id)).toEqual([3]);
    expect(buscarArchivos(registrados, "AAA/CR91010710102200000001 0926 AAA.xlsx").map((a) => a.id)).toEqual([2]);
    expect(buscarArchivos(registrados, "C:\\fuentes\\BBB\\CR91010710102200000002 1026 BBB").map((a) => a.id)).toEqual([3]);
    expect(buscarArchivos(registrados, "1026").map((a) => a.id)).toEqual([1, 3]); // varios candidatos
    expect(buscarArchivos(registrados, "no existe")).toEqual([]);
    expect(buscarArchivos(registrados, "   ")).toEqual([]);
  });

  it("normaliza el texto: sin carpeta, sin extensión y en minúsculas", () => {
    expect(normalizarBusqueda("  Carpeta\\Sub/Archivo UNO.XLSX ")).toBe("archivo uno");
  });

  it("lee --id en sus dos formas y el resto como texto; un --id inválido se avisa", () => {
    expect(leerArgumentos(["--id", "12"])).toEqual({ id: 12, texto: "", idInvalido: false });
    expect(leerArgumentos(["--id=7"])).toEqual({ id: 7, texto: "", idInvalido: false });
    expect(leerArgumentos(["0001", "1026"])).toEqual({ id: null, texto: "0001 1026", idInvalido: false });
    expect(leerArgumentos(["--id", "abc"]).idInvalido).toBe(true);
    expect(leerArgumentos(["--id"]).idInvalido).toBe(true);
  });
});

describe("los contadores de calidad del catálogo coinciden con el filtro de la lista", () => {
  let sociedadId: number;
  let categoriaId: number;
  beforeEach(async () => {
    await vaciarImportaciones();
    sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  });
  afterAll(vaciarImportaciones);

  it("el contador cuenta solo obligaciones activas: el filtro «falta» debe pedirse con activa=true para coincidir", async () => {
    const crear = (proveedor: string, identificador: string, activa: boolean) =>
      prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 10, activa } });
    await crear("Luz Uno", "1110001", true);
    await crear("Agua Dos", "2220002", true);
    await crear("Gas Tres", "3330003", false); // desactivada: no cuenta en las tarjetas
    const app = await crearApp({});
    try {
      const resumen = (await app.inject("/api/obligaciones/resumen")).json().datos;
      expect(resumen.sinMonto).toBe(2);
      const conActiva = (await app.inject("/api/obligaciones?falta=monto&activa=true")).json();
      expect(conActiva.total).toBe(resumen.sinMonto);
      const sinActiva = (await app.inject("/api/obligaciones?falta=monto")).json();
      expect(sinActiva.total).toBe(3); // incluye la desactivada: por eso el cliente envía activa=true junto con falta
    } finally {
      await app.close();
    }
  });
});
