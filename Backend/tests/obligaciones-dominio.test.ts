import { describe, expect, it } from "vitest";
import {
  calidadCatalogo, errorMesArranque, esquemaAlta, esquemaEdicion, etiquetasDe, identificadoresRepetidos,
  pareceIban, primerError, type ObligacionCalidad,
} from "../src/domain/obligaciones.js";

let sec = 0;
const ob = (o: Partial<ObligacionCalidad> = {}): ObligacionCalidad => ({
  id: ++sec, sociedad: "AAA", proveedor: "Luz", identificador: String(10_000 + sec), activa: true,
  frecuencia: "mensual", frecuenciaPorConfirmar: true, mesArranque: null, diaEsperadoPago: 15,
  montoEsperado: null, monedaPorConfirmar: true, cuentaEsperadaId: null, responsable: null, ...o,
});

describe("alertas de calidad del catálogo", () => {
  it("detecta el mismo identificador en una sociedad con distinto proveedor (solo activas)", () => {
    const a = ob({ identificador: "777", proveedor: "Fono Uno" });
    const b = ob({ identificador: "777", proveedor: "Fono Dos" });
    const otraSociedad = ob({ identificador: "777", proveedor: "Fono Tres", sociedad: "BBB" });
    expect(identificadoresRepetidos([a, b, otraSociedad])).toEqual([
      { sociedad: "AAA", identificador: "777", proveedores: ["Fono Uno", "Fono Dos"], obligaciones: [a.id, b.id] },
    ]);
    expect(identificadoresRepetidos([a, { ...b, activa: false }])).toEqual([]);
  });

  it("reconoce identificadores con formato de IBAN", () => {
    expect(pareceIban("CR12000000000000000001")).toBe(true);
    expect(pareceIban("00012345")).toBe(false);
    expect(pareceIban("000999888777")).toBe(false);
  });

  it("cuenta faltantes y supuestos, y separa las sociedades sin obligaciones según tengan o no estados de cuenta", () => {
    const c = calidadCatalogo(
      [
        ob({ montoEsperado: 100, cuentaEsperadaId: 1, responsable: "X", frecuenciaPorConfirmar: false, monedaPorConfirmar: false }),
        ob({ diaEsperadoPago: null, frecuencia: "trimestral" }),
        ob({ identificador: "CR12000000000000000001" }),
        ob({ sociedad: "CCC", activa: false }),
      ],
      [{ nombre: "AAA", conEstados: true }, { nombre: "CCC", conEstados: true }, { nombre: "DM", conEstados: false }, { nombre: "EEE", conEstados: false }],
    );
    expect(c).toMatchObject({
      total: 4, activas: 3, inactivas: 1, sinDia: 1, sinMonto: 2, sinCuenta: 2, sinResponsable: 2,
      sinMesArranque: 1, frecuenciaPorConfirmar: 2, monedaPorConfirmar: 2, sociedadesSinObligaciones: ["CCC"],
      sociedadesSinEstadosNiObligaciones: ["DM", "EEE"],
    });
    expect(c.formatoIban).toHaveLength(1);
  });
});

describe("etiquetas por obligación", () => {
  it("marca lo que falta y lo que está por confirmar con Tesorería", () => {
    const o = ob({ diaEsperadoPago: null, frecuencia: "anual" });
    expect(etiquetasDe(o, []).map((e) => e.codigo)).toEqual([
      "falta_dia", "falta_monto", "falta_cuenta", "falta_responsable", "falta_mes_arranque", "por_confirmar",
    ]);
    const completa = ob({ montoEsperado: 1, cuentaEsperadaId: 2, responsable: "Y", frecuenciaPorConfirmar: false, monedaPorConfirmar: false });
    expect(etiquetasDe(completa, [])).toEqual([]);
  });

  it("explica el identificador repetido y el formato de IBAN", () => {
    const a = ob({ identificador: "CR12000000000000000001", proveedor: "Uno" });
    const b = ob({ identificador: "CR12000000000000000001", proveedor: "Dos" });
    const e = etiquetasDe(a, identificadoresRepetidos([a, b]));
    expect(e.find((x) => x.codigo === "id_repetido")).toMatchObject({ texto: "Por confirmar con Tesorería", ayuda: expect.stringContaining("(Dos)") });
    expect(e.find((x) => x.codigo === "formato_iban")?.texto).toBe("Por confirmar con Tesorería");
  });
});

describe("validaciones", () => {
  const error = (r: { success: boolean; error?: unknown }) => (r.success ? null : primerError(r.error as never));

  it("acepta una edición válida y normaliza el responsable", () => {
    const r = esquemaEdicion.parse({ frecuencia: "bimestral", mesArranque: 3, montoEsperado: 150_050, responsable: "  Ana   Pérez " });
    expect(r).toEqual({ frecuencia: "bimestral", mesArranque: 3, montoEsperado: 150_050, responsable: "Ana Pérez" });
    expect(esquemaEdicion.parse({ responsable: "" })).toEqual({ responsable: null });
  });

  it("rechaza valores fuera de rango con mensajes en español y el campo afectado", () => {
    expect(error(esquemaEdicion.safeParse({}))).toEqual({ error: "No se indicó ningún cambio" });
    expect(error(esquemaEdicion.safeParse({ frecuencia: "quincenal" }))).toMatchObject({ campo: "frecuencia", error: expect.stringContaining("mensual, bimestral") });
    expect(error(esquemaEdicion.safeParse({ diaEsperadoPago: 32 }))).toEqual({ campo: "diaEsperadoPago", error: "El día esperado de pago debe ser un número entero de 1 a 31" });
    expect(error(esquemaEdicion.safeParse({ mesArranque: 13 }))?.error).toMatch(/1 \(enero\) a 12/);
    expect(error(esquemaEdicion.safeParse({ montoEsperado: 10.5 }))?.error).toMatch(/centavos/);
    expect(error(esquemaEdicion.safeParse({ montoEsperado: -1 }))?.error).toMatch(/negativo/);
    expect(error(esquemaEdicion.safeParse({ moneda: "EUR" }))?.error).toMatch(/CRC \(colones\) o USD/);
    expect(error(esquemaEdicion.safeParse({ activa: "si" }))?.campo).toBe("activa");
  });

  it("el alta exige sociedadId, categoría, proveedor e identificador, y limpia el identificador", () => {
    expect(error(esquemaAlta.safeParse({}))).toMatchObject({ error: "Indique la sociedad" });
    expect(error(esquemaAlta.safeParse({ sociedadId: 7, categoriaId: 1, proveedor: "  " }))).toMatchObject({ campo: "proveedor" });
    const r = esquemaAlta.parse({ sociedadId: 7, categoriaId: 1, proveedor: " Luz ", identificador: " cr12 0000 " });
    expect(r).toEqual({ sociedadId: 7, categoriaId: 1, proveedor: "Luz", identificador: "CR120000" });
  });

  it("el mes de arranque solo aplica a frecuencias no mensuales", () => {
    expect(errorMesArranque("mensual", 3)).toMatch(/solo aplica/);
    expect(errorMesArranque("mensual", null)).toBeNull();
    expect(errorMesArranque("anual", 3)).toBeNull();
  });
});
