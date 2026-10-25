import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { fechasPorSociedadYMes } from "../src/repositories/consultas.js";
import { informeFechas } from "../src/ingest/informe-fechas.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";

describe("verificación de fechas de los movimientos", () => {
  beforeAll(async () => {
    await vaciarImportaciones();
    const s = await sembrarSociedad("AAA", "AAA");
    const cuenta = await prisma.cuenta.create({ data: { sociedadId: s.id, numero: "CUENTA-INVENTADA" } });
    const archivo = await prisma.archivoImportado.create({ data: { ruta: "inventado", hash: "h", mes: "2026-03" } });
    // Mes del archivo: marzo de 2026. Dentro: 1 y 31 de marzo. A un dia: 28 de feb y 1 de abril. Fuera: 27 de feb y 5 de abril.
    const fechas = ["2026-03-01", "2026-03-31", "2026-02-28", "2026-04-01", "2026-02-27", "2026-04-05"];
    for (const [i, f] of fechas.entries()) {
      await prisma.movimiento.create({
        data: {
          cuentaId: cuenta.id, archivoId: archivo.id, hoja: "h", fila: i + 1, periodo: "2026-03", fecha: new Date(`${f}T00:00:00Z`),
          debito: 100n, credito: 0n, claveDedup: String(i).padStart(40, "0"),
        },
      });
    }
  });
  afterAll(vaciarImportaciones);

  it("calcula mínima, máxima y los movimientos fuera de la tolerancia de un día", async () => {
    const filas = await fechasPorSociedadYMes();
    expect(filas).toEqual([
      { sociedad: "AAA", mes: "2026-03", movimientos: 6, fechaMinima: "2026-02-27", fechaMaxima: "2026-04-05", fueraDeTolerancia: 2, desvioMaximoDias: 5 },
    ]);
  });

  it("el informe trae solo agregados", () => {
    const texto = informeFechas("tesoreria_dev", [
      { sociedad: "AAA", mes: "2026-03", movimientos: 6, fechaMinima: "2026-02-27", fechaMaxima: "2026-04-05", fueraDeTolerancia: 2, desvioMaximoDias: 5 },
    ]);
    expect(texto).toContain("AAA | 2026-03 | 6 | 2026-02-27 | 2026-04-05 | 2 | 5");
    expect(texto).toContain("REVISAR; mayor desvio 5 dia(s)");
    expect(texto).not.toMatch(/CUENTA-INVENTADA|100/);
  });
});
