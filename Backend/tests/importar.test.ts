import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { actualizarCuentaManual, sembrarSociedad } from "../src/repositories/importaciones.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

let raiz: string;
const poner = (rel: string, contenido: Buffer | string) => {
  const p = path.join(raiz, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, contenido);
};

const IBAN_BCT = "CR91010710102200000001";
const IBAN_BNCR = "CR97015107510000000007";
const IBAN_DM = "CR98012300130000000008";
const sept = (movs: M.Mov[]) => movs.map((m) => ({ ...m, m: 9 }));

beforeAll(async () => {
  await vaciarImportaciones();
  // El importador solo asigna a sociedades que ya existen (nunca las crea).
  for (const codigo of ["ZFL", "WW", "DM"]) await sembrarSociedad(codigo, `Sociedad inventada ${codigo}`);
  raiz = mkdtempSync(path.join(tmpdir(), "estados-sinteticos-"));
  poner(`ZFL/${IBAN_BCT} 0826 ZFL.xlsx`, await M.e1()); // sin moneda en el archivo
  poner(`ZFL/${IBAN_BCT} 0926 ZFL.xlsx`, await M.e1({ moneda: "USD", mes: 9, apertura: 699, movs: M.MOVS_BASE.slice(2) })); // solapa 2 movimientos de agosto
  poner(`ZFL/${IBAN_BNCR} 0926 ZFL.xlsx`, await M.e7());
  poner(`DM/${IBAN_DM} 0826 DM.xlsx`, await M.e3dm());
  poner("ZFL/CR96010710102100000006 0826 ZFL.xlsx", "no soy un excel"); // corrupto
  poner("ZFL/estado de cuenta sin convencion.xlsx", await M.e1()); // nombre fuera de convención
  poner("resultados/Fase1 0826 ZFL.xlsx", await M.e1()); // carpeta excluida
  poner("TABLA RAIZ 0826 ZFL.xlsx", await M.e1()); // archivo en la raíz: no se toca
});
afterAll(async () => {
  rmSync(raiz, { recursive: true, force: true });
  await vaciarImportaciones();
});

