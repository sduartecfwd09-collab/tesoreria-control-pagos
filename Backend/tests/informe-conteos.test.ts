import { describe, expect, it } from "vitest";
import { enmascarar, informeConteos, type FilaConteo } from "../src/ingest/informe-conteos.js";

const filas: FilaConteo[] = [
  { sociedad: "AAA", mes: "2026-08", estado: "leido", movimientos: 10, error: null },
  { sociedad: "AAA", mes: "2026-09", estado: "leido", movimientos: 5, error: null },
  { sociedad: "BBB", mes: "2026-08", estado: "error", movimientos: 0, error: "Formato no reconocido: no se encontró una fila de encabezado válida" },
  { sociedad: null, mes: null, estado: "error", movimientos: 0, error: "El nombre no cumple la convención «<IBAN> <MMAA> <SOCIEDAD>.xlsx»" },
  { sociedad: "BBB", mes: "2026-09", estado: "error", movimientos: 0, error: "Fallo con CR98012300130000000008 y saldo 123456789" },
  { sociedad: null, mes: "2026-08", estado: "en_revision", movimientos: 0, error: null, motivo: "carpeta sin sociedad asignada" },
  { sociedad: "AAA", mes: "2026-08", estado: "en_revision", movimientos: 0, error: null, motivo: "nombre de archivo no coincide con la carpeta" },
  { sociedad: "AAA", mes: "2026-09", estado: "en_revision", movimientos: 0, error: null, motivo: "nombre de archivo no coincide con la carpeta" },
];

describe("informe de conteos de la importación", () => {
  const texto = informeConteos("tesoreria_dev", { leidos: 2, conError: 3, enRevision: 2, sinCambios: 0, movimientos: 15, duplicados: 1 }, filas);

  it("trae los conteos pedidos", () => {
    expect(texto).toContain("Base de datos: tesoreria_dev");
    expect(texto).toContain("archivos leidos: 2 | sin cambios: 0 | con error: 3 | en revision: 2");
    expect(texto).toContain("movimientos importados: 15 | duplicados entre archivos: 1");
    expect(texto).toContain("con error: 3 (no reconocidos: 2) | en revision: 3");
    expect(texto).toContain("AAA | 2026-08 | 1 | 0 | 1 | 10");
    expect(texto).toContain("(sin sociedad) | (sin mes) | 0 | 1 | 0 | 0");
    expect(texto).toContain("AAA | 2 | 0 | 2 | 15");
  });

  it("enmascara números largos e IBAN de los motivos", () => {
    expect(texto).not.toMatch(/98012300130000000008|123456789/);
    expect(texto).not.toContain("CR98");
    expect(enmascarar("Cuenta CR98 0123 0013 y 987654")).toBe("Cuenta CR# y #");
  });
});

describe("informe: archivos en revisión", () => {
  const texto = informeConteos("tesoreria_dev", { leidos: 0, conError: 0, enRevision: 3, sinCambios: 0, movimientos: 0, duplicados: 0 }, [
    { sociedad: null, mes: "2026-08", estado: "en_revision", movimientos: 0, error: null, motivo: "carpeta sin sociedad asignada" },
    { sociedad: "AAA", mes: "2026-08", estado: "en_revision", movimientos: 0, error: null, motivo: "nombre de archivo no coincide con la carpeta" },
    { sociedad: "AAA", mes: "2026-09", estado: "en_revision", movimientos: 0, error: null, motivo: "nombre de archivo no coincide con la carpeta" },
  ]);

  it("los agrupa por motivo, sin rutas ni nombres", () => {
    expect(texto).toContain("2 archivo(s): nombre de archivo no coincide con la carpeta");
    expect(texto).toContain("1 archivo(s): carpeta sin sociedad asignada");
    expect(texto).not.toMatch(/\.xlsx|CR\d/);
  });

  it("no los cuenta como leídos", () => {
    expect(texto).toContain("archivos leidos: 0 | con error: 0 (no reconocidos: 0) | en revision: 3");
  });
});
