import { describe, expect, it } from "vitest";
import { verificarContinuidad } from "../src/ingest/calidad.js";
import type { MovimientoLeido } from "../src/ingest/tipos.js";
import { clavesDeDeduplicacion } from "../src/ingest/clave-dedup.js";

const mv = (fila: number, debito: number, credito: number, saldo: number | null, dia = 1): MovimientoLeido => ({
  hoja: "H", fila, fecha: new Date(Date.UTC(2026, 7, dia)), referencia: null, codigo: null, descripcion: "x", debito, credito, saldo,
});

describe("continuidad del saldo", () => {
  it("cuadra cuando saldo anterior ± importe = saldo siguiente", () => {
    const r = verificarContinuidad([mv(1, 0, 10000, 110000), mv(2, 5000, 0, 105000)], { apertura: 100000 });
    expect(r).toMatchObject({ estado: "cuadra", verificados: 2, fallos: 0, usoSaldoApertura: true });
  });
  it("detecta un saldo que no cuadra y dice en qué fila", () => {
    const r = verificarContinuidad([mv(10, 0, 10000, 110000), mv(11, 5000, 0, 999), mv(12, 0, 1, 1000)], { apertura: 100000 });
    expect(r.estado).toBe("no_cuadra");
    expect(r.filasConFallo).toContain(11);
    expect(r.fallos).toBeGreaterThan(0);
  });
  it("reconoce archivos ordenados del más reciente al más antiguo", () => {
    const r = verificarContinuidad([mv(1, 5000, 0, 105000), mv(2, 0, 10000, 110000)], { apertura: 100000 });
    expect(r).toMatchObject({ estado: "cuadra", orden: "descendente", usoSaldoApertura: true });
    const sinApertura = verificarContinuidad([mv(1, 5000, 0, 105000), mv(2, 0, 10000, 110000)], { apertura: null });
    expect(sinApertura).toMatchObject({ estado: "cuadra", orden: "descendente" });
  });
  it("sin apertura compara solo pares; con un solo movimiento no es verificable", () => {
    expect(verificarContinuidad([mv(1, 0, 100, 500), mv(2, 0, 100, 600)], { apertura: null }).estado).toBe("cuadra");
    expect(verificarContinuidad([mv(1, 0, 100, 500)], { apertura: null }).estado).toBe("no_verificable");
    expect(verificarContinuidad([], { apertura: null })).toMatchObject({ estado: "no_verificable", motivo: "sin movimientos" });
  });
  it("movimientos sin saldo no son verificables (no se descartan)", () => {
    expect(verificarContinuidad([mv(1, 0, 100, null)], { apertura: 0 }).estado).toBe("no_verificable");
  });
  it("saldo diario: compara el cierre de cada día", () => {
    const movs = [mv(1, 0, 1000, 11000, 1), mv(2, 0, 2000, 13000, 1), mv(3, 500, 0, 12500, 2)];
    expect(verificarContinuidad(movs, { apertura: 10000, saldoDiario: true }).estado).toBe("cuadra");
    expect(verificarContinuidad([...movs.slice(0, 2), mv(3, 500, 0, 1, 2)], { apertura: 10000, saldoDiario: true }).estado).toBe("no_cuadra");
  });
});

describe("clave de deduplicación", () => {
  const a = { ...mv(1, 15050, 0, 100), referencia: "R1", descripcion: "Pago  SERVICIO" };
  it("filas idénticas dentro del archivo NO colapsan (ordinal n)", () => {
    const claves = clavesDeDeduplicacion(1, [a, { ...a, fila: 2 }, { ...a, fila: 3 }]);
    expect(new Set(claves).size).toBe(3);
  });
  it("el mismo movimiento en otro archivo de la misma cuenta produce la misma clave (aunque cambie la fila o el formato del texto)", () => {
    const [k1] = clavesDeDeduplicacion(1, [a]);
    const [k2] = clavesDeDeduplicacion(1, [{ ...a, fila: 99, hoja: "Otra", descripcion: "pago servicio " }]);
    expect(k1).toBe(k2);
  });
  it("cuentas distintas o importes distintos -> claves distintas", () => {
    const [k1] = clavesDeDeduplicacion(1, [a]);
    expect(clavesDeDeduplicacion(2, [a])[0]).not.toBe(k1);
    expect(clavesDeDeduplicacion(1, [{ ...a, debito: 15051 }])[0]).not.toBe(k1);
  });
});
