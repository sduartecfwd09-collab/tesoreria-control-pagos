import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { importarCatalogo } from "../src/catalogo/importar.js";
import { proveedorCanonico } from "../src/config/alias-proveedores.js";
import { prisma } from "../src/db.js";
import { catalogo, sembrarSociedadesDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones } from "./helpers/db.js";

describe("proveedorCanonico", () => {
  it("une «JASEC Internet» con JASEC y «ICE Telefono» con ICE, sin importar mayúsculas, tildes ni espacios", () => {
    for (const v of ["JASEC Internet", "jasec internet", "  JASEC   INTERNET ", "JasecInternet"]) expect(proveedorCanonico(v), v).toBe("JASEC");
    for (const v of ["ICE Telefono", "ICE Teléfono", "ice  telefono", "ICETELEFONO"]) expect(proveedorCanonico(v), v).toBe("ICE");
  });

  it("el resto queda igual: no se une nada por parecido", () => {
    for (const v of ["JASEC", "ICE", "Cabletica", "CCSS", "Claro", "CNFL", "Movistar", "Tigo", "ICE Electricidad", "JASEC Luz", "Jasec Internet 2"]) {
      expect(proveedorCanonico(v), v).toBe(v);
    }
  });
});

describe("el importador y el alta manual usan la unión", () => {
  let dir: string;
  let archivo: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "alias-prov-"));
    archivo = path.join(dir, "catalogo.xlsx");
  });
  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await vaciarImportaciones();
  });
  beforeEach(async () => {
    await vaciarImportaciones();
    await sembrarSociedadesDelCatalogo();
  });

  const combinaciones = async () => {
    const o = await prisma.obligacion.findMany({ select: { proveedor: true, categoria: { select: { nombre: true } } } });
    const m: Record<string, number> = {};
    for (const x of o) m[`${x.proveedor} | ${x.categoria.nombre}`] = (m[`${x.proveedor} | ${x.categoria.nombre}`] ?? 0) + 1;
    return m;
  };

  const FILAS = [
    ["AAA", "Electricidad", "JASEC", "1001", "05 DIA"],
    ["AAA", "Internet", "JASEC Internet", "2001", "05 DIA"],
    ["BBB", "Internet", "jasec  internet", "2002", "06 DIA"],
    ["AAA", "Telecom", "ICE Telefono", "3001", "07 DIA"],
    ["BBB", "Electricidad", "ICE", "4001", "08 DIA"],
    ["BBB", "Cable", "Cabletica", "5001", "09 DIA"],
  ];

  it("el catálogo carga las variantes con el proveedor canónico, sin mezclar categorías ni perder filas, y reimportar no duplica", async () => {
    writeFileSync(archivo, await catalogo(FILAS));
    const r = await importarCatalogo(archivo);
    expect(r).toMatchObject({ creadas: 6, enRevision: 0 });
    expect(r.proveedores.map((p) => p.nombre).sort()).toEqual(["Cabletica", "ICE", "JASEC"]);
    expect(await combinaciones()).toEqual({
      "JASEC | Electricidad": 1, "JASEC | Internet": 2, "ICE | Telecom": 1, "ICE | Electricidad": 1, "Cabletica | Cable": 1,
    });
    const again = await importarCatalogo(archivo);
    expect(again).toMatchObject({ creadas: 0, actualizadas: 0, sinCambios: 6 });
    expect(await prisma.obligacion.count()).toBe(6);
  });

  it("dos filas que solo difieren en la variante del proveedor son la misma obligación (se avisa y no se duplica)", async () => {
    writeFileSync(archivo, await catalogo([["AAA", "Internet", "JASEC", "2001", "05 DIA"], ["AAA", "Internet", "JASEC Internet", "2001", "05 DIA"]]));
    const r = await importarCatalogo(archivo);
    expect(r.creadas).toBe(1);
    expect(r.problemas).toEqual([{ fila: 5, motivo: expect.stringContaining("Repite la fila 4"), importada: false }]);
  });

  it("el alta manual guarda el proveedor canónico y bloquea si ya existe esa obligación bajo el nombre canónico", async () => {
    const app = await crearApp({ reloj: () => new Date(2026, 8, 10, 10, 0) });
    try {
      const sociedadId = (await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "AAA" } })).id;
      const categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { nombreNormalizado: "internet" } })).id;
      const alta = (proveedor: string) =>
        app.inject({ method: "POST", url: "/api/obligaciones", payload: { sociedadId, categoriaId, proveedor, identificador: "7001", diaEsperadoPago: 20 } });
      const r = await alta("  jasec   Internet ");
      expect(r.statusCode).toBe(201);
      expect(r.json().datos.proveedor).toBe("JASEC");
      expect((await alta("JASEC Internet")).statusCode).toBe(409);
      expect((await alta("JASEC")).statusCode).toBe(409);
      expect(await prisma.obligacion.count({ where: { identificador: "7001" } })).toBe(1);
    } finally {
      await app.close();
    }
  });
});
