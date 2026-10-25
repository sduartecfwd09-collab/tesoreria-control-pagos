// Prueba de integración OPCIONAL con la tabla de pagos real (CATALOGO_FILE, solo lectura).
// Se omite si la variable no está definida o el archivo no existe. Escribe únicamente en la base de pruebas (_test)
// y solo afirma sobre conteos: no imprime ni compara identificadores.
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { importarCatalogo } from "../src/catalogo/importar.js";
import { aNumero } from "../src/domain/montos.js";
import { etiquetaSociedad } from "../src/domain/sociedades.js";
import { calidadCatalogo } from "../src/domain/obligaciones.js";
import { prisma } from "../src/db.js";
import { listarSociedades, todasLasObligaciones } from "../src/repositories/obligaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";

const ruta = env.CATALOGO_FILE;
const hayArchivo = !!ruta && existsSync(ruta);

describe.skipIf(!hayArchivo)("importación del catálogo real", () => {
  beforeAll(async () => {
    await vaciarImportaciones();
  });
  afterAll(vaciarImportaciones);

  it("importa 65 obligaciones en 3 categorías y 5 sociedades, y es idempotente", async () => {
    const r = await importarCatalogo(ruta!);
    expect(r).toMatchObject({ filasLeidas: 65, creadas: 65, problemas: [] });
    expect(r.porSociedad).toEqual({ ZFL: 34, GGDI: 12, BONAVISTA: 10, WW: 7, MEMEMC: 2 });
    expect(Object.keys(r.porCategoria).sort()).toEqual(["CCSS", "Electricidad", "Telecom"]);
    expect(await prisma.sociedad.count()).toBe(5);

    const c = calidadCatalogo(
      (await todasLasObligaciones()).map((o) => ({ ...o, montoEsperado: aNumero(o.montoEsperado), sociedad: etiquetaSociedad(o.sociedad) })),
      (await listarSociedades()).map(etiquetaSociedad),
    );
    expect(c.sociedadesSinObligaciones).toEqual([]);
    expect(c.identificadoresRepetidos.map((g) => g.sociedad)).toEqual(["GGDI"]);
    expect(c.formatoIban.map((o) => o.sociedad)).toEqual(["ZFL"]);

    expect(await importarCatalogo(ruta!)).toMatchObject({ creadas: 0, actualizadas: 0, sinCambios: 65 });
    expect(await prisma.obligacion.count()).toBe(65);
  });
});
