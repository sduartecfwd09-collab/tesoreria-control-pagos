import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { diaDelPeriodo, planificar, proximoPago, type ObligacionPlan } from "../src/domain/vencimientos.js";
import { lineaDeCambiarDia, lineaDeMoverFecha, lineaDeQuitarMovimiento, rangoDeMover, topeDeMover, validarDesdeMes, validarNuevaFecha } from "../src/domain/mover-fecha.js";
import { ErrorDeServicio } from "../src/domain/permisos.js";
import { sincronizarCatalogo } from "../src/repositories/obligaciones.js";
import { vencimientoParaAsociar } from "../src/repositories/vencimientos.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { sincronizarVencimientos } from "../src/vencimientos/generar.js";
import { moverFecha } from "../src/vencimientos/mover-fecha.js";
import { generarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// «Mover fecha» (solo este mes) y cambio permanente del día de pago: permisos, estados, rangos, efecto en el calendario, historial y reversión.
// Datos inventados. Hoy = 2026-09-10. Calendario generado de agosto a noviembre (día 15).
const reloj = () => new Date(2026, 8, 10, 10, 0);
const enc = (id: number) => ({ "x-usuario-actual": String(id) });
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const IBAN = "CR05015202001026284066";

let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let jefa: number;
let sociedadA: number;
let categoriaId: number;
let categoriaNombre: string;
let obligacion: number;

const pedir = (url: string, actor: number | null, payload?: object, metodo: "GET" | "POST" = "POST") =>
  app.inject({ method: metodo, url, headers: actor === null ? {} : enc(actor), ...(payload ? { payload } : {}) });
const venc = (periodo: string, o = obligacion) => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: o, periodo } });
const OMITIR = Symbol("sin motivo"); // el cuerpo va sin la clave (un `undefined` activaría el valor por defecto del parámetro)
const mover = async (periodo: string, nuevaFecha: unknown, motivo: unknown = "Prórroga del proveedor", actor: number | null = ana) =>
  pedir(`/api/vencimientos/${(await venc(periodo)).id}/mover-fecha`, actor, { nuevaFecha, ...(motivo === OMITIR ? {} : { motivo }) });
const quitarMov = async (periodo: string, motivo: unknown = "Se vuelve al día de siempre", actor: number | null = ana) =>
  pedir(`/api/vencimientos/${(await venc(periodo)).id}/quitar-movimiento`, actor, motivo === OMITIR ? {} : { motivo });
const cambiar = (cuerpo: object, actor: number | null = ana, id = obligacion) => pedir(`/api/obligaciones/${id}/cambiar-dia`, actor, cuerpo);
const fechas = async () => Promise.all(["2026-08", "2026-09", "2026-10", "2026-11"].map(async (p) => iso((await venc(p)).fecha)));

beforeAll(async () => {
  app = await crearApp({ reloj, modoPruebas: true });
});
afterAll(async () => {
  await app.close();
  await vaciarImportaciones();
  await vaciarUsuarios();
});
beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  const persona = async (correo: string, nombre: string, rol: string) =>
    (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  jefa = await persona("jefa@x.cr", "Jefa Tres", "Jefatura");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } });
  const cat = await prisma.categoria.findFirstOrThrow();
  categoriaId = cat.id;
  categoriaNombre = cat.nombre;
  obligacion = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "Fono", identificador: "0001", diaEsperadoPago: 15 } })).id;
  await generarRango("2026-08", "2026-11");
});

