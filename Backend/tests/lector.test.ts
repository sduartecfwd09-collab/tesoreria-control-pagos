import { describe, expect, it } from "vitest";
import { ErrorLectura, leerEstadoDeCuenta, leerLibro } from "../src/ingest/lector.js";
import { parsearNombreArchivo } from "../src/ingest/nombre-archivo.js";
import * as M from "./helpers/muestras.js";

async function leer(buf: Buffer, nombre: string) {
  return leerEstadoDeCuenta(await leerLibro(buf), parsearNombreArchivo(nombre));
}
const dia = (f: Date) => f.toISOString().slice(0, 10);

describe("E1 (BCT)", () => {
  it("lee movimientos con fecha nativa y convierte a centavos", async () => {
    const r = await leer(await M.e1(), "CR91010710102200000001 0826 ZFL.xlsx");
    expect(r.formato).toBe("E1");
    expect(r.movimientos).toHaveLength(4);
    expect(r.movimientos[0]).toMatchObject({ debito: 15050, credito: 0, referencia: "R-1001", fila: 7 });
    expect(r.movimientos[2]).toMatchObject({ debito: 0, credito: 200000 });
    expect(dia(r.movimientos[3]!.fecha)).toBe("2026-08-20");
    expect(r.continuidad.estado).toBe("cuadra");
    expect(r.discrepancias).toEqual([]);
  });
  it("lee fecha como serial de Excel y como texto dd/mm/aaaa", async () => {
    for (const modo of ["serial", "texto"] as const) {
      const r = await leer(await M.e1({ modo }), "CR91010710102200000001 0826 ZFL.xlsx");
      expect(r.movimientos.map((m) => dia(m.fecha))).toEqual(["2026-08-03", "2026-08-03", "2026-08-10", "2026-08-20"]);
    }
  });
  it("ignora columnas extra fuera de la tabla (fórmulas auxiliares)", async () => {
    const r = await leer(await M.e1({ extra: [999, { formula: "+F7-G7", result: 1 }] }), "CR91010710102200000001 0826 ZFL.xlsx");
    expect(r.movimientos).toHaveLength(4);
    expect(r.continuidad.estado).toBe("cuadra");
  });
  it("toma la moneda del encabezado si existe, y la deja null si no", async () => {
    expect((await leer(await M.e1({ moneda: "USD" }), "CR91010710102200000001 0826 ZFL.xlsx")).monedaArchivo).toBe("USD");
    expect((await leer(await M.e1(), "CR91010710102200000001 0826 ZFL.xlsx")).monedaArchivo).toBeNull();
  });
  it("lee el banco del encabezado", async () => {
    expect((await leer(await M.e1(), "CR91010710102200000001 0826 ZFL.xlsx")).bancoArchivo).toBe("BCT");
  });
  it("cuenta sin IBAN (número) se identifica por el nombre de la hoja", async () => {
    const r = await leer(await M.e1({ iban: "97010220000013", moneda: "USD - RESERVA" }), "97010220000013 0826 MEMEMC.xlsx");
    expect(r.discrepancias).toEqual([]);
    expect(r.monedaArchivo).toBe("USD");
  });
  it("el símbolo de moneda al final del nombre de la cuenta cuenta como moneda", async () => {
    const buf = await M.libro([{
      nombre: "CR87010700000000000014",
      filas: {
        1: ["Periodo Seleccionado", null, null, "Sociedad de prueba ¢"],
        6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"],
        7: [M.fecha(2026, 8, 3), "x", "R1", 100, 0, 900],
      },
    }]);
    expect((await leer(buf, "CR87010700000000000014 0826 GGDI.xlsx")).monedaArchivo).toBe("CRC");
  });
  it("detecta un saldo que no cuadra sin descartar el archivo", async () => {
    const buf = await M.libro([{
      nombre: "CR91010710102200000001",
      filas: {
        4: ["CR91010710102200000001"],
        6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"],
        7: [M.fecha(2026, 8, 3), "a", "R1", 100, 0, 900],
        8: [M.fecha(2026, 8, 4), "b", "R2", 100, 0, 700], // debería ser 800
        9: [M.fecha(2026, 8, 5), "c", "R3", 0, 50, 750],
      },
    }]);
    const r = await leer(buf, "CR91010710102200000001 0826 ZFL.xlsx");
    expect(r.movimientos).toHaveLength(3);
    expect(r.continuidad.estado).toBe("no_cuadra");
    expect(r.continuidad.filasConFallo).toContain(8);
  });
});

