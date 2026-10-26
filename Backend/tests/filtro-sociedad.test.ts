import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { asegurarCategoria } from "../src/repositories/parametros.js";
import { listarObligaciones } from "../src/repositories/obligaciones.js";
import { listarVencimientos } from "../src/repositories/vencimientos.js";
import { copiaDeObligacion, vaciarImportaciones } from "./helpers/db.js";

// Datos inventados: una sociedad con abreviatura y otra sin abreviatura (como las que carga la lista maestra).
let conCodigo: number;
let sinCodigo: number;

beforeAll(async () => {
  await vaciarImportaciones();
  const cat = await asegurarCategoria("Prueba filtro");
  conCodigo = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad inventada AAA" } })).id;
  sinCodigo = (await prisma.sociedad.create({ data: { nombreLargo: "Sociedad inventada sin abreviatura" } })).id;
  for (const [i, sociedadId] of [conCodigo, sinCodigo, sinCodigo].entries()) {
    const o = await prisma.obligacion.create({ data: { sociedadId, categoriaId: cat.id, proveedor: "Proveedor inventado", identificador: `ID-${i}`, diaEsperadoPago: 10 } });
    await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha: new Date("2026-08-10T00:00:00Z"), periodo: "2026-08", ...copiaDeObligacion(o) } });
  }
});
afterAll(vaciarImportaciones);

describe("filtro por sociedad", () => {
  it("las obligaciones se filtran por identificador, también las de una sociedad sin abreviatura", async () => {
    expect((await listarObligaciones({ sociedadId: sinCodigo, pagina: 1, porPagina: 50 })).total).toBe(2);
    expect((await listarObligaciones({ sociedadId: conCodigo, pagina: 1, porPagina: 50 })).total).toBe(1);
    expect((await listarObligaciones({ pagina: 1, porPagina: 50 })).total).toBe(3);
  });

  it("los vencimientos se filtran por identificador de sociedad", async () => {
    expect((await listarVencimientos({ sociedadId: sinCodigo, pagina: 1, porPagina: 50 })).total).toBe(2);
    expect((await listarVencimientos({ sociedadId: conCodigo, pagina: 1, porPagina: 50 })).total).toBe(1);
  });

  it("el filtro por abreviatura sigue funcionando", async () => {
    expect((await listarObligaciones({ sociedad: "AAA", pagina: 1, porPagina: 50 })).total).toBe(1);
  });
});