describe("dominio: día que rige en cada periodo", () => {
  const base: ObligacionPlan = { id: 1, sociedadId: 1, categoriaId: 1, proveedor: "P", cuentaEsperadaId: null, moneda: "CRC", activa: true, frecuencia: "mensual", mesArranque: null, diaEsperadoPago: 15, montoEsperado: null };

  it("sin cambios programados el resultado es idéntico al de siempre", () => {
    const periodos = ["2026-09", "2026-10", "2026-11"];
    expect(planificar([{ ...base, cambiosDia: [] }], periodos)).toEqual(planificar([base], periodos));
    expect(diaDelPeriodo(base, "2026-10")).toBe(15);
    const hoy = new Date("2026-09-10T00:00:00Z");
    expect(proximoPago({ ...base, controlDesde: null, cambiosDia: [] }, hoy)).toEqual(proximoPago({ ...base, controlDesde: null }, hoy));
  });

  it("el último cambio cuyo «desde» no pasa del periodo manda; a igual mes, el más reciente; antes del primer «desde» rige el día base", () => {
    const cambiosDia = [{ desde: "2026-10", dia: 20 }, { desde: "2026-12", dia: 5 }, { desde: "2026-12", dia: 7 }];
    expect(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"].map((p) => diaDelPeriodo({ ...base, cambiosDia }, p))).toEqual([15, 20, 20, 7, 7]);
    const r = planificar([{ ...base, cambiosDia }], ["2026-09", "2026-10", "2026-12"]).vencimientos;
    expect(r.map((v) => [iso(v.fecha), v.dia])).toEqual([["2026-09-15", 15], ["2026-10-20", 20], ["2026-12-07", 7]]);
  });

  it("el próximo pago usa el día del periodo; el tope de días y el rango se calculan con el parámetro o el respaldo", () => {
    expect(iso(proximoPago({ ...base, controlDesde: null, cambiosDia: [{ desde: "2026-10", dia: 20 }] }, new Date("2026-09-20T00:00:00Z")))).toBe("2026-10-20");
    expect([topeDeMover(null), topeDeMover(""), topeDeMover("abc"), topeDeMover("0"), topeDeMover("30"), topeDeMover("999")]).toEqual([60, 60, 60, 60, 30, 60]);
    expect(rangoDeMover(new Date("2026-09-15T00:00:00Z"), 60)).toEqual({ desde: "2026-07-17", hasta: "2026-11-14" });
  });

  it("validaciones puras: fecha real, distinta de la vigente y dentro del rango de la ORIGINAL; mes no anterior al actual", () => {
    const vigente = new Date("2026-09-20T00:00:00Z");
    const original = new Date("2026-09-15T00:00:00Z");
    for (const t of [undefined, "", "2026-02-30", "20/09/2026"]) expect(validarNuevaFecha(t, vigente, original, 60).ok, String(t)).toBe(false);
    expect(validarNuevaFecha("2026-09-20", vigente, original, 60).ok).toBe(false); // la misma que ya tiene
    expect(validarNuevaFecha("2026-11-14", vigente, original, 60).ok).toBe(true); // justo 60 días de la original
    expect(validarNuevaFecha("2026-11-15", vigente, original, 60).ok).toBe(false);
    expect(validarNuevaFecha("2026-07-17", vigente, original, 60).ok).toBe(true);
    expect(validarNuevaFecha("2026-07-16", vigente, original, 60).ok).toBe(false);
    expect(validarDesdeMes("2026-08", "2026-09").ok).toBe(false);
    expect(validarDesdeMes("2026-09", "2026-09").ok).toBe(true);
    expect(validarDesdeMes("2026-13", "2026-09").ok).toBe(false);
    expect(validarDesdeMes(undefined, "2026-09").ok).toBe(false);
  });

  it("las líneas del historial llevan las dos fechas (o el día y «desde»)", () => {
    expect(lineaDeMoverFecha("2026-09-15", "2026-09-25")).toEqual({ accion: "mover_fecha", campo: "fecha_vencimiento", antes: "2026-09-15", despues: "2026-09-25" });
    expect(lineaDeQuitarMovimiento("2026-09-25", "2026-09-15")).toEqual({ accion: "quitar_movimiento", campo: "fecha_vencimiento", antes: "2026-09-25", despues: "2026-09-15" });
    expect(lineaDeCambiarDia(15, 20, "2026-11")).toEqual({ accion: "cambiar_dia", campo: "diaEsperadoPago", antes: "15", despues: "20 desde 2026-11" });
  });
});

describe("mover fecha: permisos y validación", () => {
  it("sin persona 401; un tesorero ajeno 403; el propio y Jefatura sí; 404 y 400; sin modo de pruebas no hay persona", async () => {
    const id = (await venc("2026-10")).id;
    const url = `/api/vencimientos/${id}/mover-fecha`;
    expect((await pedir(url, null, { nuevaFecha: "2026-10-20", motivo: "Prórroga" })).statusCode).toBe(401);
    const ajeno = await pedir(url, beto, { nuevaFecha: "2026-10-20", motivo: "Prórroga" });
    expect(ajeno.statusCode).toBe(403);
    expect(ajeno.json()).toEqual({ error: expect.any(String) });
    expect((await pedir(url, jefa, { nuevaFecha: "2026-10-20", motivo: "Prórroga" })).statusCode).toBe(200);
    expect((await pedir("/api/vencimientos/999999/mover-fecha", ana, { nuevaFecha: "2026-10-20", motivo: "Prórroga" })).statusCode).toBe(404);
    expect((await pedir("/api/vencimientos/0/mover-fecha", ana, { nuevaFecha: "2026-10-20", motivo: "Prórroga" })).statusCode).toBe(400);
    expect((await pedir(`/api/vencimientos/${id}/quitar-movimiento`, null, { motivo: "Prórroga" })).statusCode).toBe(401);
    expect((await pedir(`/api/vencimientos/${id}/quitar-movimiento`, beto, { motivo: "Prórroga" })).statusCode).toBe(403);
    expect((await pedir("/api/vencimientos/999999/quitar-movimiento", ana, { motivo: "Prórroga" })).statusCode).toBe(404);
    const sinModo = await crearApp({ reloj, modoPruebas: false });
    try {
      expect((await sinModo.inject({ method: "POST", url, headers: enc(ana), payload: { nuevaFecha: "2026-10-25", motivo: "Prórroga" } })).statusCode).toBe(401);
    } finally {
      await sinModo.close();
    }
  });

  it("422 con el campo: motivo (3 a 300), nueva fecha real, distinta de la vigente y a no más de 60 días de la original; nada se guarda", async () => {
    for (const motivo of [OMITIR, null, "", "  ", "ab", "x".repeat(301), 123]) {
      const r = await mover("2026-10", "2026-10-20", motivo);
      expect(r.statusCode, String(motivo)).toBe(422);
      expect(r.json().campo).toBe("motivo");
    }
    for (const nueva of [undefined, null, "", "2026-02-30", "20/10/2026", "2026-10-15", "2026-12-15", "2026-08-15"]) {
      const r = await mover("2026-10", nueva);
      expect(r.statusCode, String(nueva)).toBe(422);
      expect(r.json().campo, String(nueva)).toBe("nuevaFecha");
    }
    expect(await prisma.cambioDia.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect(iso((await venc("2026-10")).fecha)).toBe("2026-10-15");
    // en el borde: 60 días de la original sí; 61 no
    expect((await mover("2026-10", "2026-12-14")).statusCode).toBe(200);
    expect((await mover("2026-11", "2027-01-14")).statusCode).toBe(200);
    expect((await mover("2026-11", "2027-01-15")).statusCode).toBe(422);
  });

  it("el tope sale del parámetro mover_fecha_max_dias (sin fila, 60)", async () => {
    await prisma.parametro.upsert({ where: { clave_ambito_categoriaId: { clave: "mover_fecha_max_dias", ambito: "global", categoriaId: 0 } }, update: { valor: "10" }, create: { clave: "mover_fecha_max_dias", valor: "10", tipo: "entero", ambito: "global" } });
    try {
      expect((await mover("2026-10", "2026-10-26")).statusCode).toBe(422);
      expect((await mover("2026-10", "2026-10-25")).statusCode).toBe(200);
      expect((await (await pedir(`/api/vencimientos/${(await venc("2026-10")).id}`, ana, undefined, "GET")).json()).datos.rangoMoverFecha).toEqual({ desde: "2026-10-05", hasta: "2026-10-25" });
    } finally {
      await prisma.parametro.deleteMany({ where: { clave: "mover_fecha_max_dias" } });
    }
  });

  it("estados: solo Programado, Por vencer, Vencido y Sin información; Pagado, Justificado o con inconsistencia dan 409", async () => {
    const permitidos: [string, string][] = [["2026-08", "vencido"], ["2026-09", "proyectado"], ["2026-10", "por_vencer"], ["2026-11", "sin_informacion"]];
    for (const [periodo, estado] of permitidos) {
      await prisma.vencimiento.update({ where: { id: (await venc(periodo)).id }, data: { estado } });
      const r = await mover(periodo, `${periodo}-20`);
      expect(r.statusCode, estado).toBe(200);
    }
    for (const estado of ["pagado", "pagado_con_inconsistencia", "justificado", "por_revisar"]) {
      await prisma.vencimiento.update({ where: { id: (await venc("2026-10")).id }, data: { estado } });
      const r = await mover("2026-10", "2026-10-28");
      expect(r.statusCode, estado).toBe(409);
      expect(r.json()).toEqual({ error: expect.any(String) });
      if (estado === "justificado") expect(r.json().error).toContain("quite la justificación");
    }
    expect(iso((await venc("2026-10")).fecha)).toBe("2026-10-20"); // la que tenía antes de los rechazos
  });
});

describe("mover fecha: efecto", () => {
  it("la fecha vigente cambia solo en ese mes, la original se conserva, el día de la obligación no cambia y queda el registro", async () => {
    const r = await mover("2026-10", "2026-10-22", "  Prórroga   del proveedor ");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ fecha: "2026-10-22", fechaOriginal: "2026-10-15" });
    expect(await fechas()).toEqual(["2026-08-15", "2026-09-15", "2026-10-22", "2026-11-15"]);
    const v = await venc("2026-10");
    expect(iso(v.fechaOriginal)).toBe("2026-10-15");
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(15);
    const h = await prisma.cambioDia.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ tipo: "una_vez", vencimientoId: v.id, obligacionId: obligacion, usuarioId: ana, motivo: "Prórroga del proveedor", modoPruebas: true });
    expect([iso(h[0]!.fechaAnterior), iso(h[0]!.fechaNueva)]).toEqual(["2026-10-15", "2026-10-22"]);
    // un segundo movimiento conserva la original (la primera); volver a la original la deja sin marca
    await mover("2026-10", "2026-10-25");
    expect(iso((await venc("2026-10")).fechaOriginal)).toBe("2026-10-15");
    await mover("2026-10", "2026-10-15");
    expect((await venc("2026-10")).fechaOriginal).toBeNull();
  });

  it("la lista y el detalle muestran fecha vigente, original, quién, cuándo y por qué, y las acciones posibles", async () => {
    await mover("2026-10", "2026-10-22", "Prórroga del proveedor");
    const id = (await venc("2026-10")).id;
    const lista = (await pedir("/api/vencimientos?periodo=2026-10", ana, undefined, "GET")).json().datos[0];
    expect(lista).toMatchObject({ fecha: "2026-10-22", fechaOriginal: "2026-10-15", movida: true, puedeMoverFecha: true, puedeQuitarMovimiento: true });
    const sinMover = (await pedir("/api/vencimientos?periodo=2026-11", ana, undefined, "GET")).json().datos[0];
    expect(sinMover).toMatchObject({ fecha: "2026-11-15", fechaOriginal: null, movida: false, puedeMoverFecha: true, puedeQuitarMovimiento: false });
    const d = (await pedir(`/api/vencimientos/${id}`, ana, undefined, "GET")).json().datos;
    expect(d).toMatchObject({ fecha: "2026-10-22", fechaOriginal: "2026-10-15", movida: true, fechaMovidaPor: "Ana Uno", puedeMoverFecha: true, puedeQuitarMovimiento: true });
    expect(d.movidaPor).toMatchObject({ quien: "Ana Uno", motivo: "Prórroga del proveedor" });
    expect(d.movidaPor.cuando).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.rangoMoverFecha).toEqual({ desde: "2026-08-16", hasta: "2026-12-14" });
    // una persona sin la sociedad no puede actuar
    const ajeno = (await pedir("/api/vencimientos?periodo=2026-10", beto, undefined, "GET")).json().datos;
    expect(ajeno.every((x: { puedeMoverFecha: boolean }) => !x.puedeMoverFecha)).toBe(true);
  });

  it("el cruce se recalcula: mover la fecha a un día ya pasado cambia el estado calculado", async () => {
    const antes = (await venc("2026-09")).estado;
    expect((await mover("2026-09", "2026-09-02")).statusCode).toBe(200);
    const despues = await venc("2026-09");
    expect(iso(despues.fecha)).toBe("2026-09-02");
    expect(despues.estado).not.toBe(antes);
    expect(["vencido", "sin_informacion", "por_vencer"]).toContain(despues.estado);
    // y a una fecha lejana vuelve a Programado
    await quitarMov("2026-09");
    expect((await mover("2026-09", "2026-10-25")).statusCode).toBe(200);
    expect((await venc("2026-09")).estado).toBe("proyectado");
  });

  it("una justificación de otro vencimiento no se rompe; el justificado se mueve solo tras quitar la justificación", async () => {
    const ago = await venc("2026-08");
    await prisma.vencimiento.update({ where: { id: ago.id }, data: { estado: "vencido" } });
    const j = await pedir(`/api/vencimientos/${ago.id}/justificar`, ana, { motivo: "otro", nota: "El banco confirma que se pagó por otro medio" });
    expect(j.statusCode, JSON.stringify(j.json())).toBe(200);
    expect((await venc("2026-08")).estado).toBe("justificado");
    expect((await mover("2026-09", "2026-09-20")).statusCode).toBe(200);
    expect((await venc("2026-08")).estado).toBe("justificado");
    expect((await mover("2026-08", "2026-08-20")).statusCode).toBe(409);
    expect((await pedir(`/api/vencimientos/${ago.id}/quitar-justificacion`, ana, { motivo: "Se corrigió" })).statusCode).toBe(200);
    expect((await mover("2026-08", "2026-08-20")).statusCode).toBe(200);
  });

  it("el movimiento sobrevive a regenerar el calendario y a un cambio de monto", async () => {
    await mover("2026-10", "2026-10-29");
    await prisma.obligacion.update({ where: { id: obligacion }, data: { montoEsperado: 7000n } });
    await sincronizarVencimientos(reloj, obligacion);
    const v = await venc("2026-10");
    expect([iso(v.fecha), iso(v.fechaOriginal), v.montoEsperado]).toEqual(["2026-10-29", "2026-10-15", 7000n]);
  });
});

