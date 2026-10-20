import { describe, expect, it } from "vitest";
import { leerCatalogo, parsearDia } from "../src/catalogo/lector.js";
import { leerLibro } from "../src/ingest/lector.js";
import { catalogo, FILAS_BASE } from "./helpers/catalogo.js";

const leer = async (b: Promise<Buffer>) => leerCatalogo(await leerLibro(await b));

describe("parsearDia", () => {
  it("interpreta «15 DIA» y variantes como el día del mes", () => {
    expect(parsearDia("15 DIA")).toBe(15);
    expect(parsearDia("01 DIA")).toBe(1);
    expect(parsearDia(" 20 días ")).toBe(20);
    expect(parsearDia("Día 31")).toBe(31);
    expect(parsearDia(7)).toBe(7);
  });
  it("rechaza lo que no es un entero de 1 a 31", () => {
    for (const v of ["0 DIA", "32 DIA", "45", "QUINCE", "15.5", 15.5, "", null]) expect(parsearDia(v)).toBeNull();
  });
});

describe("leerCatalogo", () => {
  it("encuentra la cabecera en la fila 3 y lee todas las filas", async () => {
    const c = await leer(catalogo());
    expect(c.filaCabecera).toBe(3);
    expect(c.filas).toHaveLength(FILAS_BASE.length);
    expect(c.problemas).toEqual([]);
    expect(c.filas[0]).toEqual({ fila: 4, sociedad: "AAA", categoria: "Electricidad", proveedor: "Luz Uno", identificador: "00012345", dia: 15 });
  });

  it("conserva los ceros a la izquierda y avisa si el identificador vino como número", async () => {
    const c = await leer(catalogo([["AAA", "Telecom", "Fono", 12345, "15 DIA"], ["AAA", "CCSS", "CCSS", "000123", "15 DIA"]]));
    expect(c.filas.map((f) => f.identificador)).toEqual(["12345", "000123"]);
    expect(c.problemas).toEqual([{ fila: 4, motivo: expect.stringMatching(/ceros a la izquierda/), importada: true }]);
  });

  it("importa sin día la fila con día inválido y la reporta", async () => {
    const c = await leer(catalogo([
      ["AAA", "Telecom", "Fono", "1", "45 DIA"],
      ["AAA", "Telecom", "Fono", "2", "QUINCE"],
      ["AAA", "Telecom", "Fono", "3", null],
      ["AAA", "Telecom", "Fono", "4", "15 DIA"],
    ]));
    expect(c.filas.map((f) => f.dia)).toEqual([null, null, null, 15]);
    expect(c.problemas).toEqual([
      { fila: 4, motivo: expect.stringContaining("«45 DIA» no es un entero de 1 a 31"), importada: true },
      { fila: 5, motivo: expect.stringContaining("«QUINCE»"), importada: true },
      { fila: 6, motivo: expect.stringContaining("Falta el día"), importada: true },
    ]);
  });

  it("normaliza espacios y mayúsculas, y reporta las variantes de un mismo nombre", async () => {
    const c = await leer(catalogo([
      ["  aaa ", "ELECTRICIDAD ", "Luz   Uno", " 0001 ", "15 DIA"],
      ["AAA", "electricidad", "LUZ UNO", "0002", "15 DIA"],
      ["AAA", "CCSS", "CCSS", "0003", "15 DIA"],
    ]));
    expect(c.filas.map((f) => [f.sociedad, f.categoria, f.proveedor, f.identificador])).toEqual([
      ["AAA", "Electricidad", "Luz Uno", "0001"],
      ["AAA", "Electricidad", "Luz Uno", "0002"],
      ["AAA", "CCSS", "CCSS", "0003"],
    ]);
    expect(c.variantes).toEqual([{ campo: "proveedor", nombre: "Luz Uno", variantes: ["LUZ UNO"] }]);
  });

  it("mantiene como obligaciones distintas el mismo identificador con dos proveedores", async () => {
    const c = await leer(catalogo());
    expect(c.filas.filter((f) => f.identificador === "77777777").map((f) => f.proveedor)).toEqual(["Fono Uno", "Fono Dos"]);
  });

  it("no importa, pero reporta, filas incompletas o repetidas", async () => {
    const c = await leer(catalogo([
      ["AAA", "Telecom", null, "1", "15 DIA"],
      ["AAA", "Telecom", "Fono", "2", "15 DIA"],
      ["AAA", "telecom", "FONO", "2", "10 DIA"],
      [null, null, null, null, null],
    ]));
    expect(c.filas).toHaveLength(1);
    expect(c.problemas).toEqual([
      { fila: 4, motivo: expect.stringMatching(/^Falta proveedor/), importada: false },
      { fila: 6, motivo: expect.stringContaining("Repite la fila 5"), importada: false },
    ]);
  });

  it("falla con un mensaje claro si no encuentra la cabecera", async () => {
    await expect(leer(catalogo([], { cabecera: ["Empresa", "Tipo", "Nombre"] }))).rejects.toThrow(/No se encontró la cabecera/);
  });
});
