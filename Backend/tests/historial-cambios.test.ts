import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import * as modulo from "../src/repositories/historial.js";
import { actualizarObligacionesConHistorial } from "../src/repositories/obligaciones.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { lineasDeEdicion } from "../src/domain/historial.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Historial de cambios de las obligaciones: una línea por campo que cambió, sin montos ni cuentas. Datos inventados.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });
const CUENTA = "CR05015202001026284066"; // inventada
const MONTO = 987654321;

let ana: number;
let beto: number;
let sociedadA: number;
let sociedadB: number;
let categoriaId: number;
let obligacionA: number;
let obligacionSinDia: number;
let obligacionB: number;
let cuentaA: number;

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  const persona = async (correo: string, nombre: string, rol: string) =>
    (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  cuentaA = (await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: CUENTA } })).id;
  const crear = async (sociedadId: number, identificador: string, dia: number | null) =>
    (await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor: `P${identificador}`, identificador, diaEsperadoPago: dia } })).id;
  obligacionA = await crear(sociedadA, "1", 10);
  obligacionSinDia = await crear(sociedadA, "2", null);
  obligacionB = await crear(sociedadB, "3", 10);
});
afterAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
});

const lineas = async (obligacionId: number) => prisma.historialCambio.findMany({ where: { obligacionId }, orderBy: { id: "asc" } });
const patch = (app: Awaited<ReturnType<typeof crearApp>>, id: number, actor: number, payload: object) =>
  app.inject({ method: "PATCH", url: `/api/obligaciones/${id}`, headers: encabezado(actor), payload });

describe("registro de ediciones", () => {
  it("anota una línea por campo que cambió, con quién, la sociedad y la marca de modo de pruebas", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    expect((await patch(app, obligacionA, ana, { frecuencia: "bimestral", mesArranque: 3 })).statusCode).toBe(200);
    const l = await lineas(obligacionA);
    expect(l.map((x) => [x.accion, x.campo, x.antes, x.despues]).sort()).toEqual([
      ["editar", "frecuencia", "mensual", "bimestral"],
      ["editar", "frecuenciaPorConfirmar", "sin confirmar", "confirmada"],
      ["editar", "mesArranque", null, "3"],
    ]);
    for (const x of l) {
      expect(x).toMatchObject({ entidad: "obligacion", entidadId: obligacionA, sociedadId: sociedadA, usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true, motivo: null });
    }
  });

  it("no anota un campo cuyo valor no cambió", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    // la frecuencia ya es mensual: solo cambia la marca de confirmada
    expect((await patch(app, obligacionA, ana, { frecuencia: "mensual" })).statusCode).toBe(200);
    expect((await lineas(obligacionA)).map((x) => x.campo)).toEqual(["frecuenciaPorConfirmar"]);
    // repetir lo mismo no deja nada nuevo
    expect((await patch(app, obligacionA, ana, { frecuencia: "mensual", frecuenciaPorConfirmar: false })).statusCode).toBe(200);
    expect(await prisma.historialCambio.count({ where: { obligacionId: obligacionA } })).toBe(1);
  });

  it("el día se anota solo cuando se fija por primera vez; «Control desde» como mes", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    expect((await patch(app, obligacionSinDia, ana, { diaEsperadoPago: 15, controlDesde: "2026-12" })).statusCode).toBe(200);
    expect((await lineas(obligacionSinDia)).map((x) => [x.campo, x.antes, x.despues]).sort()).toEqual([
      ["controlDesde", null, "2026-12"],
      ["diaEsperadoPago", null, "15"],
    ]);
    // una obligación que ya tenía día: indicar el mismo no es un cambio
    expect((await patch(app, obligacionA, ana, { diaEsperadoPago: 10 })).statusCode).toBe(200);
    expect(await lineas(obligacionA)).toHaveLength(0);
  });

  it("de monto, moneda y cuenta solo anota «cambió»: ningún valor guardado contiene montos ni cuentas", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    expect((await patch(app, obligacionA, ana, { montoEsperado: MONTO, moneda: "USD", cuentaEsperadaId: cuentaA })).statusCode).toBe(200);
    const l = await lineas(obligacionA);
    for (const campo of ["montoEsperado", "moneda", "cuentaEsperadaId"]) {
      const x = l.find((y) => y.campo === campo)!;
      expect(x, campo).toMatchObject({ antes: null, despues: null });
    }
    // todo lo guardado es texto corto del sistema: ninguna cifra larga ni el número de cuenta
    const todo = await prisma.historialCambio.findMany();
    const permitido = /^(mensual|bimestral|trimestral|semestral|anual|activa|inactiva|confirmada|sin confirmar|\d{1,2}|\d{4}-\d{2})$/;
    for (const x of todo) {
      for (const v of [x.antes, x.despues]) expect(v === null || permitido.test(v), `${x.campo}`).toBe(true);
      expect(JSON.stringify(x)).not.toContain(String(MONTO));
      expect(JSON.stringify(x)).not.toContain(CUENTA);
      expect(JSON.stringify(x)).not.toContain("USD");
    }
  });

  it("el alta manual deja una sola línea", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const r = await app.inject({ method: "POST", url: "/api/obligaciones", headers: encabezado(ana), payload: { sociedadId: sociedadA, categoriaId, proveedor: "Nueva", identificador: "50", diaEsperadoPago: 5 } });
    expect(r.statusCode).toBe(201);
    const l = await lineas(r.json().datos.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ accion: "crear", campo: "obligacion", antes: null, despues: null, usuarioId: ana, sociedadId: sociedadA, modoPruebas: true });
  });

  it("el cambio masivo anota cada obligación; una acción rechazada (403) no deja nada", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const otra = await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "P9", identificador: "9", diaEsperadoPago: 3 } });
    const masivo = (actor: number, ids: number[]) =>
      app.inject({ method: "POST", url: "/api/obligaciones/frecuencia", headers: encabezado(actor), payload: { ids, frecuencia: "trimestral", mesArranque: 2 } });
    expect((await masivo(beto, [obligacionA, otra.id])).statusCode).toBe(403);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect((await masivo(ana, [obligacionA, otra.id])).statusCode).toBe(200);
    for (const id of [obligacionA, otra.id]) expect((await lineas(id)).map((x) => x.campo).sort()).toEqual(["frecuencia", "frecuenciaPorConfirmar", "mesArranque"]);
    expect(await prisma.historialCambio.count({ where: { obligacionId: obligacionB } })).toBe(0);
  });
});

