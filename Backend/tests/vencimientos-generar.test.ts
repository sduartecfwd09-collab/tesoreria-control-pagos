import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { generarVencimientos, regenerarObligacion } from "../src/vencimientos/generar.js";
import { vaciarImportaciones } from "./helpers/db.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const reloj = (y: number, m: number, d: number) => () => new Date(y, m - 1, d, 10, 0); // hora local fija
let ids: Record<"mensual" | "trimestral" | "sinDia" | "anualSinMes" | "inactiva", number>;

async function fechas(obligacionId: number) {
  const v = await prisma.vencimiento.findMany({ where: { obligacionId }, orderBy: { periodo: "asc" } });
  return v.map((x) => `${x.periodo}:${iso(x.fecha)}`);
}

beforeEach(async () => {
  await vaciarImportaciones();
  const s = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } });
  const c = await prisma.categoria.findFirstOrThrow();
  const crear = async (proveedor: string, data: object) =>
    (await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: c.id, proveedor, identificador: proveedor, ...data } })).id;
  ids = {
    mensual: await crear("Mensual", { diaEsperadoPago: 15, montoEsperado: 1000 }),
    trimestral: await crear("Trimestral", { frecuencia: "trimestral", mesArranque: 8, diaEsperadoPago: 31 }),
    sinDia: await crear("SinDia", { diaEsperadoPago: null }),
    anualSinMes: await crear("AnualSinMes", { frecuencia: "anual", diaEsperadoPago: 10 }),
    inactiva: await crear("Inactiva", { diaEsperadoPago: 10, activa: false }),
  };
});
afterAll(vaciarImportaciones);

describe("generarVencimientos", () => {
  it("crea un vencimiento por obligación activa y periodo, en estado proyectado, y reporta las omitidas", async () => {
    const r = await generarVencimientos("2026-08", "2026-09");
    expect(r).toMatchObject({ creados: 3, yaExistentes: 0 });
    expect(r.porPeriodo).toEqual([{ periodo: "2026-08", creados: 2, yaExistentes: 0 }, { periodo: "2026-09", creados: 1, yaExistentes: 0 }]);
    expect(r.omitidas.map((o) => [o.proveedor, o.motivo])).toEqual([["SinDia", "falta_dia"], ["AnualSinMes", "falta_mes_arranque"]]);
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-09:2026-09-15"]);
    expect(await fechas(ids.trimestral)).toEqual(["2026-08:2026-08-31"]);
    expect(await fechas(ids.inactiva)).toEqual([]);
    const v = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.mensual } });
    expect(v).toMatchObject({ estado: "proyectado", montoEsperado: 1000n });
  });

  it("es idempotente: repetir el rango no duplica y ampliarlo solo agrega lo nuevo", async () => {
    await generarVencimientos("2026-08", "2026-09");
    expect(await generarVencimientos("2026-08", "2026-09")).toMatchObject({ creados: 0, yaExistentes: 3 });
    expect(await generarVencimientos("2026-08", "2026-11")).toMatchObject({ creados: 3, yaExistentes: 3 }); // oct y nov mensual, nov trimestral
    expect(await prisma.vencimiento.count()).toBe(6);
  });

  it("usa el último día del mes en meses cortos y febrero", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 31 } });
    await generarVencimientos("2027-01", "2027-04");
    expect(await fechas(ids.mensual)).toEqual(["2027-01:2027-01-31", "2027-02:2027-02-28", "2027-03:2027-03-31", "2027-04:2027-04-30"]);
  });
});

describe("regenerarObligacion (reloj inyectado)", () => {
  it("al cambiar el día ajusta solo los vencimientos de hoy en adelante", async () => {
    await generarVencimientos("2026-08", "2026-10");
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 20, montoEsperado: 2000 } });
    const r = await regenerarObligacion(ids.mensual, reloj(2026, 9, 10));
    expect(r).toEqual({ creados: 0, actualizados: 2, eliminados: 0, protegidos: 0 });
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-09:2026-09-20", "2026-10:2026-10-20"]);
    const ago = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.mensual, periodo: "2026-08" } });
    expect(ago.montoEsperado).toBe(1000n); // el pasado conserva su monto
  });

  it("un vencimiento futuro se mueve aunque el nuevo día ya haya pasado en el mes", async () => {
    await generarVencimientos("2026-09", "2026-10");
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 5 } });
    await regenerarObligacion(ids.mensual, reloj(2026, 9, 10));
    expect(await fechas(ids.mensual)).toEqual(["2026-09:2026-09-05", "2026-10:2026-10-05"]);
  });

  it("al cambiar la frecuencia elimina los que sobran y crea los que faltan, hasta el horizonte", async () => {
    await generarVencimientos("2026-08", "2026-12");
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { frecuencia: "bimestral", mesArranque: 9 } });
    const r = await regenerarObligacion(ids.mensual, reloj(2026, 9, 1));
    expect(r).toMatchObject({ eliminados: 2, creados: 0 }); // quedan sep y nov; se van oct y dic; ago es pasado
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-09:2026-09-15", "2026-11:2026-11-15"]);

    // el horizonte ahora es nov (dic se eliminó): un anual de noviembre entra, uno de diciembre no
    await prisma.obligacion.update({ where: { id: ids.anualSinMes }, data: { mesArranque: 11 } });
    expect(await regenerarObligacion(ids.anualSinMes, reloj(2026, 9, 1))).toMatchObject({ creados: 1 });
    expect(await fechas(ids.anualSinMes)).toEqual(["2026-11:2026-11-10"]);
  });

  it("nunca toca un vencimiento con conciliación", async () => {
    await generarVencimientos("2026-09", "2026-10");
    const oct = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.mensual, periodo: "2026-10" } });
    const cuenta = await prisma.cuenta.create({ data: { sociedadId: (await prisma.sociedad.findFirstOrThrow()).id, numero: "CR00" } });
    const archivo = await prisma.archivoImportado.create({ data: { ruta: "x.xlsx", hash: "h" } });
    const mov = await prisma.movimiento.create({
      data: { cuentaId: cuenta.id, archivoId: archivo.id, hoja: "H", fila: 1, periodo: "2026-10", fecha: new Date(), debito: 1, credito: 0, claveDedup: "k" },
    });
    await prisma.conciliacion.create({ data: { vencimientoId: oct.id, movimientoId: mov.id, tipoCruce: "manual", estado: "claro" } });

    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 25, activa: false } });
    const r = await regenerarObligacion(ids.mensual, reloj(2026, 9, 1));
    expect(r).toEqual({ creados: 0, actualizados: 0, eliminados: 1, protegidos: 1 }); // sep se elimina (desactivada); oct se protege
    expect(await fechas(ids.mensual)).toEqual(["2026-10:2026-10-15"]);
  });

  it("sin vencimientos generados no crea nada (no hay horizonte)", async () => {
    expect(await regenerarObligacion(ids.mensual, reloj(2026, 9, 1))).toEqual({ creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 });
  });
});
