import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { enmascararIdentificador } from "../src/domain/enmascarar.js";
import { limitesDeDias } from "../src/domain/historial.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Pantalla «Historial de cambios»: alcance, filtros, orden, paginación y que nada sensible salga. Datos inventados.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });
const IDENTIFICADOR = "00112233445566";
const CUENTA = "CR05015202001026284066";

let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let carla: number; // tesorera sin sociedad
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let obligacionA: number;
let obligacionB: number;

const dia = (iso: string) => new Date(iso);
async function linea(d: { sociedadId: number; obligacionId: number; usuarioId: number; nombre: string; creadoEn: string; campo?: string; accion?: string; antes?: string | null; despues?: string | null; motivo?: string | null; modoPruebas?: boolean }) {
  return prisma.historialCambio.create({
    data: {
      entidad: "obligacion", entidadId: d.obligacionId, obligacionId: d.obligacionId, sociedadId: d.sociedadId, accion: d.accion ?? "editar", campo: d.campo ?? "frecuencia",
      antes: d.antes === undefined ? "mensual" : d.antes, despues: d.despues === undefined ? "anual" : d.despues, motivo: d.motivo ?? null,
      usuarioId: d.usuarioId, nombreUsuario: d.nombre, creadoEn: dia(d.creadoEn), modoPruebas: d.modoPruebas ?? false,
    },
  });
}

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  const persona = async (correo: string, nombre: string, rol: string) =>
    (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  carla = await persona("carla@x.cr", "Carla Tres", "Tesorero");
  jefa = await persona("jefa@x.cr", "Jefa Cuatro", "Jefatura");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  obligacionA = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "ProvA", identificador: IDENTIFICADOR, diaEsperadoPago: 10 } })).id;
  obligacionB = (await prisma.obligacion.create({ data: { sociedadId: sociedadB, categoriaId, proveedor: "ProvB", identificador: "7771083", diaEsperadoPago: 10 } })).id;
});
afterAll(async () => {
  await prisma.parametro.updateMany({ where: { clave: "historial_por_pagina" }, data: { valor: "50" } });
  await vaciarImportaciones();
  await vaciarUsuarios();
});

const pedir = async (actor: number | null, qs = "", modoPruebas = true) => {
  const app = await crearApp({ reloj, modoPruebas });
  try {
    const r = await app.inject({ method: "GET", url: `/api/historial-cambios${qs}`, headers: actor === null ? {} : encabezado(actor) });
    return { estado: r.statusCode, cuerpo: r.json() };
  } finally {
    await app.close();
  }
};
const idsDe = (c: { datos: { id: number }[] }) => c.datos.map((x) => x.id);

describe("alcance", () => {
  it("sin persona identificada, 401 (con o sin modo de pruebas)", async () => {
    expect((await pedir(null)).estado).toBe(401);
    expect((await pedir(ana, "", false)).estado).toBe(401);
  });

  it("Jefatura ve todo; cada tesorero solo las líneas de su sociedad, y las opciones de los filtros respetan lo mismo", async () => {
    const a1 = await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: "2026-10-20T15:00:00Z", campo: "frecuencia" });
    const b1 = await linea({ sociedadId: sociedadB, obligacionId: obligacionB, usuarioId: beto, nombre: "Beto Dos", creadoEn: "2026-10-21T15:00:00Z", campo: "mesArranque", antes: null, despues: "3" });
    const b2 = await linea({ sociedadId: sociedadB, obligacionId: obligacionB, usuarioId: jefa, nombre: "Jefa Cuatro", creadoEn: "2026-10-22T15:00:00Z", campo: "activa", accion: "desactivar" });

    const todo = await pedir(jefa);
    expect(todo.estado).toBe(200);
    expect(idsDe(todo.cuerpo)).toEqual([b2.id, b1.id, a1.id]);
    expect(todo.cuerpo.total).toBe(3);
    expect(todo.cuerpo.alcance).toEqual({ tipo: "todo", nombre: null });
    expect(todo.cuerpo.opciones.sociedades.map((s: { nombre: string }) => s.nombre).sort()).toEqual(["Sociedad AAA", "Sociedad BBB"]);
    expect(todo.cuerpo.opciones.campos.sort()).toEqual(["activa", "frecuencia", "mesArranque"]);

    const deAna = await pedir(ana);
    expect(idsDe(deAna.cuerpo)).toEqual([a1.id]);
    expect(deAna.cuerpo.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    expect(deAna.cuerpo.opciones).toEqual({ sociedades: [{ id: sociedadA, nombre: "Sociedad AAA" }], personas: [{ id: ana, nombre: "Ana Uno" }], campos: ["frecuencia"] });

    const deBeto = await pedir(beto);
    expect(idsDe(deBeto.cuerpo)).toEqual([b2.id, b1.id]); // incluye lo hecho por Jefatura
    expect(deBeto.cuerpo.opciones.personas.map((p: { nombre: string }) => p.nombre).sort()).toEqual(["Beto Dos", "Jefa Cuatro"]);

    expect((await pedir(carla)).cuerpo).toMatchObject({ datos: [], total: 0, opciones: { sociedades: [], personas: [], campos: [] } });
    // pedir a mano una sociedad ajena no devuelve nada
    expect((await pedir(ana, `?sociedadId=${sociedadB}`)).cuerpo.total).toBe(0);
  });

  it("quien asume una sociedad ve las líneas anteriores a su asignación; quien la deja, ya no", async () => {
    const antes = await linea({ sociedadId: sociedadB, obligacionId: obligacionB, usuarioId: beto, nombre: "Beto Dos", creadoEn: "2026-09-01T15:00:00Z" });
    expect((await pedir(carla)).cuerpo.total).toBe(0);
    await prisma.sociedad.update({ where: { id: sociedadB }, data: { tesoreroId: carla } });
    expect(idsDe((await pedir(carla)).cuerpo)).toEqual([antes.id]);
    expect((await pedir(beto)).cuerpo.total).toBe(0);
  });
});

