import { describe, expect, it } from "vitest";
import { desglosarSinMovimientos } from "../src/vencimientos/diagnostico-margen.js";
import { esSinMovimientos } from "../src/domain/saldo.js";
import type { ContinuidadGuardada } from "../src/domain/saldo.js";
import type { ClaseArchivoImagen } from "../src/domain/clasificar-imagenes.js";

const noVerif = (razon: "sin_movimientos" | "imagen_no_legible"): ContinuidadGuardada => ({ estado: "no_verificable", razon });
const cuadra: ContinuidadGuardada = { estado: "cuadra" };

describe("sección 12: archivos sin movimientos por clase", () => {
  const archivos: { continuidad?: ContinuidadGuardada; clase: ClaseArchivoImagen }[] = [
    { continuidad: noVerif("sin_movimientos"), clase: "probable_logo" },
    { continuidad: noVerif("sin_movimientos"), clase: "probable_logo" },
    { continuidad: noVerif("imagen_no_legible"), clase: "posible_captura" },
    { continuidad: noVerif("sin_movimientos"), clase: "sin_imagen" },
    { continuidad: noVerif("sin_movimientos"), clase: "otra" },
    { continuidad: noVerif("sin_movimientos"), clase: "sin_dato" },
    { continuidad: cuadra, clase: "sin_imagen" },
  ];

  it("cuenta cada clase, incluida la imagen no legible, y el total es la suma", () => {
    const d = desglosarSinMovimientos(archivos);
    expect(d.sin.get("probable_logo")).toBe(2);
    expect(d.sin.get("posible_captura")).toBe(1);
    expect(d.sin.get("sin_imagen")).toBe(1);
    expect(d.sin.get("otra")).toBe(1);
    expect(d.sin.get("sin_dato")).toBe(1);
    expect(d.totalSin).toBe(6);
    expect(d.totalSin).toBe([...d.sin.values()].reduce((s, n) => s + n, 0));
    expect(d.totalCon).toBe(1);
  });

  it("esSinMovimientos sigue dando falso para imagen no legible", () => {
    expect(esSinMovimientos(noVerif("imagen_no_legible"))).toBe(false);
    expect(esSinMovimientos(noVerif("sin_movimientos"))).toBe(true);
  });
});
