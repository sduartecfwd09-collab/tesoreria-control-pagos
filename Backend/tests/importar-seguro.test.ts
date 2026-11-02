import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import {
  importarCarpeta, MOTIVO_CARPETA_SIN_SOCIEDAD, MOTIVO_NOMBRE_NO_COINCIDE,
} from "../src/ingest/importar-carpeta.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Todo inventado: carpetas, cuentas y archivos son sintéticos.
const IBAN_A = "CR91010710102200000001";
const IBAN_B = "CR92010710102200000002";
const IBAN_C = "CR95010710102200000005";

let raiz: string;
const poner = (rel: string, contenido: Buffer | string) => {
  const p = path.join(raiz, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, contenido);
};

beforeAll(async () => {
  await vaciarImportaciones();
  await sembrarSociedad("ZFL", "Sociedad inventada ZFL");
  await sembrarSociedad("WW", "Sociedad inventada WW");
  await sembrarSociedad("DM", "Sociedad inventada DM"); // se podría sembrar sin abreviatura; ver prueba aparte
  raiz = mkdtempSync(path.join(tmpdir(), "estados-seguros-"));
});
afterAll(async () => {
  rmSync(raiz, { recursive: true, force: true });
  await vaciarImportaciones();
});

describe("importador seguro", () => {
  it("caso normal: carpeta con sociedad conocida y nombre coherente se importa", async () => {
    poner(`ZFL/${IBAN_A} 0826 ZFL.xlsx`, await M.e1());
    const r = await importarCarpeta(raiz);
    expect(r).toMatchObject({ leidos: 1, conError: 0, enRevision: 0 });
    const a = await prisma.archivoImportado.findFirstOrThrow();
    expect(a).toMatchObject({ estado: "leido", motivo: null });
    expect(a.numMovimientos).toBeGreaterThan(0);
  });

  it("carpeta desconocida: no crea sociedad ni movimientos y el archivo queda en revisión", async () => {
    const antes = await prisma.sociedad.count();
    const movsAntes = await prisma.movimiento.count();
    poner(`XYZ/${IBAN_B} 0826 XYZ.xlsx`, await M.e1({ iban: IBAN_B }));
    const r = await importarCarpeta(raiz);
    expect(r.enRevision).toBe(1);
    expect(await prisma.sociedad.count()).toBe(antes);
    expect(await prisma.sociedad.findFirst({ where: { codigo: "XYZ" } })).toBeNull();
    expect(await prisma.movimiento.count()).toBe(movsAntes);
    expect(await prisma.cuenta.count({ where: { numero: IBAN_B } })).toBe(0);
    const a = await prisma.archivoImportado.findUniqueOrThrow({ where: { ruta: `XYZ/${IBAN_B} 0826 XYZ.xlsx` } });
    expect(a).toMatchObject({ estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD, sociedadId: null, numMovimientos: 0 });
  });

  it("carpeta desconocida: ni siquiera se abre el archivo (un archivo ilegible queda en revisión, no con error)", async () => {
    poner(`QQQ/${IBAN_C} 0826 QQQ.xlsx`, "no soy un excel");
    const r = await importarCarpeta(raiz);
    const a = r.archivos.find((x) => x.ruta.startsWith("QQQ/"))!;
    expect(a.estado).toBe("en_revision");
    expect(r.conError).toBe(0);
  });

  it("sociedad del nombre distinta de la carpeta: en revisión, sin movimientos", async () => {
    poner(`WW/${IBAN_C} 0826 ZFL.xlsx`, await M.e1({ iban: IBAN_C }));
    const r = await importarCarpeta(raiz);
    expect(r.enRevision).toBe(3);
    const a = await prisma.archivoImportado.findUniqueOrThrow({ where: { ruta: `WW/${IBAN_C} 0826 ZFL.xlsx` } });
    expect(a).toMatchObject({ estado: "en_revision", motivo: MOTIVO_NOMBRE_NO_COINCIDE, numMovimientos: 0 });
    expect(a.sociedadId).not.toBeNull(); // la de la carpeta
    expect(await prisma.cuenta.count({ where: { numero: IBAN_C } })).toBe(0);
    expect(await prisma.movimiento.count({ where: { archivoId: a.id } })).toBe(0);
  });

  it("archivo ilegible en carpeta conocida: queda con error y no crea nada", async () => {
    poner(`ZFL/CR96010710102100000006 0826 ZFL.xlsx`, "no soy un excel");
    const antes = await prisma.sociedad.count();
    const r = await importarCarpeta(raiz);
    expect(r.conError).toBe(1);
    expect(await prisma.sociedad.count()).toBe(antes);
    const a = await prisma.archivoImportado.findUniqueOrThrow({ where: { ruta: "ZFL/CR96010710102100000006 0826 ZFL.xlsx" } });
    expect(a.estado).toBe("error");
  });

  it("repetir la corrida no duplica: lo leído queda sin cambios y lo dudoso sigue en revisión", async () => {
    const r = await importarCarpeta(raiz);
    expect(r).toMatchObject({ sinCambios: 1, leidos: 0, enRevision: 3 });
    expect(await prisma.archivoImportado.count({ where: { estado: "en_revision" } })).toBe(3);
  });

  it("al asignar la abreviatura a la sociedad, la carpeta pendiente se importa en la corrida siguiente", async () => {
    await sembrarSociedad("XYZ", "Sociedad inventada XYZ");
    const r = await importarCarpeta(raiz);
    expect(r.leidos).toBe(1);
    expect(r.enRevision).toBe(2);
    expect(await prisma.archivoImportado.findUniqueOrThrow({ where: { ruta: `XYZ/${IBAN_B} 0826 XYZ.xlsx` } })).toMatchObject({ estado: "leido", motivo: null });
  });

  it("una sociedad sin abreviatura (como DM en la lista maestra) nunca recibe una carpeta", async () => {
    await prisma.sociedad.create({ data: { nombreLargo: "Sociedad inventada sin abreviatura" } });
    poner(`SINABREV/CR94010710102200000009 0826 SINABREV.xlsx`, await M.e1({ iban: "CR94010710102200000009" }));
    const r = await importarCarpeta(raiz);
    expect(r.archivos.find((a) => a.ruta.startsWith("SINABREV/"))!.estado).toBe("en_revision");
  });
});