describe("filtros, orden y paginación", () => {
  it("filtra por período (días de Costa Rica), sociedad, quién y qué cambió", async () => {
    // 05:59 UTC es todavía el 26 en Costa Rica; 06:00 UTC ya es el 27
    const antesDelDia = await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: "2026-10-27T05:59:00Z" });
    const inicioDelDia = await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: "2026-10-27T06:00:00Z", campo: "mesArranque", antes: null, despues: "3" });
    const finDelDia = await linea({ sociedadId: sociedadB, obligacionId: obligacionB, usuarioId: beto, nombre: "Beto Dos", creadoEn: "2026-10-28T05:59:59Z" });
    const despues = await linea({ sociedadId: sociedadB, obligacionId: obligacionB, usuarioId: jefa, nombre: "Jefa Cuatro", creadoEn: "2026-10-28T06:00:00Z", campo: "activa", accion: "activar" });

    expect(idsDe((await pedir(jefa, "?desde=2026-10-27&hasta=2026-10-27")).cuerpo)).toEqual([finDelDia.id, inicioDelDia.id]);
    expect(idsDe((await pedir(jefa, "?desde=2026-10-28")).cuerpo)).toEqual([despues.id]);
    expect(idsDe((await pedir(jefa, "?hasta=2026-10-26")).cuerpo)).toEqual([antesDelDia.id]);
    expect(idsDe((await pedir(jefa, `?sociedadId=${sociedadB}`)).cuerpo)).toEqual([despues.id, finDelDia.id]);
    expect(idsDe((await pedir(jefa, `?usuarioId=${ana}`)).cuerpo)).toEqual([inicioDelDia.id, antesDelDia.id]);
    expect(idsDe((await pedir(jefa, "?campo=mesArranque")).cuerpo)).toEqual([inicioDelDia.id]);
    expect(idsDe((await pedir(jefa, `?sociedadId=${sociedadB}&campo=frecuencia&desde=2026-10-27`)).cuerpo)).toEqual([finDelDia.id]);
  });

  it("ordena por fecha descendente y, a igual fecha, por id descendente", async () => {
    const mismo = "2026-10-20T15:00:00Z";
    const x = await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: mismo });
    const y = await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: mismo });
    const nuevo = await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: "2026-10-21T15:00:00Z" });
    expect(idsDe((await pedir(jefa)).cuerpo)).toEqual([nuevo.id, y.id, x.id]);
  });

  it("pagina en el servidor con el total correcto; el tamaño por defecto es un parámetro con respaldo", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push((await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Uno", creadoEn: `2026-10-${10 + i}T15:00:00Z` })).id);
    const nuevo = [...ids].reverse();
    const p1 = (await pedir(jefa, "?porPagina=2&pagina=1")).cuerpo;
    expect(p1).toMatchObject({ total: 5, pagina: 1, porPagina: 2, paginas: 3 });
    expect(idsDe(p1)).toEqual(nuevo.slice(0, 2));
    expect(idsDe((await pedir(jefa, "?porPagina=2&pagina=3")).cuerpo)).toEqual(nuevo.slice(4));
    expect((await pedir(jefa, "?porPagina=2&pagina=4")).cuerpo).toMatchObject({ datos: [], total: 5 });

    const porParametro = async (valor: string) => {
      await prisma.parametro.updateMany({ where: { clave: "historial_por_pagina" }, data: { valor } });
      return (await pedir(jefa)).cuerpo;
    };
    expect(await porParametro("2")).toMatchObject({ porPagina: 2, paginas: 3, total: 5 });
    expect((await porParametro("abc")).porPagina).toBe(50); // respaldo del código
    expect((await porParametro("50")).porPagina).toBe(50);
  });

  it("valida los filtros con mensajes claros (400)", async () => {
    for (const qs of ["?desde=2026-02-30", "?desde=2026-10-28&hasta=2026-10-27", "?sociedadId=abc", "?usuarioId=0", "?pagina=0", "?porPagina=500"]) {
      const r = await pedir(jefa, qs);
      expect(r.estado, qs).toBe(400);
      expect(r.cuerpo.error).toEqual(expect.any(String));
    }
  });

  it("«Quién» es el nombre guardado en la línea, no el nombre actual; y trae la marca de prueba", async () => {
    await linea({ sociedadId: sociedadA, obligacionId: obligacionA, usuarioId: ana, nombre: "Ana Antes", creadoEn: "2026-10-20T15:00:00Z", modoPruebas: true });
    await prisma.usuario.update({ where: { id: ana }, data: { nombre: "Ana Nueva", nombreNormalizado: "ana nueva" } });
    const f = (await pedir(jefa)).cuerpo.datos[0];
    expect(f).toMatchObject({ nombreUsuario: "Ana Antes", modoPruebas: true, sociedad: "Sociedad AAA", obligacion: { proveedor: "ProvA" } });
  });
});