describe("importarCarpeta", () => {
  it("importa lo válido, marca los errores y continúa con el resto", async () => {
    const r = await importarCarpeta(raiz);
    expect(r.leidos).toBe(4);
    expect(r.conError).toBe(2);
    expect(r.sinCambios).toBe(0);
    const porRuta = new Map(r.archivos.map((a) => [a.ruta, a]));
    expect(porRuta.get("ZFL/CR96010710102100000006 0826 ZFL.xlsx")).toMatchObject({ estado: "error", error: expect.stringMatching(/No se pudo abrir/) });
    expect(porRuta.get("ZFL/estado de cuenta sin convencion.xlsx")).toMatchObject({ estado: "error", error: expect.stringMatching(/convención/) });
    expect([...porRuta.keys()].some((k) => k.startsWith("resultados/") || k.startsWith("TABLA"))).toBe(false);
    const archivos = await prisma.archivoImportado.findMany();
    expect(archivos).toHaveLength(6);
    expect(archivos.filter((a) => a.estado === "error").every((a) => a.error)).toBe(true);
  });

  it("omite movimientos que ya están en otro archivo de la misma cuenta, sin tocar los repetidos del mismo archivo", async () => {
    const duplicados = (await prisma.archivoImportado.findUnique({ where: { ruta: `ZFL/${IBAN_BCT} 0926 ZFL.xlsx` } }))!;
    expect(duplicados).toMatchObject({ numMovimientos: 2, numDuplicados: 2, estado: "leido" });
    const cuenta = (await prisma.cuenta.findFirst({ where: { numero: IBAN_BCT } }))!;
    expect(await prisma.movimiento.count({ where: { cuentaId: cuenta.id } })).toBe(4); // 4 de agosto; los 2 de septiembre eran repetidos
  });

  it("conserva las filas idénticas dentro de un mismo archivo", async () => {
    const iguales = [
      { y: 2026, m: 8, d: 5, ref: "Z", desc: "Cargo cero", deb: 0, cre: 0 },
      { y: 2026, m: 8, d: 5, ref: "Z", desc: "Cargo cero", deb: 0, cre: 0 },
      { y: 2026, m: 8, d: 5, ref: "Z", desc: "Cargo cero", deb: 0, cre: 0 },
    ];
    poner("WW/CR95010710102200000005 0826 WW.xlsx", await M.e1({ iban: "CR95010710102200000005", movs: iguales }));
    const r = await importarCarpeta(raiz);
    expect(r.archivos.find((a) => a.ruta.startsWith("WW/"))).toMatchObject({ estado: "leido", movimientos: 3, duplicados: 0 });
    const cuenta = (await prisma.cuenta.findFirst({ where: { numero: "CR95010710102200000005" } }))!;
    expect(await prisma.movimiento.count({ where: { cuentaId: cuenta.id } })).toBe(3);
  });

  it("no vuelve a leer un archivo sin cambios (hash) y reintenta los que dieron error", async () => {
    const r = await importarCarpeta(raiz);
    expect(r.sinCambios).toBe(5);
    expect(r.leidos).toBe(0);
    expect(r.conError).toBe(2);
  });

  it("guarda sociedad, cuenta, formato, periodo, moneda y trazabilidad del movimiento", async () => {
    const m = await prisma.movimiento.findFirst({ where: { cuenta: { numero: IBAN_BNCR } }, include: { cuenta: { include: { sociedad: true } }, archivo: true }, orderBy: { fila: "asc" } });
    expect(m).toMatchObject({ periodo: "2026-09", hoja: "Estado de Cuenta", fila: 13, debito: 15050n, credito: 0n });
    expect(m!.cuenta.sociedad.codigo).toBe("ZFL");
    expect(m!.archivo).toMatchObject({ formato: "E7", mes: "2026-09" });
  });

  it("moneda: archivo > IBAN BCT > por confirmar; se marca el origen", async () => {
    const agosto = JSON.parse((await prisma.archivoImportado.findUnique({ where: { ruta: `ZFL/${IBAN_BCT} 0826 ZFL.xlsx` } }))!.detalle!);
    expect(agosto).toMatchObject({ monedaOrigen: "iban", moneda: "USD" });
    const septiembre = JSON.parse((await prisma.archivoImportado.findUnique({ where: { ruta: `ZFL/${IBAN_BCT} 0926 ZFL.xlsx` } }))!.detalle!);
    expect(septiembre.monedaOrigen).toBe("archivo");
    const sinPista = await prisma.cuenta.findFirst({ where: { numero: IBAN_BNCR } });
    expect(sinPista).toMatchObject({ moneda: null, monedaPorConfirmar: true }); // E7 sin moneda y sin otro mes
  });

  it("reimporta de forma controlada cuando cambia el hash y no pisa el banco editado a mano", async () => {
    const cuenta = (await prisma.cuenta.findFirst({ where: { numero: IBAN_BCT } }))!;
    expect(cuenta).toMatchObject({ banco: "BCT", bancoPorConfirmar: true });
    await actualizarCuentaManual(cuenta.id, { banco: "Banco confirmado por Tesorería" });
    poner(`ZFL/${IBAN_BCT} 0826 ZFL.xlsx`, await M.e1({ movs: M.MOVS_BASE.slice(0, 3) }));
    const r = await importarCarpeta(raiz);
    expect(r.leidos).toBe(1);
    const cambiada = (await prisma.archivoImportado.findUnique({ where: { ruta: `ZFL/${IBAN_BCT} 0826 ZFL.xlsx` } }))!;
    expect(cambiada.numMovimientos).toBe(3);
    expect(await prisma.movimiento.count({ where: { archivoId: cambiada.id } })).toBe(3);
    expect(await prisma.cuenta.findUnique({ where: { id: cuenta.id } })).toMatchObject({ banco: "Banco confirmado por Tesorería", bancoPorConfirmar: false });
  });

  it("no reimporta un archivo cambiado si ya tiene conciliaciones", async () => {
    const mov = (await prisma.movimiento.findFirst({ where: { archivo: { ruta: `ZFL/${IBAN_BCT} 0826 ZFL.xlsx` } } }))!;
    const sociedad = (await prisma.sociedad.findFirst({ where: { codigo: "ZFL" } }))!;
    const categoria = await prisma.categoria.upsert({ where: { nombreNormalizado: "prueba" }, create: { nombre: "Prueba", nombreNormalizado: "prueba" }, update: {} });
    const ob = await prisma.obligacion.create({ data: { sociedadId: sociedad.id, categoriaId: categoria.id, proveedor: "P", identificador: "001", diaEsperadoPago: 15 } });
    const ven = await prisma.vencimiento.create({ data: { obligacionId: ob.id, fecha: new Date(Date.UTC(2026, 7, 15)), periodo: "2026-08" } });
    await prisma.conciliacion.create({ data: { vencimientoId: ven.id, movimientoId: mov.id, tipoCruce: "automatico", estado: "claro" } });

    poner(`ZFL/${IBAN_BCT} 0826 ZFL.xlsx`, await M.e1({ movs: M.MOVS_BASE.slice(0, 2) }));
    const r = await importarCarpeta(raiz);
    expect(r.archivos.find((a) => a.ruta.includes(`${IBAN_BCT} 0826`))).toMatchObject({ estado: "error", error: expect.stringMatching(/conciliaciones/) });
    // los movimientos anteriores siguen intactos
    expect(await prisma.movimiento.count({ where: { archivo: { ruta: `ZFL/${IBAN_BCT} 0826 ZFL.xlsx` } } })).toBe(3);
  });

  it("DM queda como sociedad con sus movimientos (el catálogo vacío no impide importar)", async () => {
    const dm = await prisma.sociedad.findFirst({ where: { codigo: "DM" } });
    expect(dm).not.toBeNull();
    expect(await prisma.movimiento.count({ where: { cuenta: { sociedadId: dm!.id } } })).toBe(4);
  });

  it("septiembre sin datos de una cuenta no es error: simplemente falta en la cobertura", async () => {
    expect(await prisma.archivoImportado.count({ where: { ruta: { contains: `${IBAN_DM} 0926` } } })).toBe(0);
  });
});
