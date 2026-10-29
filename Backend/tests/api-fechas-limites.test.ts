import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Límites del selector de fechas, con datos inventados. Hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number;
let jefa: number;
let sociedadA: number;
let sociedadB: number;

async function vencimiento(sociedadId: number, identificador: string, fecha: Date) {
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  const o = await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor: "P", identificador, diaEsperadoPago: 10 } });
  await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha, periodo: fecha.toISOString().slice(0, 7), estado: "proyectado", ...copiaDeObligacion(o) } });
}
async function movimiento(sociedadId: number, numero: string, fecha: Date, retirado = false) {
  const cuenta = await prisma.cuenta.create({ data: { sociedadId, numero } });
  const archivo = await prisma.archivoImportado.create({ data: { ruta: `${numero}.xlsx`, hash: numero, sociedadId, cuentaId: cuenta.id, mes: fecha.toISOString().slice(0, 7), estado: "leido", retiradoEn: retirado ? new Date() : null } });
  await prisma.movimiento.create({ data: { cuentaId: cuenta.id, archivoId: archivo.id, hoja: "h", fila: 1, periodo: archivo.mes!, fecha, debito: 100n, credito: 0n, claveDedup: numero.padEnd(40, "0") } });
}

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } })).id;
  await vencimiento(sociedadA, "1", dia(2026, 3, 10));
  await vencimiento(sociedadA, "2", dia(2026, 10, 15));
  await vencimiento(sociedadB, "3", dia(2025, 1, 5));
  await vencimiento(sociedadB, "4", dia(2027, 2, 20));
  await movimiento(sociedadA, "CUENTA-A", dia(2026, 4, 2));
  await movimiento(sociedadB, "CUENTA-B", dia(2025, 6, 9));
  await movimiento(sociedadB, "CUENTA-R", dia(2020, 1, 1), true); // archivo retirado: no cuenta
});
afterAll(async () => {
  await vaciarUsuarios();
  await vaciarImportaciones();
});

describe("GET /api/fechas/limites", () => {
  it("Jefatura ve los límites de todo, con la fecha de hoy del servidor", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const r = (await app.inject({ method: "GET", url: "/api/fechas/limites", headers: encabezado(jefa) })).json();
    expect(r.alcance.tipo).toBe("todo");
    expect(r.hoy).toBe("2026-10-27");
    expect(r.vencimientos).toEqual({ primera: "2025-01-05", ultima: "2027-02-20" });
    expect(r.movimientos).toEqual({ primera: "2025-06-09", ultima: "2026-04-02" });
  });

  it("un Tesorero ve solo los límites de lo suyo", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const r = (await app.inject({ method: "GET", url: "/api/fechas/limites", headers: encabezado(ana) })).json();
    expect(r.alcance.tipo).toBe("mio");
    expect(r.vencimientos).toEqual({ primera: "2026-03-10", ultima: "2026-10-15" });
    expect(r.movimientos).toEqual({ primera: "2026-04-02", ultima: "2026-04-02" });
  });

  it("sin datos devuelve null, no un rango vacío", async () => {
    await vaciarImportaciones();
    const app = await crearApp({ reloj, modoPruebas: true });
    const r = (await app.inject({ method: "GET", url: "/api/fechas/limites", headers: encabezado(jefa) })).json();
    expect(r.vencimientos).toBeNull();
    expect(r.movimientos).toBeNull();
  });
});

describe("ventana del selector", () => {
  it("no depende de los datos: 5 años atrás y 12 meses adelante, y sigue los parámetros", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const r = (await app.inject({ method: "GET", url: "/api/fechas/limites", headers: encabezado(jefa) })).json();
    expect(r.ventana).toEqual({ primera: "2021-10-01", ultima: "2027-10-31" });
    const clave = (c: string) => ({ clave_ambito_categoriaId: { clave: c, ambito: "global", categoriaId: 0 } });
    const poner = (c: string, valor: string) => prisma.parametro.upsert({ where: clave(c), create: { clave: c, valor, tipo: "entero", ambito: "global", categoriaId: 0 }, update: { valor } });
    await poner("selector_anios_atras", "2");
    await poner("selector_meses_adelante", "3");
    try {
      const p = (await app.inject({ method: "GET", url: "/api/fechas/limites", headers: encabezado(ana) })).json();
      expect(p.ventana).toEqual({ primera: "2024-10-01", ultima: "2027-01-31" });
    } finally {
      await poner("selector_anios_atras", "5");
      await poner("selector_meses_adelante", "12");
    }
  });
});
