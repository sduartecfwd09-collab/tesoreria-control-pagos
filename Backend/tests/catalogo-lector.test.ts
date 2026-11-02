import { describe, expect, it } from "vitest";
import { estadoEsActiva, leerCatalogo, parsearDia } from "../src/catalogo/lector.js";
import { leerLibro } from "../src/ingest/lector.js";
import { CABECERA_CATALOGO, catalogo, FILAS_BASE } from "./helpers/catalogo.js";
import { libro } from "./helpers/muestras.js";

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

describe("leerCatalogo: la pestaña se elige por contenido (encabezados), no por posición ni por nombre", () => {
  const CAB = [...CABECERA_CATALOGO, "ESTADO"];
  const catalogoHoja = (nombre: string): { nombre: string; filas: Record<number, unknown[]> } => ({
    nombre,
    filas: { 3: CAB, 4: ["AAA", "Electricidad", "Luz", "100", "05 DIA", "ACTIVA"], 5: ["AAA", "Cable", "Red", "200", "06 DIA", "ACTIVA"] },
  });
  // Pestaña auxiliar: trae una columna llamada «Sociedad» pero no los demás encabezados.
  const nombres = { nombre: "NOMBRE", filas: { 1: ["Sociedad", "Nombre oficial"], 2: ["AAA", "Sociedad AAA, S.A."], 3: ["BBB", "Sociedad BBB, S.A."] } };

  it("lee la pestaña del catálogo aunque «NOMBRE» esté antes, y no mezcla sus filas", async () => {
    const c = await leerCatalogo(await leerLibro(await libro([nombres, catalogoHoja("TABLA PAGOS FRECUENTES")])));
    expect(c.hoja).toBe("TABLA PAGOS FRECUENTES");
    expect(c.filas.map((f) => f.identificador)).toEqual(["100", "200"]);
    expect(c.problemas).toEqual([]);
  });

  it("da el mismo resultado si el orden de las pestañas es otro", async () => {
    const c = await leerCatalogo(await leerLibro(await libro([catalogoHoja("TABLA PAGOS FRECUENTES"), nombres])));
    expect(c.hoja).toBe("TABLA PAGOS FRECUENTES");
    expect(c.filas).toHaveLength(2);
  });

  it("encuentra el catálogo aunque la pestaña tenga otro nombre; sin pestaña con los encabezados falla con un mensaje claro", async () => {
    expect((await leerCatalogo(await leerLibro(await libro([nombres, catalogoHoja("Otro nombre")])))).hoja).toBe("Otro nombre");
    const sinCatalogo = await leerLibro(await libro([nombres]));
    expect(() => leerCatalogo(sinCatalogo)).toThrow(/No se encontró la cabecera/);
  });
});

describe("leerCatalogo: columna ESTADO opcional", () => {
  const CAB_ESTADO = [...CABECERA_CATALOGO, "ESTADO"];
  it("sin columna ESTADO el estado de cada fila es null", async () => {
    expect((await leer(catalogo())).filas.every((f) => f.estado === null)).toBe(true);
  });
  it("con la columna lee el texto de cada fila", async () => {
    const c = await leer(catalogo([["AAA", "Telecom", "Fono", "1", "05 DIA", "ACTIVA"], ["AAA", "Telecom", "Fono", "2", "05 DIA", "Inactiva"], ["AAA", "Telecom", "Fono", "3", "05 DIA", ""]], { cabecera: CAB_ESTADO }));
    expect(c.filas.map((f) => f.estado)).toEqual(["ACTIVA", "Inactiva", ""]);
  });
  it("solo «ACTIVA» (sin mayúsculas ni tildes) es activa", () => {
    expect(["ACTIVA", "activa", " Activa "].every(estadoEsActiva)).toBe(true);
    expect(["INACTIVA", "", "Suspendida", "activo"].some(estadoEsActiva)).toBe(false);
  });
});

describe("leerCatalogo", () => {
  it("encuentra la cabecera en la fila 3 y lee todas las filas", async () => {
    const c = await leer(catalogo());
    expect(c.filaCabecera).toBe(3);
    expect(c.filas).toHaveLength(FILAS_BASE.length);
    expect(c.problemas).toEqual([]);
    expect(c.filas[0]).toEqual({ fila: 4, sociedad: "AAA", categoria: "Electricidad", proveedor: "Luz Uno", identificador: "00012345", dia: 15, estado: null });
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