describe("quitar movimiento", () => {
  it("devuelve la fecha original, deja el registro y la línea del historial; 409 si no está movido; motivo 422", async () => {
    expect((await quitarMov("2026-10")).statusCode).toBe(409); // no está movido
    await mover("2026-10", "2026-10-22");
    for (const motivo of [OMITIR, "", "ab", "x".repeat(301)]) {
      const r = await quitarMov("2026-10", motivo);
      expect(r.statusCode, String(motivo)).toBe(422);
      expect(r.json().campo).toBe("motivo");
    }
    const r = await quitarMov("2026-10", "Ya no hace falta");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ fecha: "2026-10-15" });
    const v = await venc("2026-10");
    expect([iso(v.fecha), v.fechaOriginal]).toEqual(["2026-10-15", null]);
    const h = await prisma.cambioDia.findMany({ orderBy: { id: "asc" } });
    expect(h.map((x) => [x.tipo, iso(x.fechaAnterior), iso(x.fechaNueva), x.motivo])).toEqual([
      ["una_vez", "2026-10-15", "2026-10-22", "Prórroga del proveedor"],
      ["quita_mov", "2026-10-22", "2026-10-15", "Ya no hace falta"],
    ]);
    expect((await quitarMov("2026-10")).statusCode).toBe(409); // ya se quitó
    // en un estado pagado tampoco se quita
    await mover("2026-11", "2026-11-25");
    await prisma.vencimiento.update({ where: { id: (await venc("2026-11")).id }, data: { estado: "pagado" } });
    expect((await quitarMov("2026-11")).statusCode).toBe(409);
  });
});

