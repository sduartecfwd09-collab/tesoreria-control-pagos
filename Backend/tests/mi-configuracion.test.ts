import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { leerEnv } from "../src/config/env.js";
import { prisma } from "../src/db.js";
import { rolDesdeTexto } from "../src/domain/usuarios.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Identidad temporal («Actuando como») y «Mi configuración», con datos inventados. Hoy = 27 de octubre de 2026.
let hoy = new Date(2026, 9, 27, 10, 0);
const reloj = () => hoy;
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const fijar = (clave: string, valor: string) => prisma.parametro.updateMany({ where: { clave }, data: { valor } });

let ana: number;
let beto: number;
let jefa: number;
const ENCABEZADO = (id: number) => ({ "x-usuario-actual": String(id) });

beforeEach(async () => {
  hoy = new Date(2026, 9, 27, 10, 0);
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  beto = (await prisma.usuario.create({ data: { correo: "beto@x.cr", nombre: "Beto Dos", nombreNormalizado: "beto dos", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  await fijar("aviso_dias", "3");
  await fijar("dias_espera_vencido", "3");
  await fijarRango(3, 12);
});
afterAll(async () => {
  await fijarRango(10, 12);
  await vaciarUsuarios();
  await vaciarImportaciones();
});

describe("identidad temporal", () => {
  it("el selector solo existe con MODO_PRUEBAS: sin él, la API no lista personas ni acepta el encabezado", async () => {
    const apagado = await crearApp({ reloj, modoPruebas: false });
    try {
      expect((await apagado.inject("/api/identidad")).json()).toEqual({ modoPruebas: false, usuarios: [] });
      const r = await apagado.inject({ method: "GET", url: "/api/mi-configuracion", headers: ENCABEZADO(ana) });
      expect(r.statusCode).toBe(401);
      expect(r.json().error).toBe("No hay una sesión iniciada.");
      expect((await apagado.inject({ method: "PUT", url: "/api/mi-configuracion", headers: ENCABEZADO(ana), payload: { diasAviso: 5, diasEspera: 5 } })).statusCode).toBe(401);
    } finally {
      await apagado.close();
    }
  });

  it("con MODO_PRUEBAS lista a todas las personas activas con su rol (Jefatura primero); sin elegir a nadie pide elegir", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    try {
      const lista = (await app.inject("/api/identidad")).json() as { modoPruebas: boolean; usuarios: { id: number; nombre: string; rol: string }[] };
      expect(lista.modoPruebas).toBe(true);
      expect(lista.usuarios.map((t) => [t.nombre, t.rol])).toEqual([["Jefa Tres", "Jefatura"], ["Ana Uno", "Tesorero"], ["Beto Dos", "Tesorero"]]);
      // Mi configuración es personal y vale para cualquier rol, también Jefatura
      expect((await app.inject({ method: "GET", url: "/api/mi-configuracion", headers: ENCABEZADO(jefa) })).json().datos.usuario.nombre).toBe("Jefa Tres");
      const sinElegir = await app.inject("/api/mi-configuracion");
      expect(sinElegir.statusCode).toBe(401);
      expect(sinElegir.json().error).toBe("Elija con qué tesorero está actuando.");
    } finally {
      await app.close();
    }
  });

  it("el servidor no arranca con MODO_PRUEBAS=true en producción", () => {
    const base = { DATABASE_URL: "mysql://u:p@localhost:3306/x_test" };
    expect(() => leerEnv({ ...base, MODO_PRUEBAS: "true", NODE_ENV: "production" })).toThrow(/MODO_PRUEBAS/);
    expect(leerEnv({ ...base, MODO_PRUEBAS: "true", NODE_ENV: "development" }).MODO_PRUEBAS).toBe(true);
    expect(leerEnv({ ...base, NODE_ENV: "production" }).MODO_PRUEBAS).toBe(false);
    expect(leerEnv({ ...base, MODO_PRUEBAS: "" }).MODO_PRUEBAS).toBe(false);
  });
});

describe("Mi configuración", () => {
  it("muestra los valores propios o el respaldo, y guarda solo los dos campos de quien actúa", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    try {
      const antes = (await app.inject({ method: "GET", url: "/api/mi-configuracion", headers: ENCABEZADO(ana) })).json().datos;
      expect(antes).toMatchObject({ usuario: { nombre: "Ana Uno" }, diasAviso: 3, diasEspera: 3, propios: { diasAviso: null, diasEspera: null } });
      const ok = await app.inject({ method: "PUT", url: "/api/mi-configuracion", headers: ENCABEZADO(ana), payload: { diasAviso: 7, diasEspera: 5 } });
      expect(ok.json().datos).toMatchObject({ diasAviso: 7, diasEspera: 5, propios: { diasAviso: 7, diasEspera: 5 } });
      // Beto no se ve afectado
      expect((await app.inject({ method: "GET", url: "/api/mi-configuracion", headers: ENCABEZADO(beto) })).json().datos).toMatchObject({ diasAviso: 3, diasEspera: 3 });
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: ana } }))).toMatchObject({ diasAviso: 7, diasEspera: 5 });
    } finally {
      await app.close();
    }
  });

  it("valida los rangos: aviso de 0 a 60 y espera de 0 a 15", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    try {
      const poner = (diasAviso: unknown, diasEspera: unknown) => app.inject({ method: "PUT", url: "/api/mi-configuracion", headers: ENCABEZADO(ana), payload: { diasAviso, diasEspera } });
      expect((await poner(61, 3)).statusCode).toBe(422);
      expect((await poner(3, 16)).statusCode).toBe(422);
      expect((await poner(-1, 3)).statusCode).toBe(422);
      expect((await poner(3, 2.5)).statusCode).toBe(422);
      expect((await poner(0, 0)).statusCode).toBe(200);
      expect((await poner(60, 15)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("el parámetro general queda interno: ni el aviso ni la espera aparecen en Configuración", async () => {
    const app = await crearApp({ reloj });
    try {
      const d = (await app.inject("/api/parametros")).json().datos as { clave: string; visible: boolean }[];
      expect(d.filter((p) => p.visible)).toEqual([]);
      expect(d.find((p) => p.clave === "aviso_dias")?.visible).toBe(false);
      expect(d.find((p) => p.clave === "dias_espera_vencido")?.visible).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("la espera propia del tesorero de la sociedad decide cuándo su pago pasa a Vencido", async () => {
    await prisma.usuario.update({ where: { id: ana }, data: { diasEspera: 1 } });
    await prisma.usuario.update({ where: { id: beto }, data: { diasEspera: 8 } });
    const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    // cada tesorero con su sociedad, las dos con estados de cuenta de septiembre y octubre
    const crearSociedad = async (codigo: string, tesoreroId: number, numeroCuenta: string) => {
      const sociedadId = (await prisma.sociedad.create({ data: { codigo, nombreLargo: `Sociedad ${codigo}`, tesoreroId } })).id;
      const cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: numeroCuenta } })).id;
      let archivoId = 0;
      for (const mes of ["2026-09", "2026-10"]) {
        const a = await prisma.archivoImportado.create({ data: { ruta: `${codigo}/${mes}.xlsx`, hash: `${codigo}${mes}`, sociedadId, cuentaId, mes, estado: "leido", numMovimientos: 1 } });
        if (mes === "2026-10") archivoId = a.id;
      }
      let n = 0;
      for (const [fecha, texto] of [[dia(2026, 9, 1), "COMISION INICIAL"], [dia(2026, 10, 26), "COMISION"]] as const) {
        await prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion: texto, debito: 100n, credito: 0n, claveDedup: `${codigo}${n}`.padEnd(40, "0") } });
      }
      return sociedadId;
    };
    const sociedadAna = await crearSociedad("AAA", ana, "CR0000000000000000001234");
    const sociedadBeto = await crearSociedad("BBB", beto, "CR0000000000000000005678");
    const crear = (sociedadId: number, proveedor: string, identificador: string) =>
      prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 10, controlDesde: dia(2026, 10, 1) } });
    const deAna = await crear(sociedadAna, "Luz Ana", "1110001");
    const deBeto = await crear(sociedadBeto, "Luz Beto", "2220002");
    hoy = new Date(2026, 9, 14, 10, 0); // F+4
    await actualizarVencimientos(reloj);
    const estado = async (id: number) => (await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: id, periodo: "2026-10" } })).estado;
    expect(await estado(deAna.id)).toBe("vencido"); // espera 1: ya pasó
    expect(await estado(deBeto.id)).toBe("por_vencer"); // espera 8: se sigue esperando
  });
});

