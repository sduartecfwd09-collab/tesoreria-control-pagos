import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { inicioDeDatos } from "../src/domain/cobertura-corte.js";
import { MOTIVOS } from "../src/domain/cruce.js";
import { prisma } from "../src/db.js";
import { cargarCoberturaCuentas } from "../src/repositories/cruce.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Días de espera, aviso por tesorero, frecuencia y regla «desde», con datos inventados. Rango -3/+12; espera 3.
let hoy = new Date(2026, 9, 27, 10, 0);
const reloj = () => hoy;
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let sociedadId: number;
let cuentaId: number;
let archivoOct: number;
let categoriaId: number;
let n = 0;

const debito = (fecha: Date, descripcion: string) =>
  prisma.movimiento.create({
    data: { cuentaId, archivoId: archivoOct, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito: 5000n, credito: 0n, claveDedup: `e${n}`.padEnd(40, "0") },
  });
const obligacion = (proveedor: string, identificador: string, diaPago: number, extra: object = {}) =>
  prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: diaPago, controlDesde: dia(2026, 10, 1), ...extra } });
const vencimientoDe = (obligacionId: number, periodo = "2026-10") => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId, periodo } });
const fijar = (clave: string, valor: string) => prisma.parametro.updateMany({ where: { clave }, data: { valor } });

beforeEach(async () => {
  hoy = new Date(2026, 9, 27, 10, 0);
  await vaciarImportaciones();
  await vaciarUsuarios();
  await fijarRango(3, 12);
  await fijar("dias_espera_vencido", "3");
  await fijar("aviso_dias", "3");
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001234" } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido", numMovimientos: 1 } });
    if (mes === "2026-10") archivoOct = a.id;
  }
  await debito(dia(2026, 9, 1), "COMISION INICIAL");
  await debito(dia(2026, 10, 26), "COMISION"); // datos hasta el 26 de octubre
});
afterAll(async () => {
  await fijarRango(10, 12);
  await fijar("dias_espera_vencido", "3");
  await fijar("aviso_dias", "3");
  await vaciarUsuarios();
  await vaciarImportaciones();
});

describe("Vencido con días de espera (F = 10 de octubre, espera 3, después 12)", () => {
  const detalle = async (id: number) => {
    const app = await crearApp({ reloj });
    try {
      return (await app.inject(`/api/vencimientos/${id}`)).json().datos as { textoEstado: string; textos: { resumen: string; parrafos: string[] } };
    } finally {
      await app.close();
    }
  };

  it("F+2 sin pago: Por vencer, «El día de pago pasó hace 2 días; se espera el pago.»", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    hoy = new Date(2026, 9, 12, 10, 0);
    await actualizarVencimientos(reloj);
    const v = await vencimientoDe(o.id);
    expect(v).toMatchObject({ estado: "por_vencer", motivo: MOTIVOS.esperaPago });
    const d = await detalle(v.id);
    expect(d.textoEstado).toBe("El día de pago pasó hace 2 días; se espera el pago.");
    expect(d.textos.resumen).toBe("El día de pago pasó hace 2 días; se espera el pago.");
  });

  it("F+3 todavía es espera; F+4 sin pago: Vencido con «se sigue buscando hasta el 22 oct 2026»", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    hoy = new Date(2026, 9, 13, 10, 0);
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("por_vencer");
    hoy = new Date(2026, 9, 14, 10, 0);
    await actualizarVencimientos(reloj);
    const v = await vencimientoDe(o.id);
    expect(v).toMatchObject({ estado: "vencido", motivo: MOTIVOS.vencidoBuscando });
    const d = await detalle(v.id);
    expect(d.textoEstado).toBe("El pago no aparece todavía; se sigue buscando hasta el 22 oct 2026.");
    expect(d.textos.resumen).toBe("El pago no aparece todavía; se sigue buscando hasta el 22 oct 2026.");
  });

  it("pago en F+8: Pagado, «Se pagó 8 días después del día habitual de pago.»", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    await debito(dia(2026, 10, 18), "PAGO LUZ 7771234");
    hoy = new Date(2026, 9, 20, 10, 0);
    await actualizarVencimientos(reloj);
    const v = await vencimientoDe(o.id);
    expect(v).toMatchObject({ estado: "pagado", diferenciaDias: 8 });
    expect((await detalle(v.id)).textos.parrafos).toContain("Se pagó 8 días después del día habitual de pago.");
  });

  it("pasado F+12 sin pago: Vencido definitivo, «No se encontró pago hasta el 22 oct 2026.»", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    hoy = new Date(2026, 9, 25, 10, 0);
    await actualizarVencimientos(reloj);
    const v = await vencimientoDe(o.id);
    expect(v).toMatchObject({ estado: "vencido", motivo: MOTIVOS.vencido });
    expect((await detalle(v.id)).textoEstado).toBe("No se encontró pago hasta el 22 oct 2026.");
  });

  it("sin días de espera: el día siguiente al pago ya es Vencido (si hay cobertura)", async () => {
    await fijar("dias_espera_vencido", "0");
    const o = await obligacion("Luz Uno", "7771234", 10);
    hoy = new Date(2026, 9, 11, 10, 0);
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("vencido");
  });

  it("Por revisar prevalece sobre la cobertura y sobre la espera", async () => {
    const a = await obligacion("Cabletica", "5551083", 10);
    await obligacion("Movistar", "5551083", 10);
    await debito(dia(2026, 10, 10), "PAGO SERVICIO 5551083"); // sin nombre de proveedor: no se sabe a cuál corresponde
    hoy = new Date(2026, 9, 12, 10, 0);
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(a.id)).estado).toBe("por_revisar");
  });
});

