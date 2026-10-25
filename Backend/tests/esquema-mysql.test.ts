import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { exigirBaseDePruebas } from "../src/config/proteccion-pruebas.js";
import { aNumero } from "../src/domain/montos.js";
import { asegurarCategoria } from "../src/repositories/parametros.js";
import { asegurarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";

describe("protección de la base de pruebas", () => {
  it("acepta solo bases cuyo nombre termina en _test", () => {
    expect(exigirBaseDePruebas("mysql://u:c@127.0.0.1:3306/tesoreria_test")).toContain("tesoreria_test");
    expect(() => exigirBaseDePruebas("mysql://u:c@127.0.0.1:3306/tesoreria_dev")).toThrow(/_test/);
    expect(() => exigirBaseDePruebas("mysql://u:c@127.0.0.1:3306/test_tesoreria")).toThrow(/_test/);
    expect(() => exigirBaseDePruebas(undefined)).toThrow(/no esta definida/);
  });

  it("el error no revela la dirección ni la clave", () => {
    try {
      exigirBaseDePruebas("mysql://usuario:claveSecreta@127.0.0.1:3306/tesoreria_dev");
    } catch (e) {
      expect(String((e as Error).message)).not.toMatch(/claveSecreta|usuario/);
    }
  });
});

describe("montos BigInt", () => {
  it("convierte a número y falla si pierde precisión", () => {
    expect(aNumero(null)).toBeNull();
    expect(aNumero(3_000_000_000n)).toBe(3_000_000_000);
    expect(() => aNumero(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(/precision/);
  });
});

describe("modelo sobre MySQL", () => {
  beforeAll(vaciarImportaciones);
  afterAll(vaciarImportaciones);

  it("guarda montos mayores a 32 bits y la fecha del vencimiento sin desfase", async () => {
    const s = await asegurarSociedad("AAA");
    const c = await asegurarCategoria("Prueba");
    const o = await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: c.id, proveedor: "P", identificador: "1", montoEsperado: 3_000_000_000n } });
    for (const [i, f] of ["2026-03-01", "2026-12-31"].entries()) {
      const v = await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha: new Date(`${f}T00:00:00Z`), periodo: `2026-0${i}` } });
      expect((await prisma.vencimiento.findUniqueOrThrow({ where: { id: v.id } })).fecha.toISOString().slice(0, 10)).toBe(f);
    }
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: o.id } })).montoEsperado).toBe(3_000_000_000n);
  });

  it("«Cable» y «CABLE» son la misma categoría (también con tildes y espacios)", async () => {
    const a = await asegurarCategoria("Cable");
    expect((await asegurarCategoria("CABLE")).id).toBe(a.id);
    expect((await asegurarCategoria("  cáble ")).id).toBe(a.id);
    expect(await prisma.categoria.count({ where: { nombreNormalizado: "cable" } })).toBe(1);
  });

  it("varias sociedades pueden no tener abreviatura, pero no repetir nombre largo", async () => {
    await prisma.sociedad.create({ data: { codigo: null, nombreLargo: "Sin abreviatura uno" } });
    await prisma.sociedad.create({ data: { codigo: null, nombreLargo: "Sin abreviatura dos" } });
    await expect(prisma.sociedad.create({ data: { codigo: null, nombreLargo: "SIN ABREVIATURA UNO" } })).rejects.toThrow();
  });

  it("rechaza textos más largos que la columna en vez de cortarlos", async () => {
    await expect(prisma.sociedad.create({ data: { codigo: "X".repeat(31), nombreLargo: "Larga" } })).rejects.toThrow();
  });
});
