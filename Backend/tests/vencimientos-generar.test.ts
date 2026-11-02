import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { sincronizarVencimientos } from "../src/vencimientos/generar.js";
import { generarRango, vaciarImportaciones } from "./helpers/db.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const reloj = (y: number, m: number, d: number) => () => new Date(y, m - 1, d, 10, 0); // hora local fija
let ids: Record<"mensual" | "trimestral" | "sinDia" | "anualSinMes" | "inactiva", number>;

async function fechas(obligacionId: number) {
  const v = await prisma.vencimiento.findMany({ where: { obligacionId }, orderBy: { periodo: "asc" } });
  return v.map((x) => `${x.periodo}:${iso(x.fecha)}`);
}
const desde = (periodo: string) => new Date(`${periodo}-01T00:00:00Z`);

beforeEach(async () => {
  await vaciarImportaciones();
  const s = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } });
  const c = await prisma.categoria.findFirstOrThrow();
  const crear = async (proveedor: string, data: object) =>
    (await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: c.id, proveedor, identificador: proveedor, controlDesde: desde("2026-08"), ...data } })).id;
  ids = {
    mensual: await crear("Mensual", { diaEsperadoPago: 15, montoEsperado: 1000 }),
    trimestral: await crear("Trimestral", { frecuencia: "trimestral", mesArranque: 8, diaEsperadoPago: 31 }),
    sinDia: await crear("SinDia", { diaEsperadoPago: null }),
    anualSinMes: await crear("AnualSinMes", { frecuencia: "anual", diaEsperadoPago: 10 }),
    inactiva: await crear("Inactiva", { diaEsperadoPago: 10, activa: false }),
  };
});
afterAll(vaciarImportaciones);

describe("calendario automático (todo el mes en curso, sin meses futuros)", () => {
  it("crea desde «Control desde» hasta el fin del mes en curso, en estado proyectado, y omite las que no se pueden planificar", async () => {
    const r = await sincronizarVencimientos(reloj(2026, 9, 10)); // todo septiembre, aunque falten más de 3 días
    expect(r).toMatchObject({ creados: 3, eliminados: 0 }); // mensual de agosto y de septiembre, y trimestral de agosto
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-09:2026-09-15"]);
    expect(await fechas(ids.trimestral)).toEqual(["2026-08:2026-08-31"]);
    expect(await fechas(ids.sinDia)).toEqual([]);
    expect(await fechas(ids.anualSinMes)).toEqual([]);
    expect(await fechas(ids.inactiva)).toEqual([]);
    const v = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.mensual } });
    expect(v).toMatchObject({ estado: "proyectado", montoEsperado: 1000n });
  });

  it("si el margen de aviso cruza de un mes a otro, el día 29 ya se genera el vencimiento del 1 del mes siguiente; antes no", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 1 } });
    await sincronizarVencimientos(reloj(2026, 8, 28)); // hasta el 31: el 1 de septiembre queda fuera
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-01"]);
    await sincronizarVencimientos(reloj(2026, 8, 29)); // hasta el 1 de septiembre
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-01", "2026-09:2026-09-01"]);
  });

  it("es idempotente y solo agrega lo nuevo cuando pasan los días", async () => {
    await sincronizarVencimientos(reloj(2026, 9, 14));
    expect(await sincronizarVencimientos(reloj(2026, 9, 14))).toEqual({ creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 });
    const antes = await prisma.vencimiento.count();
    expect(await sincronizarVencimientos(reloj(2026, 10, 14))).toMatchObject({ creados: 1 }); // mensual de octubre
    expect(await prisma.vencimiento.count()).toBe(antes + 1);
  });

  it("sin «Control desde» se controla desde el mes de hoy", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { controlDesde: null } });
    await sincronizarVencimientos(reloj(2026, 9, 14));
    expect(await fechas(ids.mensual)).toEqual(["2026-09:2026-09-15"]);
  });

  it("usa el último día del mes en meses cortos y febrero", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 31, controlDesde: desde("2027-01") } });
    await generarRango("2027-01", "2027-04");
    expect(await fechas(ids.mensual)).toEqual(["2027-01:2027-01-31", "2027-02:2027-02-28", "2027-03:2027-03-31", "2027-04:2027-04-30"]);
  });
});

