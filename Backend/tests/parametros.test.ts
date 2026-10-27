import { describe, expect, it } from "vitest";
import { definicionDe, validarValor } from "../src/domain/parametros.js";

const def = (c: string, a = "global") => definicionDe(c, a)!;

describe("validarValor", () => {
  it("acepta enteros dentro de rango", () => {
    expect(validarValor(def("ventana_dias_antes"), "5")).toBe("5");
    expect(validarValor(def("ventana_dias_antes"), 0)).toBe("0");
  });
  it("rechaza vacío, decimales, negativos y fuera de rango", () => {
    expect(() => validarValor(def("ventana_dias_antes"), "")).toThrow();
    expect(() => validarValor(def("ventana_dias_antes"), "2.5")).toThrow();
    expect(() => validarValor(def("ventana_dias_antes"), "-1")).toThrow();
    expect(() => validarValor(def("ventana_dias_antes"), "99")).toThrow();
  });
  it("valida las opciones de frecuencia", () => {
    expect(validarValor(def("frecuencia_defecto"), " mensual ")).toBe("mensual");
    expect(() => validarValor(def("frecuencia_defecto"), "diaria")).toThrow();
  });
});