describe("cambio permanente: permisos y validación", () => {
  const cuerpo = { nuevoDia: 20, desdeMes: "2026-09", motivo: "Nuevo acuerdo con el proveedor" };

  it("sin persona 401; un tesorero ajeno 403; el propio y Jefatura sí; 404 y 400; sin modo de pruebas no hay persona", async () => {
    expect((await cambiar(cuerpo, null)).statusCode).toBe(401);
    const ajeno = await cambiar(cuerpo, beto);
    expect(ajeno.statusCode).toBe(403);
    expect(ajeno.json()).toEqual({ error: expect.any(String) });
    expect((await cambiar(cuerpo, jefa)).statusCode).toBe(200);
    expect((await cambiar({ ...cuerpo, nuevoDia: 22 }, ana)).statusCode).toBe(200);
    expect((await cambiar(cuerpo, ana, 999_999)).statusCode).toBe(404);
    expect((await cambiar(cuerpo, ana, 0)).statusCode).toBe(400);
    const sinModo = await crearApp({ reloj, modoPruebas: false });
    try {
      expect((await sinModo.inject({ method: "POST", url: `/api/obligaciones/${obligacion}/cambiar-dia`, headers: enc(ana), payload: cuerpo })).statusCode).toBe(401);
    } finally {
      await sinModo.close();
    }
  });

  it("422 con el campo: día 1 a 31 distinto del vigente, mes válido y no pasado, motivo; el mes pasado no se admite", async () => {
    const campos: [object, string][] = [
      [{ ...cuerpo, nuevoDia: 0 }, "nuevoDia"], [{ ...cuerpo, nuevoDia: 32 }, "nuevoDia"], [{ ...cuerpo, nuevoDia: 1.5 }, "nuevoDia"], [{ ...cuerpo, nuevoDia: "20" }, "nuevoDia"],
      [{ ...cuerpo, nuevoDia: 15 }, "nuevoDia"], // el mismo día que ya rige
      [{ ...cuerpo, desdeMes: "2026-08" }, "desdeMes"], [{ ...cuerpo, desdeMes: "2025-01" }, "desdeMes"], [{ ...cuerpo, desdeMes: "2026-13" }, "desdeMes"], [{ ...cuerpo, desdeMes: undefined }, "desdeMes"],
      [{ ...cuerpo, motivo: undefined }, "motivo"], [{ ...cuerpo, motivo: "ab" }, "motivo"], [{ ...cuerpo, motivo: "x".repeat(301) }, "motivo"],
    ];
    for (const [c, campo] of campos) {
      const r = await cambiar(c);
      expect(r.statusCode, JSON.stringify(c)).toBe(422);
      expect(r.json().campo, JSON.stringify(c)).toBe(campo);
    }
    expect(await prisma.cambioDia.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(15);
    // una obligación sin día no se cambia por aquí
    const sinDia = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "SinDia", identificador: "9", diaEsperadoPago: null } })).id;
    const r = await cambiar(cuerpo, ana, sinDia);
    expect([r.statusCode, r.json().campo]).toEqual([422, "nuevoDia"]);
  });
});

