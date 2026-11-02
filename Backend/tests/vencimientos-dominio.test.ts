import { describe, expect, it } from "vitest";
import { hoyDe, periodoDe } from "../src/domain/reloj.js";
import { fechaVencimiento, periodosEntre, planificar, tocaEnPeriodo, type ObligacionPlan } from "../src/domain/vencimientos.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ob = (o: Partial<ObligacionPlan> = {}): ObligacionPlan => ({
  id: 1, sociedadId: 1, categoriaId: 1, proveedor: "P", cuentaEsperadaId: null, moneda: "CRC",
  activa: true, frecuencia: "mensual", mesArranque: null, diaEsperadoPago: 15, montoEsperado: null, ...o,
});
const meses = (frecuencia: string, mesArranque: number | null) =>
  periodosEntre("2026-01", "2026-12").filter((p) => tocaEnPeriodo(frecuencia, mesArranque, p)).map((p) => Number(p.slice(5)));

describe("periodosEntre", () => {
  it("incluye ambos extremos y cruza de año", () => {
    expect(periodosEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(periodosEntre("2026-08", "2026-08")).toEqual(["2026-08"]);
    expect(periodosEntre("2026-09", "2026-08")).toEqual([]);
  });
});

describe("frecuencias", () => {
  it("mensual toca todos los meses, sin importar el mes de arranque", () => {
    expect(meses("mensual", null)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(meses("mensual", 5)).toHaveLength(12);
  });
  it("bimestral, trimestral, semestral y anual cuentan desde el mes de arranque", () => {
    expect(meses("bimestral", 2)).toEqual([2, 4, 6, 8, 10, 12]);
    expect(meses("trimestral", 2)).toEqual([2, 5, 8, 11]);
    expect(meses("trimestral", 11)).toEqual([2, 5, 8, 11]); // arranque al final del año: igual ciclo
    expect(meses("semestral", 3)).toEqual([3, 9]);
    expect(meses("anual", 7)).toEqual([7]);
  });
  it("sin mes de arranque una frecuencia no mensual no toca nunca", () => {
    expect(meses("trimestral", null)).toEqual([]);
  });
});

describe("fechaVencimiento", () => {
  it("usa el último día si el día no existe en el mes (31 en meses cortos y febrero)", () => {
    expect(iso(fechaVencimiento("2026-04", 31))).toBe("2026-04-30");
    expect(iso(fechaVencimiento("2026-02", 31))).toBe("2026-02-28");
    expect(iso(fechaVencimiento("2026-02", 29))).toBe("2026-02-28");
    expect(iso(fechaVencimiento("2028-02", 30))).toBe("2028-02-29"); // bisiesto
    expect(iso(fechaVencimiento("2026-08", 31))).toBe("2026-08-31");
    expect(iso(fechaVencimiento("2026-09", 1))).toBe("2026-09-01");
  });
});

describe("planificar", () => {
  it("genera un vencimiento por obligación y periodo con su monto", () => {
    const r = planificar([ob({ montoEsperado: 500 }), ob({ id: 2, frecuencia: "bimestral", mesArranque: 8, diaEsperadoPago: 31 })], ["2026-08", "2026-09"]);
    expect(r.omitidas).toEqual([]);
    expect(r.vencimientos.map((v) => [v.obligacionId, v.periodo, iso(v.fecha), v.montoEsperado])).toEqual([
      [1, "2026-08", "2026-08-15", 500],
      [1, "2026-09", "2026-09-15", 500],
      [2, "2026-08", "2026-08-31", null],
    ]);
  });
  it("ignora las inactivas y reporta las que no se pueden planificar", () => {
    const r = planificar(
      [ob({ activa: false }), ob({ id: 2, diaEsperadoPago: null }), ob({ id: 3, frecuencia: "anual" }), ob({ id: 4, frecuencia: "quincenal" })],
      ["2026-08"],
    );
    expect(r.vencimientos).toEqual([]);
    expect(r.omitidas).toEqual([
      { obligacionId: 2, motivo: "falta_dia" },
      { obligacionId: 3, motivo: "falta_mes_arranque" },
      { obligacionId: 4, motivo: "frecuencia_desconocida" },
    ]);
  });
});

describe("reloj", () => {
  it("toma la fecha local del reloj inyectado, a medianoche UTC", () => {
    const hoy = hoyDe(() => new Date(2026, 8, 15, 23, 30)); // 15 sep 2026, 23:30 hora local
    expect(iso(hoy)).toBe("2026-09-15");
    expect(periodoDe(hoy)).toBe("2026-09");
  });
});
