import { describe, expect, it } from "vitest";
import { exigirBaseDeDesarrollo } from "../src/config/proteccion-reinicio.js";

// Direcciones inventadas.
const dir = (base: string, host = "127.0.0.1") => `mysql://usuario:clave-secreta@${host}:3306/${base}`;

describe("db:reiniciar: protección", () => {
  it("acepta una base de desarrollo local", () => {
    expect(exigirBaseDeDesarrollo(dir("tesoreria_dev"), "development")).toBe(dir("tesoreria_dev"));
    expect(exigirBaseDeDesarrollo(dir("otra_dev", "localhost"), undefined)).toContain("otra_dev");
  });

  it("se niega con una base de pruebas", () => {
    expect(() => exigirBaseDeDesarrollo(dir("tesoreria_test"), undefined)).toThrow(/pruebas/);
  });

  it("se niega con cualquier base que no termine en _dev (producción incluida)", () => {
    expect(() => exigirBaseDeDesarrollo(dir("tesoreria"), undefined)).toThrow(/_dev/);
    expect(() => exigirBaseDeDesarrollo(dir("tesoreria_prod"), undefined)).toThrow(/_dev/);
  });

  it("se niega si el entorno es production o el servidor no es local", () => {
    expect(() => exigirBaseDeDesarrollo(dir("tesoreria_dev"), "production")).toThrow(/production/);
    expect(() => exigirBaseDeDesarrollo(dir("tesoreria_dev", "db.interno.invalid"), undefined)).toThrow(/127\.0\.0\.1/);
  });

  it("se niega sin dirección y no muestra la clave en ningún mensaje", () => {
    expect(() => exigirBaseDeDesarrollo(undefined, undefined)).toThrow(/DATABASE_URL/);
    for (const u of [dir("tesoreria_test"), dir("x"), dir("tesoreria_dev", "otro.invalid")]) {
      try {
        exigirBaseDeDesarrollo(u, undefined);
      } catch (e) {
        expect((e as Error).message).not.toMatch(/clave-secreta|usuario/);
      }
    }
  });
});
