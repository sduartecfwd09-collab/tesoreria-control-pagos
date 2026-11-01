import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calidadCatalogo, type ObligacionCalidad } from "../src/domain/obligaciones.js";
import { carpetaPermitida, guardarReporte, reporteDeCalidad } from "../src/reportes/calidad.js";

// Datos inventados: el reporte lista los pendientes que antes mostraba el panel y se escribe solo donde se le indica.
const obligacion = (id: number, sociedad: string, proveedor: string, identificador: string, extra: Partial<ObligacionCalidad> = {}): ObligacionCalidad => ({
  id, sociedad, proveedor, identificador, activa: true, diaEsperadoPago: 10, frecuencia: "mensual", mesArranque: null, montoEsperado: null,
  cuentaEsperadaId: null, responsable: null, frecuenciaPorConfirmar: true, monedaPorConfirmar: true, ...extra,
} as ObligacionCalidad);

describe("reporte de calidad", () => {
  const c = calidadCatalogo(
    [obligacion(1, "Sociedad Uno", "Luz", "5551"), obligacion(2, "Sociedad Uno", "Agua", "5551"), obligacion(3, "Sociedad Dos", "Cable", "CR05015202001026284066")],
    [{ nombre: "Sociedad Uno", conEstados: true }, { nombre: "Sociedad Dos", conEstados: true }, { nombre: "Sociedad Tres", conEstados: true }, { nombre: "Sociedad Cuatro", conEstados: false }],
  );

  it("lista repetidos, formato de IBAN, sociedades sin obligaciones y conteos", () => {
    const md = reporteDeCalidad(c, "2026-10-31");
    expect(md).toContain("# Pendientes de calidad del catálogo (2026-10-31)");
    expect(md).toContain("- Sociedad Uno: `5551` aparece con Luz, Agua.");
    expect(md).toContain("- Sociedad Dos (Cable): `CR05015202001026284066`");
    expect(md).toContain("- Sociedad Tres");
    expect(md).toContain("- Sociedad Cuatro");
    expect(md).toContain("Frecuencia sin confirmar: 3");
    expect(md).toContain("Pendientes: 5");
  });

  it("escribe un archivo Markdown en la carpeta indicada y la crea si falta", () => {
    const base = mkdtempSync(join(tmpdir(), "calidad-"));
    try {
      const ruta = guardarReporte(join(base, "nueva", "resultados"), "2026-10-31", reporteDeCalidad(c, "2026-10-31"));
      expect(ruta.endsWith("calidad-2026-10-31.md")).toBe(true);
      expect(readFileSync(ruta, "utf8")).toContain("Pendientes: 5");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("nunca escribe en la carpeta de los estados de cuenta ni en la del catálogo", () => {
    const fuentes = ["C:/datos/estados", "C:/datos/catalogo/tabla.xlsx"];
    expect(carpetaPermitida("C:/datos/estados", fuentes)).toBe(false);
    expect(carpetaPermitida("C:/datos/estados/subcarpeta", fuentes)).toBe(false);
    expect(carpetaPermitida("C:/datos/catalogo", fuentes)).toBe(false);
    expect(carpetaPermitida("C:/proyecto/Backend/resultados", fuentes)).toBe(true);
    expect(carpetaPermitida("C:/proyecto/Backend/resultados", [undefined])).toBe(true);
  });
});