describe("rol Tesorero", () => {
  it("«Usuario» (nombre anterior) y «Tesorero» son el mismo rol; hay dos roles: Tesorero y Jefatura", async () => {
    expect(rolDesdeTexto("Usuario")).toBe("Tesorero");
    expect(rolDesdeTexto(" TESORERO ")).toBe("Tesorero");
    expect((await prisma.rol.findMany()).map((r) => r.nombre).sort()).toEqual(["Jefatura", "Tesorero"]);
  });
});

describe("guardar «Mi configuración» recalcula los estados sin correr el comando", () => {
  it("cambiar el aviso hace que un vencimiento pase de Programado a Por vencer y de vuelta; la respuesta informa cuándo se calculó", async () => {
    await prisma.usuario.update({ where: { id: beto }, data: { diasAviso: 7 } }); // el mayor aviso (7) hace que el calendario ya tenga el vencimiento del 1 de noviembre
    const sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
    const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    const luz = await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor: "Luz Ana", identificador: "7771234", diaEsperadoPago: 1, controlDesde: dia(2026, 10, 1) } });
    await actualizarVencimientos(reloj); // estados iniciales: aviso de Ana = general (3)
    const estado = async () => (await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: luz.id, periodo: "2026-11" } })).estado;
    expect(await estado()).toBe("proyectado"); // faltan 5 días y su aviso es de 3
    const app = await crearApp({ reloj, modoPruebas: true });
    try {
      const poner = (diasAviso: number) => app.inject({ method: "PUT", url: "/api/mi-configuracion", headers: ENCABEZADO(ana), payload: { diasAviso, diasEspera: 3 } });
      const sube = await poner(7);
      expect(sube.statusCode).toBe(200);
      expect(await estado()).toBe("por_vencer"); // sin correr npm run cruzar
      expect(sube.json().datos.estadosCalculadosEn).toBe(reloj().toISOString());
      const lista = (await app.inject({ method: "GET", url: "/api/vencimientos?periodo=2026-11", headers: ENCABEZADO(ana) })).json();
      expect(lista.estadosCalculadosEn).toBe(reloj().toISOString());
      expect((lista.datos as { estado: string }[]).map((v) => v.estado)).toEqual(["por_vencer"]);
      expect((await poner(3)).statusCode).toBe(200);
      expect(await estado()).toBe("proyectado");
      expect((await app.inject({ method: "GET", url: "/api/avisos", headers: ENCABEZADO(ana) })).json().estadosCalculadosEn).toBe(reloj().toISOString());
    } finally {
      await app.close();
    }
  });
});
