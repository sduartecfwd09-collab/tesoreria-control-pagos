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
import { sembrarSociedadesDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones } from "./helpers/db.js";

const ruta = env.CATALOGO_FILE;
const hayArchivo = !!ruta && existsSync(ruta);

describe.skipIf(!hayArchivo)("importación del catálogo real", () => {
  beforeAll(async () => {
    await vaciarImportaciones();
    await sembrarSociedadesDelCatalogo(["ZFL", "GGDI", "BONAVISTA", "WW", "MEMEMC"]); // el importador no crea sociedades
  });
  afterAll(vaciarImportaciones);

  // El catálogo real cambia (José lo actualiza): solo se afirman invariantes y conteos, nunca valores del archivo.
  it("carga todas las filas que se pueden cargar, deja el resto en revisión, y es idempotente", async () => {
    const r = await importarCatalogo(ruta!);
    expect(r.filasLeidas).toBeGreaterThan(0);
    expect(r.creadas + r.enRevision).toBe(r.filasLeidas);
    expect(await prisma.obligacion.count()).toBe(r.creadas);
    expect(await prisma.sociedad.count()).toBe(5); // el importador no crea sociedades

    const c = calidadCatalogo(
      (await todasLasObligaciones()).map((o) => ({ ...o, montoEsperado: aNumero(o.montoEsperado), sociedad: etiquetaSociedad(o.sociedad) })),
      (await listarSociedades()).map(etiquetaSociedad),
    );
    expect(c.total).toBe(r.creadas);

    expect(await importarCatalogo(ruta!)).toMatchObject({ creadas: 0, actualizadas: 0, sinCambios: r.creadas, enRevision: r.enRevision });
    expect(await prisma.obligacion.count()).toBe(r.creadas);
  });
});