describe("cambio permanente: efecto", () => {
  it("desde el mes en curso: cambia el día base y los meses desde ahí; los anteriores no se tocan; historial con el «desde»", async () => {
    const r = await cambiar({ nuevoDia: 20, desdeMes: "2026-09", motivo: "  Nuevo   acuerdo " });
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toMatchObject({ desde: "2026-09", dia: 20 });
    expect(await fechas()).toEqual(["2026-08-15", "2026-09-20", "2026-10-20", "2026-11-20"]);
    const o = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } });
    expect([o.diaEsperadoPago, o.diaEditado]).toEqual([20, true]);
    expect((await venc("2026-08")).dia).toBe(15);
    expect((await venc("2026-10")).dia).toBe(20);
    const c = await prisma.cambioDia.findFirstOrThrow();
    expect(c).toMatchObject({ tipo: "permanente", diaAnterior: 15, diaNuevo: 20, aplicaDesde: "2026-09", motivo: "Nuevo acuerdo", usuarioId: ana, vencimientoId: null, modoPruebas: true });
    const h = await prisma.historialCambio.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ entidad: "obligacion", entidadId: obligacion, accion: "cambiar_dia", campo: "diaEsperadoPago", antes: "15", despues: "20 desde 2026-09", motivo: "Nuevo acuerdo", usuarioId: ana, nombreUsuario: "Ana Uno", sociedadId: sociedadA });
  });

  it("desde un mes posterior: los meses anteriores quedan igual; el día base cambia cuando llega el mes (y el importador no lo pisa)", async () => {
    await prisma.vencimiento.update({ where: { id: (await venc("2026-09")).id }, data: { estado: "pagado" } }); // sin pago pendiente este mes: no se pregunta
    const r = await cambiar({ nuevoDia: 20, desdeMes: "2026-11", motivo: "Nuevo día desde noviembre" });
    expect(r.statusCode, JSON.stringify(r.json())).toBe(200);
    expect(r.json().datos.desde).toBe("2026-11");
    expect(await fechas()).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-20"]);
    const o = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } });
    expect([o.diaEsperadoPago, o.diaEditado]).toEqual([15, false]); // todavía rige el día de siempre
    expect((await pedir("/api/obligaciones?porPagina=100", ana, undefined, "GET")).json().datos[0]).toMatchObject({ diaEsperadoPago: 15, diaProgramado: { desde: "2026-11", dia: 20 } });
    // el Excel con el día de siempre no desarma lo programado
    await sincronizarCatalogo([{ fila: 2, sociedad: "AAA", categoria: categoriaNombre, proveedor: "Fono", identificador: "0001", dia: 15, estado: null }], "mensual");
    expect(iso((await venc("2026-11")).fecha)).toBe("2026-11-20");
    await sincronizarVencimientos(reloj, obligacion);
    expect(iso((await venc("2026-11")).fecha)).toBe("2026-11-20");
    expect(iso((await venc("2026-10")).fecha)).toBe("2026-10-15");
    // llega noviembre: el día base pasa a 20 y queda como «día editado»
    await sincronizarVencimientos(() => new Date(2026, 10, 2, 10, 0), obligacion);
    const llegado = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } });
    expect([llegado.diaEsperadoPago, llegado.diaEditado]).toEqual([20, true]);
    await sincronizarCatalogo([{ fila: 2, sociedad: "AAA", categoria: categoriaNombre, proveedor: "Fono", identificador: "0001", dia: 15, estado: null }], "mensual");
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(20); // el importador no lo pisa
  });

  it("pregunta por el mes en curso solo si el pago de este mes sigue pendiente y el día cambiaría; sin respuesta, 422 con el campo", async () => {
    const base = { nuevoDia: 20, desdeMes: "2026-11", motivo: "Nuevo día desde noviembre" };
    const sinRespuesta = await cambiar(base);
    expect(sinRespuesta.statusCode).toBe(422);
    expect(sinRespuesta.json().campo).toBe("aplicaAlMesEnCurso");
    expect(await prisma.cambioDia.count()).toBe(0);
    expect((await cambiar({ ...base, aplicaAlMesEnCurso: "si" })).statusCode).toBe(422); // no es un sí o no
    // «no»: septiembre sigue como estaba
    expect((await cambiar({ ...base, aplicaAlMesEnCurso: false })).statusCode).toBe(200);
    expect(await fechas()).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-20"]);
    expect((await prisma.cambioDia.findFirstOrThrow()).aplicaDesde).toBe("2026-11");
  });

  it("respondiendo «sí», el nuevo día rige desde el mes en curso", async () => {
    const r = await cambiar({ nuevoDia: 20, desdeMes: "2026-11", aplicaAlMesEnCurso: true, motivo: "Nuevo día también este mes" });
    expect(r.statusCode).toBe(200);
    expect(r.json().datos.desde).toBe("2026-09");
    expect(await fechas()).toEqual(["2026-08-15", "2026-09-20", "2026-10-20", "2026-11-20"]);
    const h = await prisma.historialCambio.findFirstOrThrow();
    expect(h.despues).toBe("20 desde 2026-09");
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(20);
  });

  it("no pregunta si el pago de este mes ya está pagado o justificado, ni si su fecha ya pasó", async () => {
    for (const estado of ["pagado", "justificado"]) {
      await prisma.cambioDia.deleteMany();
      await prisma.vencimiento.update({ where: { id: (await venc("2026-09")).id }, data: { estado } });
      const r = await cambiar({ nuevoDia: 20, desdeMes: "2026-11", motivo: "Nuevo día desde noviembre" });
      expect(r.statusCode, estado).toBe(200);
      await prisma.cambioDia.deleteMany();
    }
    await prisma.cambioDia.deleteMany();
    await prisma.vencimiento.update({ where: { id: (await venc("2026-09")).id }, data: { estado: "proyectado", fecha: new Date("2026-09-05T00:00:00Z") } });
    expect((await cambiar({ nuevoDia: 20, desdeMes: "2026-11", motivo: "Nuevo día desde noviembre" })).statusCode).toBe(200); // ya pasó: Mover fecha es el camino
  });

  it("«Mover fecha» gana en su mes sobre un cambio permanente; la original sigue al día nuevo", async () => {
    await mover("2026-10", "2026-10-28");
    await cambiar({ nuevoDia: 5, desdeMes: "2026-09", motivo: "Nuevo día" });
    const v = await venc("2026-10");
    expect([iso(v.fecha), iso(v.fechaOriginal)]).toEqual(["2026-10-28", "2026-10-05"]);
    expect(iso((await venc("2026-11")).fecha)).toBe("2026-11-05");
    // quitar el movimiento devuelve al día nuevo
    expect((await quitarMov("2026-10")).statusCode).toBe(200);
    expect(iso((await venc("2026-10")).fecha)).toBe("2026-10-05");
  });

  it("un cambio permanente no mueve lo pagado", async () => {
    await prisma.vencimiento.update({ where: { id: (await venc("2026-10")).id }, data: { estado: "pagado" } });
    await cambiar({ nuevoDia: 20, desdeMes: "2026-09", motivo: "Nuevo día" });
    expect(await fechas()).toEqual(["2026-08-15", "2026-09-20", "2026-10-15", "2026-11-20"]);
  });

  it("una revisión del paso 5 pierde su efecto si el día base cambia (huella), y no si el cambio todavía no rige", async () => {
    const iban = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "Iban", identificador: IBAN, diaEsperadoPago: 10 } })).id;
    const estadoDe = async () => ((await pedir("/api/obligaciones?porPagina=100", jefa, undefined, "GET")).json().datos as { id: number; estado: string }[]).find((x) => x.id === iban)!.estado;
    expect((await pedir(`/api/obligaciones/${iban}/marcar-revisada`, ana, { nota: "El proveedor solo da su cuenta" })).statusCode).toBe(200);
    expect(await estadoDe()).toBe("revisada");
    expect((await cambiar({ nuevoDia: 20, desdeMes: "2026-12", motivo: "Nuevo día en diciembre" }, ana, iban)).statusCode).toBe(200);
    expect(await estadoDe()).toBe("revisada"); // aún rige el día de antes
    expect((await cambiar({ nuevoDia: 22, desdeMes: "2026-09", motivo: "Nuevo día ya" }, ana, iban)).statusCode).toBe(200);
    expect(await estadoDe()).toBe("en_revision");
    expect(await prisma.decisionManual.count({ where: { vigente: true } })).toBe(1); // la decisión no se borra
  });
});