describe("mantenimiento de los vencimientos futuros (reloj inyectado)", () => {
  it("al cambiar el día ajusta solo los vencimientos de hoy en adelante", async () => {
    await generarRango("2026-08", "2026-10");
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 20, montoEsperado: 2000 } });
    const r = await sincronizarVencimientos(reloj(2026, 9, 10), ids.mensual);
    expect(r).toEqual({ creados: 0, actualizados: 2, eliminados: 0, protegidos: 0 });
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-09:2026-09-20", "2026-10:2026-10-20"]);
    const ago = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.mensual, periodo: "2026-08" } });
    expect(ago.montoEsperado).toBe(1000n); // el pasado conserva su monto
  });

  it("un vencimiento futuro se mueve aunque el nuevo día ya haya pasado en el mes", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { controlDesde: desde("2026-09") } });
    await generarRango("2026-09", "2026-10");
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 5 } });
    await sincronizarVencimientos(reloj(2026, 9, 10), ids.mensual);
    expect(await fechas(ids.mensual)).toEqual(["2026-09:2026-09-05", "2026-10:2026-10-05"]);
  });

  it("al cambiar la frecuencia elimina los futuros que sobran", async () => {
    await generarRango("2026-08", "2026-12");
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { frecuencia: "bimestral", mesArranque: 9 } });
    const r = await sincronizarVencimientos(reloj(2026, 9, 1), ids.mensual);
    expect(r).toMatchObject({ eliminados: 2, creados: 0 }); // quedan sep y nov; se van oct y dic; ago es pasado
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-09:2026-09-15", "2026-11:2026-11-15"]);
  });

  it("nunca toca un vencimiento ya pagado (con su pago asociado)", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { controlDesde: desde("2026-09") } });
    await generarRango("2026-09", "2026-10");
    const oct = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.mensual, periodo: "2026-10" } });
    const cuenta = await prisma.cuenta.create({ data: { sociedadId: (await prisma.sociedad.findFirstOrThrow()).id, numero: "CR00" } });
    const archivo = await prisma.archivoImportado.create({ data: { ruta: "x.xlsx", hash: "h" } });
    const mov = await prisma.movimiento.create({
      data: { cuentaId: cuenta.id, archivoId: archivo.id, hoja: "H", fila: 1, periodo: "2026-10", fecha: new Date(), debito: 1, credito: 0, claveDedup: "k" },
    });
    await prisma.vencimiento.update({ where: { id: oct.id }, data: { estado: "pagado", movimientoId: mov.id } });

    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { diaEsperadoPago: 25, activa: false } });
    const r = await sincronizarVencimientos(reloj(2026, 9, 1), ids.mensual);
    expect(r).toEqual({ creados: 0, actualizados: 0, eliminados: 1, protegidos: 1 }); // sep se elimina (desactivada); oct se protege por estar pagado
    expect(await fechas(ids.mensual)).toEqual(["2026-10:2026-10-15"]);
  });

  it("al desactivar conserva los pasados, los pagados y los futuros pagados; borra solo los futuros sin pagar", async () => {
    await generarRango("2026-08", "2026-12");
    await prisma.vencimiento.updateMany({ where: { obligacionId: ids.mensual, periodo: "2026-10" }, data: { estado: "pagado" } });
    await prisma.vencimiento.updateMany({ where: { obligacionId: ids.mensual, periodo: "2026-11" }, data: { estado: "pagado_con_inconsistencia" } });
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { activa: false } });
    const r = await sincronizarVencimientos(reloj(2026, 9, 1), ids.mensual);
    expect(r).toEqual({ creados: 0, actualizados: 0, eliminados: 2, protegidos: 2 }); // se van sep y dic; quedan oct y nov (pagados)
    expect(await fechas(ids.mensual)).toEqual(["2026-08:2026-08-15", "2026-10:2026-10-15", "2026-11:2026-11-15"]);
  });

  it("una obligación sin vencimientos y sin nada que generar todavía no crea nada", async () => {
    await prisma.obligacion.update({ where: { id: ids.mensual }, data: { controlDesde: desde("2027-01") } });
    expect(await sincronizarVencimientos(reloj(2026, 9, 1), ids.mensual)).toEqual({ creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 });
  });
});
