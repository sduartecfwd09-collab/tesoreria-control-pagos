import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importarCatalogo } from "../src/catalogo/importar.js";
import { MOTIVO_ESTADO_DESCONOCIDO, MOTIVO_SOCIEDAD_SIN_COINCIDENCIA } from "../src/repositories/obligaciones.js";
import { prisma } from "../src/db.js";
import { CABECERA_CATALOGO, catalogo, FILAS_BASE, sembrarSociedadesDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones } from "./helpers/db.js";

let dir: string;
const archivo = () => path.join(dir, "catalogo.xlsx");
const escribir = async (filas = FILAS_BASE) => writeFileSync(archivo(), await catalogo(filas));
const buscar = (identificador: string, proveedor?: string) =>
  prisma.obligacion.findFirstOrThrow({ where: { identificador, ...(proveedor ? { proveedor } : {}) } });

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "catalogo-")); });
beforeEach(async () => { await vaciarImportaciones(); await sembrarSociedadesDelCatalogo(); await escribir(); });
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await vaciarImportaciones(); });

describe("importarCatalogo: ESTADO", () => {
  it("sin la columna todas quedan activas; con ella «ACTIVA» es activa, «INACTIVA» se carga inactiva y cualquier otro valor (o vacío) va a revisión", async () => {
    await importarCatalogo(archivo());
    expect(await prisma.obligacion.count({ where: { activa: true } })).toBe(6);

    await vaciarImportaciones();
    await sembrarSociedadesDelCatalogo();
    writeFileSync(archivo(), await catalogo(
      [["AAA", "Telecom", "Fono", "1", "05 DIA", "ACTIVA"], ["AAA", "Telecom", "Fono", "2", "05 DIA", "Inactiva"], ["AAA", "Telecom", "Fono", "3", "05 DIA", ""], ["AAA", "Telecom", "Fono", "4", "05 DIA", "SUSPENDIDA"]],
      { cabecera: [...CABECERA_CATALOGO, "ESTADO"] },
    ));
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ creadas: 2, enRevision: 2 });
    expect(await prisma.obligacion.count({ where: { activa: true } })).toBe(1);
    expect((await prisma.obligacion.findFirstOrThrow({ where: { identificador: "2" } })).activa).toBe(false); // se carga inactiva
    expect(await prisma.obligacion.count()).toBe(2);
    const rev = await prisma.catalogoRevision.findMany({ orderBy: { fila: "asc" } });
    expect(rev.map((x) => [x.tipo, x.motivo])).toEqual([["estado_desconocido", MOTIVO_ESTADO_DESCONOCIDO], ["estado_desconocido", MOTIVO_ESTADO_DESCONOCIDO]]);
  });

  it("no hay forma de borrar una obligación desde la API (solo desactivarla)", async () => {
    const { crearApp } = await import("../src/app.js");
    const app = await crearApp();
    try {
      expect((await app.inject({ method: "DELETE", url: "/api/obligaciones/1" })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("importarCatalogo: identificador duplicado", () => {
  it("carga las filas igual y las deja marcadas en la lista de revisión (sin ceros a la izquierda y entre sociedades)", async () => {
    await escribir([
      ["AAA", "Telecom", "Fono Uno", "0077", "01 DIA"],
      ["BBB", "Telecom", "Fono Dos", "77", "02 DIA"], // mismo servicio sin ceros, otra sociedad
      ["AAA", "Telecom", "Fono Tres", "88", "03 DIA"], // único
    ]);
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ creadas: 3, enRevision: 0, identificadoresDuplicados: 2 });
    expect(await prisma.obligacion.count()).toBe(3);
    const rev = await prisma.catalogoRevision.findMany({ orderBy: { fila: "asc" } });
    expect(rev.map((x) => [x.tipo, x.fila])).toEqual([["identificador_duplicado", 4], ["identificador_duplicado", 5]]);
    expect(rev.every((x) => x.obligacionId !== null)).toBe(true);
    expect((await prisma.obligacion.findFirstOrThrow({ where: { proveedor: "Fono Uno" } })).identificador).toBe("0077"); // texto: conserva los ceros
  });

  it("no registra el identificador en el resumen ni en los motivos", async () => {
    const r = await importarCatalogo(archivo());
    expect(JSON.stringify(r)).not.toContain("77777777");
    expect(r.identificadoresDuplicados).toBe(2); // el par del catálogo base
  });

  it("la misma fila con ceros distintos no se carga dos veces (misma sociedad y proveedor)", async () => {
    await escribir([["AAA", "Telecom", "Fono", "0077", "01 DIA"], ["AAA", "Telecom", "Fono", "77", "01 DIA"]]);
    const r = await importarCatalogo(archivo());
    expect(r.creadas).toBe(1);
    expect(r.problemas).toEqual([{ fila: 5, motivo: expect.stringContaining("Repite la fila 4"), importada: false }]);
  });
});

describe("importarCatalogo", () => {
  it("nunca crea sociedades: la fila sin coincidencia va a revisión con motivo y las demás se cargan", async () => {
    await escribir([...FILAS_BASE, ["ZZZ", "Telecom", "Fono Tres", "555", "05 DIA"]]);
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ creadas: 6, enRevision: 1 });
    expect(await prisma.sociedad.count({ where: { codigo: "ZZZ" } })).toBe(0);
    expect(await prisma.sociedad.count()).toBe(2);
    const rev = await prisma.catalogoRevision.findMany({ where: { tipo: "sociedad_sin_coincidencia" } });
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ tipo: "sociedad_sin_coincidencia", fila: 10, motivo: MOTIVO_SOCIEDAD_SIN_COINCIDENCIA, obligacionId: null });
    expect(await prisma.obligacion.count({ where: { identificador: "555" } })).toBe(0);
  });

  it("reconoce la sociedad por nombre oficial o alias y la lista de revisión se reemplaza en cada importación", async () => {
    await prisma.sociedad.create({ data: { nombreLargo: "Sociedad Sin Abreviatura, S.A." } });
    await escribir([["sociedad sin abreviatura, s.a.", "Telecom", "Fono", "1", "05 DIA"], ["QQQ", "Telecom", "Fono", "2", "05 DIA"]]);
    expect(await importarCatalogo(archivo())).toMatchObject({ creadas: 1, enRevision: 1 });
    await escribir([["AAA", "Telecom", "Fono", "3", "05 DIA"]]);
    expect(await importarCatalogo(archivo())).toMatchObject({ creadas: 1, enRevision: 0 });
    expect(await prisma.catalogoRevision.count()).toBe(0);
  });

  it("crea categorías y obligaciones, y resume por sociedad, categoría y proveedor", async () => {
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ filasLeidas: 6, creadas: 6, actualizadas: 0, sinCambios: 0, noEnArchivo: 0, problemas: [] });
    expect(r.porSociedad).toEqual({ AAA: 4, BBB: 2 });
    expect(r.porCategoria).toEqual({ Electricidad: 3, Telecom: 2, CCSS: 1 });
    expect(r.proveedores.map((p) => p.nombre)).toEqual(["CCSS", "Fono Dos", "Fono Uno", "Luz Dos", "Luz Uno"]);
    const o = await buscar("00012345");
    expect(o).toMatchObject({ diaEsperadoPago: 15, frecuencia: "mensual", frecuenciaPorConfirmar: true, moneda: "CRC", monedaPorConfirmar: true, activa: true, origen: "catalogo" });
    expect(await prisma.obligacion.count({ where: { identificador: "77777777" } })).toBe(2);
  });

  it("reimportar no duplica ni pisa lo que Tesorería editó a mano", async () => {
    await importarCatalogo(archivo());
    const o = await buscar("00012345");
    const cuenta = await prisma.cuenta.create({ data: { sociedadId: o.sociedadId, numero: "CR00000000000000000099" } });
    const editado = {
      frecuencia: "trimestral", frecuenciaPorConfirmar: false, mesArranque: 2, montoEsperado: 1_234_500, moneda: "USD",
      monedaPorConfirmar: false, cuentaEsperadaId: cuenta.id, responsable: "Persona de prueba", activa: false,
      diaEsperadoPago: 28, diaEditado: true,
    };
    await prisma.obligacion.update({ where: { id: o.id }, data: editado });

    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ creadas: 0, actualizadas: 0, sinCambios: 6 });
    expect(await prisma.obligacion.count()).toBe(6);
    expect(await buscar("00012345")).toMatchObject({ ...editado, montoEsperado: BigInt(editado.montoEsperado) });
  });

  it("actualiza el día si cambió en el archivo y no fue editado; si viene inválido conserva el anterior", async () => {
    await importarCatalogo(archivo());
    const filas = FILAS_BASE.map((f) => [...f]);
    filas[1]![4] = "25 DIA"; // 00012346: de 10 a 25
    filas[2]![4] = "99 DIA"; // 77777777 (Fono Uno): inválido
    await escribir(filas);
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ creadas: 0, actualizadas: 1, sinCambios: 5 });
    expect(r.problemas).toEqual([{ fila: 6, motivo: expect.stringContaining("«99 DIA»"), importada: true }]);
    expect((await buscar("00012346")).diaEsperadoPago).toBe(25);
    expect((await buscar("77777777", "Fono Uno")).diaEsperadoPago).toBe(1);
  });

  it("importa sin día la fila con día inválido en la primera carga", async () => {
    await escribir([["AAA", "Telecom", "Fono", "123", "45 DIA"]]);
    const r = await importarCatalogo(archivo());
    expect(r.creadas).toBe(1);
    expect((await buscar("123")).diaEsperadoPago).toBeNull();
  });

  it("no desactiva ni borra las obligaciones que ya no están en el archivo: las cuenta", async () => {
    await importarCatalogo(archivo());
    await escribir(FILAS_BASE.slice(1));
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ noEnArchivo: 1, sinCambios: 5 });
    expect((await buscar("00012345")).activa).toBe(true);
  });

  it("no toca las obligaciones creadas a mano aunque coincidan con una fila", async () => {
    const s = await prisma.sociedad.findUniqueOrThrow({ where: { codigo: "AAA" } });
    const c = await prisma.categoria.findFirstOrThrow({ where: { nombre: "Electricidad" } });
    await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: c.id, proveedor: "LUZ UNO", identificador: "00012345", diaEsperadoPago: 3, origen: "manual" } });
    const r = await importarCatalogo(archivo());
    expect(r).toMatchObject({ creadas: 5, sinCambios: 1 });
    expect(await buscar("00012345")).toMatchObject({ proveedor: "LUZ UNO", diaEsperadoPago: 3, origen: "manual" });
  });

  it("usa el parámetro frecuencia_defecto para las obligaciones nuevas", async () => {
    const p = await prisma.parametro.findFirstOrThrow({ where: { clave: "frecuencia_defecto" } });
    await prisma.parametro.update({ where: { id: p.id }, data: { valor: "bimestral" } });
    try {
      await importarCatalogo(archivo());
      expect((await buscar("00012345")).frecuencia).toBe("bimestral");
    } finally {
      await prisma.parametro.update({ where: { id: p.id }, data: { valor: p.valor } });
    }
  });
});