describe("aviso propio de cada tesorero", () => {
  it("dos tesoreros con avisos de 3 y 7 días ven distinto Por vencer y Programado; el calendario llega al mayor aviso", async () => {
    await asegurarRoles();
    const rolId = (await mapaDeRoles()).get("Usuario")!;
    await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId, diasAviso: 3 } });
    await prisma.usuario.create({ data: { correo: "beto@x.cr", nombre: "Beto Dos", nombreNormalizado: "beto dos", rolId, diasAviso: 7 } });
    const deAna = await obligacion("Luz Ana", "1110001", 1, { responsable: "Ana Uno" });
    const deBeto = await obligacion("Luz Beto", "2220002", 1, { responsable: "Beto Dos" });
    const general = await obligacion("Luz Sin Dueño", "3330003", 1);
    await actualizarVencimientos(reloj); // hoy 27 de octubre; fecha de pago 1 de noviembre (en 5 días)
    expect((await vencimientoDe(deAna.id, "2026-11")).estado).toBe("proyectado"); // 5 > 3
    expect((await vencimientoDe(deBeto.id, "2026-11")).estado).toBe("por_vencer"); // 5 <= 7
    expect((await vencimientoDe(general.id, "2026-11")).estado).toBe("proyectado"); // sin aviso propio: el general (3)
  });

  it("la API guarda el aviso propio, lo vacía para usar el general y rechaza valores fuera de 0 a 60", async () => {
    await asegurarRoles();
    const rolId = (await mapaDeRoles()).get("Usuario")!;
    const u = await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId } });
    const app = await crearApp({ reloj });
    try {
      const lista = (await app.inject("/api/avisos-tesoreros")).json() as { general: number; datos: { id: number; diasAviso: number | null; diasEfectivos: number }[] };
      expect(lista.datos.find((x) => x.id === u.id)).toMatchObject({ diasAviso: null, diasEfectivos: lista.general });
      const ok = await app.inject({ method: "PUT", url: `/api/avisos-tesoreros/${u.id}`, payload: { diasAviso: 7 } });
      expect(ok.json().datos).toMatchObject({ diasAviso: 7, diasEfectivos: 7 });
      expect((await app.inject({ method: "PUT", url: `/api/avisos-tesoreros/${u.id}`, payload: { diasAviso: 61 } })).statusCode).toBe(422);
      expect((await app.inject({ method: "PUT", url: `/api/avisos-tesoreros/${u.id}`, payload: { diasAviso: null } })).json().datos).toMatchObject({ diasAviso: null });
      expect((await app.inject({ method: "PUT", url: "/api/avisos-tesoreros/99999", payload: { diasAviso: 3 } })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("frecuencia por obligación", () => {
  it("una obligación bimestral con arranque en septiembre no genera vencimiento en octubre", async () => {
    const o = await obligacion("Agua Bi", "4440004", 5, { frecuencia: "bimestral", mesArranque: 9, controlDesde: dia(2026, 9, 1) });
    await actualizarVencimientos(reloj);
    expect(await prisma.vencimiento.count({ where: { obligacionId: o.id, periodo: "2026-09" } })).toBe(1);
    expect(await prisma.vencimiento.count({ where: { obligacionId: o.id, periodo: "2026-10" } })).toBe(0);
  });

  it("la frecuencia se edita con mes de arranque obligatorio, queda confirmada y el calendario informa sus conteos; también en masa", async () => {
    const o = await obligacion("Agua Bi", "4440004", 28);
    const p = await obligacion("Agua Dos", "5550005", 8);
    await actualizarVencimientos(reloj);
    expect(await prisma.vencimiento.count({ where: { obligacionId: o.id } })).toBeGreaterThan(0);
    const app = await crearApp({ reloj });
    try {
      const sinMes = await app.inject({ method: "PATCH", url: `/api/obligaciones/${o.id}`, payload: { frecuencia: "bimestral" } });
      expect(sinMes.statusCode).toBe(422);
      expect(sinMes.json().error).toContain("mes de arranque");
      const ok = await app.inject({ method: "PATCH", url: `/api/obligaciones/${o.id}`, payload: { frecuencia: "bimestral", mesArranque: 9 } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().datos).toMatchObject({ frecuencia: "bimestral", mesArranque: 9, frecuenciaPorConfirmar: false });
      expect(ok.json().regeneracion).toHaveProperty("eliminados");
      expect(await prisma.vencimiento.count({ where: { obligacionId: o.id, periodo: "2026-10" } })).toBe(0);

      const masivoSinMes = await app.inject({ method: "POST", url: "/api/obligaciones/frecuencia", payload: { ids: [p.id], frecuencia: "trimestral" } });
      expect(masivoSinMes.statusCode).toBe(422);
      const masivo = await app.inject({ method: "POST", url: "/api/obligaciones/frecuencia", payload: { ids: [p.id], frecuencia: "trimestral", mesArranque: 7 } });
      expect(masivo.json().datos).toMatchObject({ actualizadas: 1 });
      expect(masivo.json().datos.calendario).toHaveProperty("creados");
      expect(await prisma.obligacion.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ frecuencia: "trimestral", mesArranque: 7, frecuenciaPorConfirmar: false });
    } finally {
      await app.close();
    }
  });
});

describe("regla «desde»: la cobertura empieza en el Del que declara el primer archivo", () => {
  const declarar = (mes: string, del: string | null) =>
    prisma.archivoImportado.updateMany({ where: { mes, cuentaId }, data: { detalle: JSON.stringify({ continuidad: { estado: "cuadra" }, periodoDeclarado: del ? { del, al: null } : null }) } });

  it("con Del declarado el 10 de septiembre, un rango que empieza antes queda Sin información; sin declararlo cuenta desde el día 1", async () => {
    const o = await obligacion("Luz Uno", "7771234", 12, { controlDesde: dia(2026, 9, 1) }); // 12 de septiembre: el rango empieza el 9 (antes -3)
    await declarar("2026-09", "2026-09-10");
    await actualizarVencimientos(reloj);
    expect(await vencimientoDe(o.id, "2026-09")).toMatchObject({ estado: "sin_informacion", motivo: MOTIVOS.sinInformacionDesde });
    await declarar("2026-09", null);
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id, "2026-09")).estado).toBe("vencido");
  });

  it("la sociedad empieza en la mayor de sus cuentas y un archivo que no cuadra no aporta cobertura", async () => {
    await declarar("2026-09", "2026-09-05");
    const segunda = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000009000" } })).id;
    await prisma.archivoImportado.create({ data: { ruta: "AAA/segunda-sep.xlsx", hash: "s2", sociedadId, cuentaId: segunda, mes: "2026-09", estado: "leido", detalle: JSON.stringify({ continuidad: { estado: "cuadra" }, periodoDeclarado: { del: "2026-09-15", al: null } }) } });
    const inicio = async () => inicioDeDatos((await cargarCoberturaCuentas()).get(sociedadId) ?? [])?.toISOString().slice(0, 10);
    expect(await inicio()).toBe("2026-09-15");
    await prisma.archivoImportado.updateMany({ where: { cuentaId: segunda }, data: { detalle: JSON.stringify({ continuidad: { estado: "no_cuadra" }, periodoDeclarado: { del: "2026-09-15", al: null } }) } });
    expect(await inicio()).toBe("2026-09-05"); // la segunda cuenta ya no aporta inicio
  });
});