describe("nada sensible en la respuesta", () => {
  it("ni montos, ni cuentas, ni identificadores completos, ni números largos del motivo", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    try {
      const cuenta = await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: CUENTA } });
      const cambio = await app.inject({ method: "PATCH", url: `/api/obligaciones/${obligacionA}`, headers: encabezado(ana), payload: { montoEsperado: 987654321, moneda: "USD", cuentaEsperadaId: cuenta.id, frecuencia: "anual", mesArranque: 3 } });
      expect(cambio.statusCode).toBe(200);
      const baja = await app.inject({ method: "PATCH", url: `/api/obligaciones/${obligacionA}`, headers: encabezado(ana), payload: { activa: false, motivo: `Cuenta ${CUENTA.slice(2)} cerrada` } });
      expect(baja.statusCode).toBe(200);
      const r = await app.inject({ method: "GET", url: "/api/historial-cambios", headers: encabezado(ana) });
      expect(r.statusCode).toBe(200);
      const texto = r.body;
      for (const prohibido of [IDENTIFICADOR, IDENTIFICADOR.slice(0, 10), CUENTA, CUENTA.slice(2), "987654321", "USD"]) expect(texto, prohibido).not.toContain(prohibido);
      const datos = r.json().datos as { obligacion: { identificador: string }; campo: string; antes: string | null; despues: string | null; motivo: string | null }[];
      expect(datos.every((d) => d.obligacion.identificador === "****5566")).toBe(true);
      for (const campo of ["montoEsperado", "moneda", "cuentaEsperadaId"]) expect(datos.find((d) => d.campo === campo)).toMatchObject({ antes: null, despues: null });
      expect(datos.find((d) => d.campo === "activa")!.motivo).toBe("Cuenta ****4066 cerrada");
    } finally {
      await app.close();
    }
  });
});

describe("funciones puras", () => {
  it("enmascararIdentificador nunca devuelve el identificador completo", () => {
    expect(enmascararIdentificador("0001083")).toBe("****1083");
    expect(enmascararIdentificador(IDENTIFICADOR)).toBe("****5566");
    expect(enmascararIdentificador("1083")).toBe("****");
    expect(enmascararIdentificador("")).toBe("****");
  });

  it("limitesDeDias traduce días de Costa Rica (UTC-6) a límites en UTC, con el último día incluido", () => {
    expect(limitesDeDias()).toEqual({});
    const l = limitesDeDias("2026-10-27", "2026-10-28");
    expect(l.desde!.toISOString()).toBe("2026-10-27T06:00:00.000Z");
    expect(l.hastaExclusivo!.toISOString()).toBe("2026-10-29T06:00:00.000Z");
  });
});
