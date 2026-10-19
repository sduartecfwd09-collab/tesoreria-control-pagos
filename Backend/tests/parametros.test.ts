import { describe, expect, it } from "vitest";
import { definicionDe, validarValor } from "../src/domain/parametros.js";

const def = (c: string, a = "global") => definicionDe(c, a)!;

describe("validarValor", () => {
  it("acepta enteros dentro de rango", () => {
    expect(validarValor(def("ventana_dias"), "5")).toBe("5");
    expect(validarValor(def("ventana_dias"), 0)).toBe("0");
  });
  it("rechaza vacío, decimales, negativos y fuera de rango", () => {
    expect(() => validarValor(def("ventana_dias"), "")).toThrow();
    expect(() => validarValor(def("ventana_dias"), "2.5")).toThrow();
    expect(() => validarValor(def("ventana_dias"), "-1")).toThrow();
    expect(() => validarValor(def("ventana_dias"), "99")).toThrow();
    expect(() => validarValor(def("tolerancia_pct", "categoria"), "101")).toThrow();
  });
  it("valida las opciones de frecuencia", () => {
    expect(validarValor(def("frecuencia_defecto"), " mensual ")).toBe("mensual");
    expect(() => validarValor(def("frecuencia_defecto"), "diaria")).toThrow();
  });
});
