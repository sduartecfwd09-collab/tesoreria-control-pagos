// Prueba de integración OPCIONAL: usa la carpeta real de STATEMENTS_ROOT (solo lectura).
// Se omite si la variable no está definida o la carpeta no existe. Escribe únicamente en la base de pruebas (_test)
// y solo afirma sobre conteos y estructura: no imprime ni compara descripciones de movimientos.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { env } from "../src/config/env.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { vaciarImportaciones } from "./helpers/db.js";

const raiz = env.STATEMENTS_ROOT;
const hayCarpeta = !!raiz && existsSync(raiz);

function contarXlsx(base: string): number {
  let n = 0;
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.toLowerCase() === "resultados" || d.name.startsWith(".")) continue;
    n += readdirSync(path.join(base, d.name)).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$")).length;
  }
  return n;
}

describe.skipIf(!hayCarpeta)("importación de la carpeta real", () => {
  beforeAll(vaciarImportaciones);
  afterAll(vaciarImportaciones);

  it("procesa todos los archivos, deja cada error marcado y es idempotente", async () => {
    const esperados = contarXlsx(raiz!);
    const r = await importarCarpeta(raiz!);
    expect(r.leidos + r.conError).toBe(esperados);
    const archivos = await prisma.archivoImportado.findMany();
    expect(archivos).toHaveLength(esperados);
    for (const a of archivos.filter((x) => x.estado === "error")) expect(a.error).toBeTruthy();
    for (const a of archivos.filter((x) => x.estado === "leido")) expect(a.formato).toMatch(/^E[1-7]$/);
    expect(await prisma.movimiento.count()).toBe(r.movimientos - r.duplicados);
    console.log(`Integración real: ${r.leidos} leídos, ${r.conError} con error, ${r.movimientos} movimientos`);

    const otra = await importarCarpeta(raiz!);
    expect(otra.sinCambios).toBe(r.leidos);
  });
});