describe("E2 (detalle del periodo con celdas combinadas)", () => {
  it("lee las columnas combinadas, ignora saldo inicial y el Cuadro de Resumen", async () => {
    const r = await leer(await M.e2(), "CR94010200000000000004 0826 GGDI.xlsx");
    expect(r.formato).toBe("E2");
    expect(r.movimientos).toHaveLength(4);
    expect(r.movimientos[0]).toMatchObject({ referencia: "R-1001", codigo: "PP", debito: 15050, credito: 0 });
    expect(r.movimientos[0]!.descripcion).toBe("Pago:SERVICIO UNO 11111111");
    expect(r.filasPieIgnoradas).toBeGreaterThanOrEqual(3);
    expect(r.monedaArchivo).toBe("USD");
    expect(r.continuidad).toMatchObject({ estado: "cuadra", usoSaldoApertura: true });
  });
});

describe("E3 (0123)", () => {
  it("DM: ignora la fila 1 fantasma, lee saldo con comas como texto y el encabezado en la fila 18", async () => {
    const movs = [
      { y: 2026, m: 8, d: 17, ref: "1000000001", desc: "Desembolso de prueba", cre: 215000.25 },
      { y: 2026, m: 8, d: 18, ref: "1000000002", desc: "Pago de prueba", deb: 1234.5 },
    ];
    const r = await leer(await M.e3dm({ movs, apertura: 0 }), "CR98012300130000000008 0826 DM.xlsx");
    expect(r.formato).toBe("E3");
    expect(r.filaEncabezado).toBe(18);
    expect(r.movimientos).toHaveLength(2);
    expect(r.movimientos[0]).toMatchObject({ credito: 21500025, debito: 0, saldo: 21500025 });
    expect(r.movimientos[1]).toMatchObject({ debito: 123450, saldo: 21500025 - 123450 });
    expect(r.monedaArchivo).toBe("USD");
    expect(r.continuidad.estado).toBe("cuadra");
  });
  it("MEMEMC: encabezado en la fila 14 y moneda Colones", async () => {
    const r = await leer(await M.e3mememc(), "CR99012300130000000009 0826 MEMEMC.xlsx");
    expect(r.formato).toBe("E3");
    expect(r.filaEncabezado).toBe(14);
    expect(r.monedaArchivo).toBe("CRC");
    expect(r.movimientos).toHaveLength(4);
  });
  it("«COLON DE COSTA RICA» se reconoce como colones", async () => {
    const r = await leer(await M.e3dm({ monedaTexto: "COLON DE COSTA RICA" }), "CR98012300130000000008 0826 DM.xlsx");
    expect(r.monedaArchivo).toBe("CRC");
  });
});

describe("E4 (0104, consulta DR/CR)", () => {
  it("lee fechas de texto y moneda de la fila 7", async () => {
    const r = await leer(await M.e4(), "CR90010402340000000010 0826 ZFL.xlsx");
    expect(r.formato).toBe("E4");
    expect(r.movimientos).toHaveLength(4);
    expect(r.monedaArchivo).toBe("USD");
    expect(dia(r.movimientos[0]!.fecha)).toBe("2026-08-03");
    expect(r.continuidad.estado).toBe("cuadra");
  });
});

describe("E5 (Davivienda consolidado)", () => {
  it("sin movimientos en la hoja de detalle: no es error", async () => {
    const r = await leer(await M.e5(), "CR89010402340000000011 0926 ZFL.xlsx");
    expect(r.formato).toBe("E5");
    expect(r.hoja).toMatch(/^DETALLE/);
    expect(r.filaEncabezado).toBe(28);
    expect(r.movimientos).toEqual([]);
    expect(r.monedaArchivo).toBe("CRC");
    expect(r.bancoArchivo).toBe("Davivienda");
    expect(r.discrepancias).toEqual([]);
  });
  it("con movimientos: lee el detalle y no el consolidado", async () => {
    const movs = [
      { y: 2026, m: 9, d: 2, ref: "X1", desc: "Pago de prueba", deb: 100 },
      { y: 2026, m: 9, d: 3, ref: "X2", desc: "Deposito de prueba", cre: 40.5 },
    ];
    const r = await leer(await M.e5({ movs, apertura: 5000 }), "CR89010402340000000011 0926 ZFL.xlsx");
    expect(r.movimientos).toHaveLength(2);
    expect(r.movimientos[0]).toMatchObject({ debito: 10000, codigo: "NC", referencia: "X1" });
    expect(r.continuidad).toMatchObject({ estado: "cuadra", usoSaldoApertura: true });
  });
});