describe("motivo al desactivar o reactivar", () => {
  it("desactivar y reactivar exigen motivo (422 sin él o fuera de 3 a 300 caracteres) y no guardan nada si falta", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    for (const payload of [{ activa: false }, { activa: false, motivo: "" }, { activa: false, motivo: "ab" }, { activa: false, motivo: "x".repeat(301) }, { activa: false, motivo: 123 }]) {
      const r = await patch(app, obligacionA, ana, payload);
      expect(r.statusCode, JSON.stringify(payload)).toBe(422);
      expect(r.json().campo).toBe("motivo");
    }
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacionA } })).activa).toBe(true);
    expect(await prisma.historialCambio.count()).toBe(0);
  });

  it("con motivo válido guarda, y el motivo (normalizado) queda en la línea de «activa»", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    expect((await patch(app, obligacionA, ana, { activa: false, motivo: "  Ya no   se paga  " })).statusCode).toBe(200);
    expect((await patch(app, obligacionA, ana, { activa: true, motivo: "Se retomó el servicio" })).statusCode).toBe(200);
    const l = await lineas(obligacionA);
    expect(l.map((x) => [x.accion, x.campo, x.antes, x.despues, x.motivo])).toEqual([
      ["desactivar", "activa", "activa", "inactiva", "Ya no se paga"],
      ["activar", "activa", "inactiva", "activa", "Se retomó el servicio"],
    ]);
  });

  it("no pide motivo si «activa» no cambia, y el motivo solo acompaña a «activa» cuando hay otros cambios", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    expect((await patch(app, obligacionA, ana, { activa: true, frecuenciaPorConfirmar: false })).statusCode).toBe(200); // ya estaba activa
    expect((await patch(app, obligacionA, ana, { activa: false, frecuencia: "anual", mesArranque: 6, motivo: "Cierre del servicio" })).statusCode).toBe(200);
    const l = await lineas(obligacionA);
    expect(l.find((x) => x.campo === "activa")!.motivo).toBe("Cierre del servicio");
    expect(l.filter((x) => x.campo !== "activa").every((x) => x.motivo === null)).toBe(true);
  });
});

describe("el registro y la edición van juntos", () => {
  it("si el registro falla, la edición no se guarda", async () => {
    const antes = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacionA } });
    // una persona que no existe hace fallar el insert del historial (clave foránea) dentro de la misma transacción
    await expect(
      actualizarObligacionesConHistorial([{ id: obligacionA, data: { frecuencia: "anual", mesArranque: 1 } }], { id: 999_999, nombre: "Nadie", modoPruebas: true }),
    ).rejects.toThrow();
    const despues = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacionA } });
    expect(despues.frecuencia).toBe(antes.frecuencia);
    expect(despues.mesArranque).toBe(antes.mesArranque);
    expect(await prisma.historialCambio.count()).toBe(0);
  });

  it("el repositorio del historial solo inserta: no ofrece editar ni borrar", () => {
    expect(Object.keys(modulo).sort()).toEqual(["insertarHistorial"]);
  });
});

describe("lineasDeEdicion (lógica pura)", () => {
  const base = { frecuencia: "mensual", frecuenciaPorConfirmar: true, mesArranque: null, diaEsperadoPago: 5, activa: true, controlDesde: null, montoEsperado: null, moneda: "CRC", cuentaEsperadaId: null };
  it("sin cambios no devuelve nada; un monto que pasa de nulo a un valor solo dice «cambió»", () => {
    expect(lineasDeEdicion(base, { ...base })).toEqual([]);
    expect(lineasDeEdicion(base, { ...base, montoEsperado: 12345n })).toEqual([{ accion: "editar", campo: "montoEsperado", antes: null, despues: null }]);
  });
  it("activar y desactivar llevan su propia acción", () => {
    expect(lineasDeEdicion(base, { ...base, activa: false })).toEqual([{ accion: "desactivar", campo: "activa", antes: "activa", despues: "inactiva" }]);
    expect(lineasDeEdicion({ ...base, activa: false }, base)).toEqual([{ accion: "activar", campo: "activa", antes: "inactiva", despues: "activa" }]);
  });
});