describe("historial y atomicidad", () => {
  it("mover y quitar dejan una línea cada una en la misma operación: entidad vencimiento, campo fecha_vencimiento, antes y después son las dos fechas", async () => {
    await mover("2026-10", "2026-10-22", "Prórroga del proveedor");
    await quitarMov("2026-10", "Se vuelve al día");
    const id = (await venc("2026-10")).id;
    const h = await prisma.historialCambio.findMany({ orderBy: { id: "asc" } });
    expect(h.map((x) => [x.entidad, x.entidadId, x.accion, x.campo, x.antes, x.despues, x.motivo])).toEqual([
      ["vencimiento", id, "mover_fecha", "fecha_vencimiento", "2026-10-15", "2026-10-22", "Prórroga del proveedor"],
      ["vencimiento", id, "quitar_movimiento", "fecha_vencimiento", "2026-10-22", "2026-10-15", "Se vuelve al día"],
    ]);
    expect(h.every((x) => x.usuarioId === ana && x.nombreUsuario === "Ana Uno" && x.modoPruebas && x.obligacionId === obligacion && x.sociedadId === sociedadA)).toBe(true);
    // nada sensible: ni números de servicio ni cuentas
    expect(JSON.stringify(h)).not.toContain("0001");
  });

  it("si falla el registro, no queda nada a medias (la fecha y el historial vuelven atrás)", async () => {
    const v = (await vencimientoParaAsociar((await venc("2026-10")).id))!;
    const e = await moverFecha({ vencimiento: v, nuevaFecha: "2026-10-22", motivo: "Prórroga", autor: { id: 987_654, nombre: "No existe", modoPruebas: false } }, reloj).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ErrorDeServicio);
    const despues = await venc("2026-10");
    expect([iso(despues.fecha), despues.fechaOriginal]).toEqual(["2026-10-15", null]);
    expect(await prisma.cambioDia.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
  });

  it("el cambio permanente y su historial también se guardan juntos o no se guardan", async () => {
    // una obligación cuyo autor no existe: falla al crear el registro y el día base no cambia
    const { cambiarDia } = await import("../src/obligaciones/cambiar-dia.js");
    const o = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } });
    await expect(cambiarDia({ obligacion: o, nuevoDia: 20, desdeMes: "2026-09", aplicaAlMesEnCurso: undefined, motivo: "Nuevo día", autor: { id: 987_654, nombre: "No existe", modoPruebas: false } }, reloj)).rejects.toThrow();
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(15);
    expect(await prisma.cambioDia.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
  });

  it("el repositorio del historial no ofrece edición ni borrado, y lo que tiene historial no se borra de la base", async () => {
    const m = await import("../src/repositories/cambios-dia.js");
    expect(Object.keys(m).filter((k) => /actualizar|editar|borrar|eliminar|delete|update/i.test(k))).toEqual([]);
    await mover("2026-10", "2026-10-20");
    const id = (await venc("2026-10")).id;
    await expect(prisma.vencimiento.delete({ where: { id } })).rejects.toThrow();
    await expect(prisma.obligacion.delete({ where: { id: obligacion } })).rejects.toThrow();
  });

  it("el Historial de cambios lista las líneas nuevas y no muestra identificadores completos", async () => {
    await mover("2026-10", "2026-10-22");
    await cambiar({ nuevoDia: 20, desdeMes: "2026-11", aplicaAlMesEnCurso: false, motivo: "Nuevo día desde noviembre" });
    const r = await pedir("/api/historial-cambios?porPagina=50", jefa, undefined, "GET");
    expect(r.statusCode).toBe(200);
    const filas = r.json().datos as { accion: string; campo: string; antes: string | null; despues: string | null }[];
    expect(filas.map((x) => x.accion).sort()).toEqual(["cambiar_dia", "mover_fecha"]);
    expect(filas.find((x) => x.accion === "cambiar_dia")).toMatchObject({ campo: "diaEsperadoPago", antes: "15", despues: "20 desde 2026-11" });
    expect(JSON.stringify(r.json())).not.toContain("0001");
  });
});