describe("E6 y E7 (BNCR)", () => {
  it("E6 (agosto): débitos y créditos en columnas separadas", async () => {
    const r = await leer(await M.e6(), "CR88015107510000000012 0826 ZFL.xlsx");
    expect(r.formato).toBe("E6");
    expect(r.movimientos).toHaveLength(4);
    expect(r.monedaArchivo).toBe("USD");
  });
  it("E6 y E3 comparten encabezados: se separan por el código de banco", async () => {
    const r = await leer(await M.e6({ iban: "CR88012307510000000012" }), "CR88012307510000000012 0826 ZFL.xlsx");
    expect(r.formato).toBe("E3");
  });
  it("E7 (septiembre): monto con signo, negativo = débito, positivo = crédito", async () => {
    const r = await leer(await M.e7(), "CR97015107510000000007 0926 ZFL.xlsx");
    expect(r.formato).toBe("E7");
    expect(r.movimientos).toHaveLength(4);
    expect(r.movimientos[0]).toMatchObject({ debito: 15050, credito: 0 });
    expect(r.movimientos[2]).toMatchObject({ debito: 0, credito: 200000 });
    expect(r.continuidad.estado).toBe("cuadra");
    expect(r.filasPieIgnoradas).toBe(2);
  });
  it("E7 sin movimientos: 0 filas, no es error", async () => {
    const r = await leer(await M.e7({ movs: [] }), "CR97015107510000000007 0926 ZFL.xlsx");
    expect(r.movimientos).toEqual([]);
  });
});

describe("coherencia con el nombre del archivo", () => {
  it("reporta cuenta distinta, periodo distinto y fechas fuera del mes", async () => {
    const r = await leer(await M.e1(), "CR80010710102200000099 0926 ZFL.xlsx");
    const tipos = r.discrepancias.map((d) => d.tipo);
    expect(tipos).toContain("cuenta");
    expect(tipos).toContain("periodo");
  });
  it("formato incoherente con el banco del nombre es error claro", async () => {
    await expect(leer(await M.e1(), "CR02010200000000000001 0826 ZFL.xlsx")).rejects.toThrow(/no corresponde al banco/);
  });
});

describe("errores de lectura", () => {
  it("un archivo que no es Excel produce un error controlado, sin contenido", async () => {
    await expect(leerLibro(Buffer.from("esto no es un xlsx"))).rejects.toBeInstanceOf(ErrorLectura);
  });
  it("hoja sin encabezado reconocible", async () => {
    const buf = await M.libro([{ nombre: "X", filas: { 1: ["hola", "mundo"] } }]);
    await expect(leer(buf, "CR91010710102200000001 0826 ZFL.xlsx")).rejects.toThrow(/Formato no reconocido/);
  });
});

describe("filas con importe y sin fecha legible", () => {
  const hojaConFechasIlegibles = (conUnaLegible: boolean) =>
    M.libro([{
      nombre: "Movimientos",
      filas: {
        1: ["Periodo Seleccionado", null, null, "SOCIEDAD SINTETICA S.A."],
        2: ["Fecha", "Del: 01/08/2026", "Al: 28/08/2026", "BCT 0000"],
        4: ["CR91010710102200000001"],
        6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"],
        7: ["03-ago-2026", "Cargo uno", "R-1", 100, 0, 900],
        8: [conUnaLegible ? M.fecha(2026, 8, 4) : "04-ago-2026", "Cargo dos", "R-2", 50, 0, 850],
        9: ["05-ago-2026", "Cargo tres", "R-3", 25, 0, 825],
      },
    }]);

  it("sin ningún movimiento leído, esas filas ya no se descartan en silencio: generan advertencia", async () => {
    const r = await leer(await hojaConFechasIlegibles(false), "CR91010710102200000001 0826 ZFL.xlsx");
    expect(r.movimientos).toHaveLength(0);
    expect(r.advertencias).toContain("3 fila(s) con importe pero sin fecha legible: no se importaron");
  });

  it("con movimientos leídos sigue avisando de las filas entre ellos", async () => {
    const r = await leer(await hojaConFechasIlegibles(true), "CR91010710102200000001 0826 ZFL.xlsx");
    expect(r.movimientos).toHaveLength(1);
    expect(r.advertencias).toContain("1 fila(s) con importe pero sin fecha legible: no se importaron"); // la de la fila 7; la 9 queda como pie
  });
});
