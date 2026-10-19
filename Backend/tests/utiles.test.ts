import { describe, expect, it } from "vitest";
import { normalizar, parsearFecha, parsearMonto } from "../src/ingest/utiles.js";
import { monedaDeIbanBct, parsearNombreArchivo } from "../src/ingest/nombre-archivo.js";
import { serial } from "./helpers/muestras.js";

describe("parsearFecha", () => {
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
  it("acepta fecha nativa, serial de Excel y texto dd/mm/aaaa", () => {
    expect(iso(parsearFecha(new Date(Date.UTC(2026, 7, 31))))).toBe("2026-08-31");
    expect(iso(parsearFecha(serial(2026, 8, 31)))).toBe("2026-08-31");
    expect(iso(parsearFecha(serial(2026, 8, 31) + 0.75))).toBe("2026-08-31"); // serial con hora
    expect(iso(parsearFecha("31/08/2026"))).toBe("2026-08-31");
    expect(iso(parsearFecha(" 5/9/2026 "))).toBe("2026-09-05");
    expect(iso(parsearFecha("17/08/2026 08:16 AM"))).toBe("2026-08-17");
    expect(iso(parsearFecha("2026-09-30"))).toBe("2026-09-30");
  });
  it("interpreta día/mes (no mes/día)", () => {
    expect(iso(parsearFecha("03/09/2026"))).toBe("2026-09-03");
  });
  it("rechaza lo que no es fecha", () => {
    for (const v of ["Saldo Inicial", "31/13/2026", "30/02/2026", "", null, undefined, 123, 4000001, "Totales"]) {
      expect(parsearFecha(v)).toBeNull();
    }
  });
});

describe("parsearMonto", () => {
  it("convierte a centavos enteros", () => {
    expect(parsearMonto(10597.11)).toBe(1059711);
    expect(parsearMonto(0.1 + 0.2)).toBe(30); // sin errores de coma flotante
    expect(parsearMonto(35)).toBe(3500);
  });
  it("lee texto con comas de miles y espacios", () => {
    expect(parsearMonto("215,000.25")).toBe(21500025);
    expect(parsearMonto("  1,234,567.80 ")).toBe(123456780);
    expect(parsearMonto("99.99")).toBe(9999);
  });
  it("respeta el signo (negativo, paréntesis, guion final)", () => {
    expect(parsearMonto("-150.25")).toBe(-15025);
    expect(parsearMonto("(150.25)")).toBe(-15025);
    expect(parsearMonto("150.25-")).toBe(-15025);
    expect(parsearMonto(-3)).toBe(-300);
  });
  it("vacío o texto no numérico -> null", () => {
    for (const v of ["", " ", "-", "abc", null, undefined, "Total débitos"]) expect(parsearMonto(v)).toBeNull();
  });
  it("coma decimal sin punto (12,5) se toma como decimal", () => {
    expect(parsearMonto("12,5")).toBe(1250);
  });
});

describe("normalizar", () => {
  it("quita tildes, mayúsculas, asterisco final y espacios", () => {
    expect(normalizar("  Débitos  (DR) ")).toBe("debitos (dr)");
    expect(normalizar("Balance*")).toBe("balance");
    expect(normalizar("NÚMERO")).toBe("numero");
  });
});

describe("nombre de archivo", () => {
  it("extrae cuenta, periodo, sociedad y banco", () => {
    expect(parsearNombreArchivo("CR91010710102200000001 0826 ZFL.xlsx")).toEqual({
      cuenta: "CR91010710102200000001", periodo: "2026-08", sociedad: "ZFL", codigoBanco: "0107",
    });
    expect(parsearNombreArchivo("97010220000013 0926 MEMEMC.xlsx")).toMatchObject({ cuenta: "97010220000013", periodo: "2026-09", codigoBanco: null });
  });
  it("rechaza nombres fuera de convención", () => {
    expect(parsearNombreArchivo("estado agosto.xlsx")).toBeNull();
    expect(parsearNombreArchivo("CR91010710102200000001 1326 ZFL.xlsx")).toBeNull();
  });
  it("infiere la moneda del IBAN solo en BCT", () => {
    expect(monedaDeIbanBct("CR91010710102200000001")).toBe("USD");
    expect(monedaDeIbanBct("CR92010710102100000002")).toBe("CRC");
    expect(monedaDeIbanBct("CR93010700000000000003")).toBeNull();
    expect(monedaDeIbanBct("CR94010200000000000004")).toBeNull();
  });
});