describe("de la API a lo que se lee en el Historial y en la ficha (de punta a punta)", () => {
  it("las líneas reales de mover, quitar y cambiar el día pasan por las funciones del Frontend: dos valores, nunca una flecha sola, y el grupo correcto", async () => {
    const { resolve } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const f = (await import(/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "../Frontend/src/lib/formato.ts")).href)) as {
      cambioEnPalabras: (x: { accion: string; campo: string; antes: string | null; despues: string | null }) => { tipo: string; antes?: string; despues?: string };
      rotuloDeFila: (x: { accion: string; campo: string; antes?: string | null; despues?: string | null }) => string;
      agruparCampos: (c: string[]) => { titulo: string; campos: string[] }[];
      fraseMovida: (m: { quien: string; cuando: string; motivo: string }) => string;
    };
    await mover("2026-10", "2026-10-22", "Prórroga del proveedor");
    await cambiar({ nuevoDia: 20, desdeMes: "2026-11", aplicaAlMesEnCurso: false, motivo: "Nuevo día desde noviembre" });
    await quitarMov("2026-10", "Se vuelve al día");
    const filas = ((await pedir("/api/historial-cambios?porPagina=50", jefa, undefined, "GET")).json().datos as { accion: string; campo: string; antes: string | null; despues: string | null }[]);
    expect(filas.map((x) => x.accion).sort()).toEqual(["cambiar_dia", "mover_fecha", "quitar_movimiento"]);
    for (const fila of filas) {
      const c = f.cambioEnPalabras(fila);
      expect(c.tipo, fila.accion).toBe("valores");
      expect(c.antes && c.despues, fila.accion).toBeTruthy();
    }
    expect(f.rotuloDeFila(filas.find((x) => x.accion === "mover_fecha")!)).toBe("Fecha del vencimiento");
    expect(f.cambioEnPalabras(filas.find((x) => x.accion === "cambiar_dia")!)).toEqual({ tipo: "valores", antes: "día 15", despues: "día 20 desde nov 2026" });
    expect(f.agruparCampos([...new Set(filas.map((x) => x.campo))]).map((g) => [g.titulo, g.campos])).toEqual([["Datos de la obligación", ["diaEsperadoPago"]], ["Decisiones manuales", ["fecha_vencimiento"]]]);
    await mover("2026-10", "2026-10-22", "Prórroga del proveedor");
    const d = (await pedir(`/api/vencimientos/${(await venc("2026-10")).id}`, ana, undefined, "GET")).json().datos;
    expect(f.fraseMovida(d.movidaPor)).toMatch(/^Movida por Ana Uno( el \d{1,2} \w+( \d{4})?)?\. Motivo: Prórroga del proveedor\.$/);
  });
});
