import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import type { FilaCatalogo } from "../src/catalogo/lector.js";
import { prisma } from "../src/db.js";
import { calcularDiferencias, type FilaExcel, type ObligacionDif } from "../src/domain/diferencias-excel.js";
import { resolverDiferencia } from "../src/diferencias/servicio.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { generarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// «Diferencias con el Excel»: el Excel se simula con filas sintéticas (la ruta real nunca se abre). Datos inventados. Hoy = 2026-09-10.
const reloj = () => new Date(2026, 8, 10, 10, 0);
const enc = (id: number) => ({ "x-usuario-actual": String(id) });

let filasExcel: FilaCatalogo[] | null = [];
let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let cat1: { id: number; nombre: string };
let cat2: { id: number; nombre: string };
const ids: Record<string, number> = {};

const fila = (n: number, sociedad: string, categoria: string, proveedor: string, identificador: string, dia: number | null): FilaCatalogo => ({ fila: n, sociedad, categoria, proveedor, identificador, dia, estado: null });
const pedir = (metodo: "GET" | "POST", url: string, actor: number | null, payload?: object) =>
  app.inject({ method: metodo, url, headers: actor === null ? {} : enc(actor), ...(payload ? { payload } : {}) });
const listar = async (actor: number | null = jefa, q = "") => (await pedir("GET", `/api/diferencias-excel${q}`, actor)).json();
type Fila = { clave: string; tipo: string; estado: string; sociedad: string; acciones: string[]; puedeGestionar: boolean; plataforma: { proveedor: string; identificador: string; dia: number | null }; excel: { dia: number | null; identificador: string } | null; decision: { accion: string; motivo: string } | null };
const filaDe = async (clave: string, actor: number | null = jefa) => ((await listar(actor)).datos as Fila[]).find((f) => f.clave === clave);
const resolver = (cuerpo: object, actor: number | null = ana) => pedir("POST", "/api/diferencias-excel/resolver", actor, cuerpo);
const MOTIVO = "Lo confirmó Tesorería";

beforeAll(async () => {
  app = await crearApp({ reloj, modoPruebas: true, fuenteDeFilasExcel: async () => filasExcel });
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
  const persona = async (correo: string, nombre: string, rol: string) => (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  jefa = await persona("jefa@x.cr", "Jefa Tres", "Jefatura");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  const cats = await prisma.categoria.findMany({ orderBy: { id: "asc" }, take: 2 });
  cat1 = cats[0]!;
  cat2 = cats[1]!;
  const crear = async (clave: string, sociedadId: number, categoriaId: number, proveedor: string, identificador: string, dia: number | null, extra: object = {}) => {
    ids[clave] = (await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: dia, ...extra } })).id;
  };
  await crear("normal", sociedadA, cat1.id, "Fono", "1000001", 15);
  await crear("vieja", sociedadA, cat2.id, "Vieja Tel", "7000001", 10);
  await crear("nueva", sociedadA, cat2.id, "Nueva Tel", "7000002", 10);
  await crear("huerfana", sociedadA, cat1.id, "Huerfana", "8000001", 5);
  await crear("diaEd", sociedadA, cat1.id, "Dia Editado", "9000001", 12, { diaEditado: true });
  await crear("viejaB", sociedadB, cat1.id, "Vieja B", "6000001", 8);
  await generarRango("2026-08", "2026-11");
  // el Excel de ahora: trae la normal, la nueva (no la vieja ni la huérfana ni la de B) y la del día distinto con el día 20
  filasExcel = [
    fila(2, "AAA", cat1.nombre, "Fono", "1000001", 15),
    fila(3, "AAA", cat2.nombre, "Nueva Tel", "7000002", 10),
    fila(4, "AAA", cat1.nombre, "Dia Editado", "9000001", 20),
  ];
});

describe("dominio: cálculo de diferencias", () => {
  const o = (id: number, extra: Partial<ObligacionDif> = {}): ObligacionDif => ({ id, sociedadId: 1, categoriaId: 1, proveedor: `P${id}`, identificador: `${1000 + id}`, dia: 10, diaEditado: false, frecuencia: "mensual", activa: true, origen: "catalogo", conPagos: false, ...extra });
  const f = (id: number, extra: Partial<FilaExcel> = {}): FilaExcel => ({ sociedadId: 1, categoriaId: 1, proveedor: `P${id}`, identificador: `${1000 + id}`, dia: 10, ...extra });

  it("una pareja solo es clara con exactamente una vieja y una nueva con el mismo día, categoría, sociedad y frecuencia; nunca se unen solas", () => {
    const r = calcularDiferencias([o(1), o(2)], [f(2)]);
    expect(r.map((d) => [d.tipo, d.obligacionId, d.nuevaId])).toEqual([["posible_renombre", 1, 2]]);
    // dos viejas del mismo grupo: no hay pareja clara, salen como «ya no está»
    expect(calcularDiferencias([o(1), o(3), o(2)], [f(2)]).map((d) => d.tipo).sort()).toEqual(["ya_no_esta", "ya_no_esta"]);
    // distinto día, categoría o frecuencia: no es pareja
    for (const extra of [{ dia: 11 }, { categoriaId: 2 }, { frecuencia: "anual" }] as Partial<ObligacionDif>[]) {
      expect(calcularDiferencias([o(1), o(2, extra)], [f(2, { categoriaId: extra.categoriaId ?? 1 })]).map((d) => d.tipo)).toEqual(["ya_no_esta"]);
    }
    // la «nueva» ya con pagos no es nueva
    expect(calcularDiferencias([o(1), o(2, { conPagos: true })], [f(2)]).map((d) => d.tipo)).toEqual(["ya_no_esta"]);
    // las manuales e inactivas no cuentan
    expect(calcularDiferencias([o(1, { origen: "manual" }), o(2, { activa: false })], [])).toEqual([]);
  });

  it("día distinto solo si Tesorería editó el día y el Excel trae un día válido y distinto; sin diferencias, nada", () => {
    expect(calcularDiferencias([o(1, { diaEditado: true })], [f(1, { dia: 20 })]).map((d) => [d.tipo, d.plataforma.dia, d.excel?.dia])).toEqual([["dia_distinto", 10, 20]]);
    expect(calcularDiferencias([o(1)], [f(1, { dia: 20 })])).toEqual([]); // sin editar, el Excel manda: ya lo igualó la importación
    expect(calcularDiferencias([o(1, { diaEditado: true })], [f(1, { dia: null })])).toEqual([]);
    expect(calcularDiferencias([o(1, { diaEditado: true })], [f(1, { dia: 10 })])).toEqual([]);
    expect(calcularDiferencias([o(1), o(2)], [f(1), f(2)])).toEqual([]);
  });

  it("la huella cambia si cambian los datos y no si no", () => {
    const a = calcularDiferencias([o(1, { diaEditado: true })], [f(1, { dia: 20 })])[0]!.huella;
    expect(calcularDiferencias([o(1, { diaEditado: true })], [f(1, { dia: 20 })])[0]!.huella).toBe(a);
    expect(calcularDiferencias([o(1, { diaEditado: true })], [f(1, { dia: 21 })])[0]!.huella).not.toBe(a);
    expect(calcularDiferencias([o(1, { diaEditado: true, dia: 11 })], [f(1, { dia: 20 })])[0]!.huella).not.toBe(a);
  });
});

describe("lista y permisos", () => {
  it("sin persona 401; Jefatura ve todo; un tesorero solo las de su sociedad; el filtro por tipo, estado y sociedad; sin modo de pruebas no hay persona", async () => {
    expect((await pedir("GET", "/api/diferencias-excel", null)).statusCode).toBe(401);
    const todo = await listar(jefa);
    expect((todo.datos as Fila[]).map((d) => d.clave).sort()).toEqual([`d-${ids.diaEd}`, `r-${ids.vieja}-${ids.nueva}`, `y-${ids.huerfana}`, `y-${ids.viejaB}`].sort());
    expect(todo.resumen).toEqual({ posible_renombre: 1, ya_no_esta: 2, dia_distinto: 1 });
    expect(todo.pendientes).toBe(4);
    expect(todo.disponible).toBe(true);
    const deAna = await listar(ana);
    expect((deAna.datos as Fila[]).map((d) => d.sociedad).every((s) => s === "Sociedad AAA")).toBe(true);
    expect(deAna.pendientes).toBe(3);
    expect(deAna.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    expect(((await listar(beto)).datos as Fila[]).map((d) => d.clave)).toEqual([`y-${ids.viejaB}`]);
    expect(((await listar(jefa, "?tipo=ya_no_esta")).datos as Fila[]).length).toBe(2);
    expect(((await listar(jefa, `?sociedadId=${sociedadB}`)).datos as Fila[]).length).toBe(1);
    expect(((await listar(jefa, "?estado=decidida")).datos as Fila[]).length).toBe(0);
    expect((await pedir("GET", "/api/diferencias-excel?tipo=otro", jefa)).statusCode).toBe(400);
    const sinModo = await crearApp({ reloj, modoPruebas: false, fuenteDeFilasExcel: async () => filasExcel });
    try {
      expect((await sinModo.inject({ method: "GET", url: "/api/diferencias-excel", headers: enc(ana) })).statusCode).toBe(401);
    } finally {
      await sinModo.close();
    }
  });

  it("las acciones posibles dependen del tipo y de quién mira; los identificadores salen enmascarados", async () => {
    const f = await filaDe(`r-${ids.vieja}-${ids.nueva}`, ana);
    expect(f).toMatchObject({ tipo: "posible_renombre", estado: "pendiente", acciones: ["es_la_misma", "son_distintas"], puedeGestionar: true });
    expect(f!.plataforma.identificador).toBe("****0001");
    expect((await filaDe(`y-${ids.huerfana}`, ana))!.acciones).toEqual(["sigue_vigente", "desactivar"]);
    expect((await filaDe(`d-${ids.diaEd}`, ana))!.acciones).toEqual(["mantener_plataforma", "usar_excel"]);
    expect(JSON.stringify(await listar(jefa))).not.toMatch(/7000001|7000002|8000001|9000001|6000001/);
  });

  it("sin archivo del catálogo no se inventa ninguna diferencia", async () => {
    filasExcel = null;
    const r = await listar(jefa);
    expect([r.disponible, r.datos, r.pendientes]).toEqual([false, [], 0]);
  });

  it("solo leer no cambia nada: ninguna obligación se une, desactiva ni se guarda decisión", async () => {
    const antes = await prisma.obligacion.findMany({ orderBy: { id: "asc" } });
    await listar(jefa);
    await listar(ana);
    expect(await prisma.obligacion.findMany({ orderBy: { id: "asc" } })).toEqual(antes);
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
  });

  it("con el Excel igual a la plataforma no hay diferencias (resultados idénticos a hoy)", async () => {
    await prisma.obligacion.update({ where: { id: ids.viejaB }, data: { activa: false } });
    await prisma.obligacion.update({ where: { id: ids.vieja }, data: { activa: false } });
    await prisma.obligacion.update({ where: { id: ids.huerfana }, data: { activa: false } });
    await prisma.obligacion.update({ where: { id: ids.diaEd }, data: { diaEsperadoPago: 20 } });
    const r = await listar(jefa);
    expect([r.datos, r.resumen, r.pendientes]).toEqual([[], { posible_renombre: 0, ya_no_esta: 0, dia_distinto: 0 }, 0]);
  });
});

describe("resolver: permisos y validación", () => {
  const clave = () => `y-${ids.huerfana}`;

  it("401 sin persona; 403 de otra sociedad; 404 si no existe o no corresponde al tipo; 409 si ya está decidida", async () => {
    const c = { tipo: "ya_no_esta", claves: [clave()], accion: "sigue_vigente", motivo: MOTIVO };
    expect((await resolver(c, null)).statusCode).toBe(401);
    // beto no es tesorero de AAA: 403 con un texto claro, sin datos de la sociedad
    const ajeno = await resolver(c, beto);
    expect(ajeno.statusCode).toBe(403);
    expect(ajeno.json()).toEqual({ error: expect.any(String) });
    expect((await resolver({ ...c, claves: ["y-999999"] })).statusCode).toBe(404);
    expect((await resolver({ ...c, tipo: "dia_distinto", accion: "mantener_plataforma" })).statusCode).toBe(404); // esa clave no es de ese tipo
    // un tesorero que ya no es el de la sociedad tampoco puede
    await prisma.sociedad.update({ where: { id: sociedadA }, data: { tesoreroId: beto } });
    expect((await resolver(c, ana)).statusCode).toBe(403);
    await prisma.sociedad.update({ where: { id: sociedadA }, data: { tesoreroId: ana } });
    expect((await resolver(c, ana)).statusCode).toBe(200);
    const otra = await resolver(c, ana);
    expect(otra.statusCode).toBe(409);
    expect(otra.json()).toEqual({ error: expect.any(String) });
  });

  it("422 con el campo: tipo, claves, acción (y que corresponda al tipo), motivo (3 a 300) y una sola clave para usar el día del Excel", async () => {
    const base = { tipo: "ya_no_esta", claves: [clave()], accion: "sigue_vigente", motivo: MOTIVO };
    const casos: [object, string][] = [
      [{ ...base, tipo: "otro" }, "tipo"], [{ ...base, tipo: undefined }, "tipo"], [{ ...base, claves: [] }, "claves"], [{ ...base, claves: undefined }, "claves"],
      [{ ...base, accion: "otra" }, "accion"], [{ ...base, accion: "es_la_misma" }, "accion"], [{ ...base, accion: undefined }, "accion"],
      [{ ...base, motivo: undefined }, "motivo"], [{ ...base, motivo: "ab" }, "motivo"], [{ ...base, motivo: "x".repeat(301) }, "motivo"],
      [{ tipo: "dia_distinto", claves: [`d-${ids.diaEd}`, "d-2"], accion: "usar_excel", motivo: MOTIVO, desdeMes: "2026-09" }, "claves"],
    ];
    for (const [c, campo] of casos) {
      const r = await resolver(c, jefa);
      expect(r.statusCode, JSON.stringify(c)).toBe(422);
      expect(r.json().campo, JSON.stringify(c)).toBe(campo);
    }
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
  });
});

describe("resolver: cada tipo y cada acción", () => {
  it("«Es la misma»: desactiva la vieja con motivo, la deja ligada a la nueva y conserva lo anclado a ella (asociaciones, justificaciones, historial)", async () => {
    const vieja = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.vieja, periodo: "2026-08" } });
    await prisma.vencimiento.update({ where: { id: vieja.id }, data: { estado: "vencido" } });
    expect((await pedir("POST", `/api/vencimientos/${vieja.id}/justificar`, ana, { motivo: "no_se_paga" })).statusCode).toBe(200);
    const antes = await prisma.decisionManual.count({ where: { vigente: true } });
    const clave = `r-${ids.vieja}-${ids.nueva}`;
    const r = await resolver({ tipo: "posible_renombre", claves: [clave], accion: "es_la_misma", motivo: MOTIVO });
    expect(r.statusCode, JSON.stringify(r.json())).toBe(200);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.vieja } })).activa).toBe(false);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.nueva } })).activa).toBe(true);
    // la decisión liga ambas (la vieja es la obligación; la nueva va en la clave y en el texto del historial)
    const d = await prisma.decisionManual.findFirstOrThrow({ where: { tipo: "diferencia_excel" } });
    expect(d).toMatchObject({ obligacionId: ids.vieja, sociedadId: sociedadA, vigente: true, motivo: MOTIVO, unicaObligacionPeriodo: `x|${clave}`, modoPruebas: true, usuarioId: ana, nombreUsuario: "Ana Uno" });
    // lo anclado a la vieja sigue vigente y los vencimientos pasados se conservan; los futuros sin pagar se retiraron
    expect(await prisma.decisionManual.count({ where: { vigente: true } })).toBe(antes + 1);
    expect(await prisma.vencimiento.count({ where: { obligacionId: ids.vieja, periodo: "2026-08" } })).toBe(1);
    expect(await prisma.vencimiento.count({ where: { obligacionId: ids.vieja, periodo: { gte: "2026-10" } } })).toBe(0);
    const h = await prisma.historialCambio.findMany({ where: { obligacionId: ids.vieja }, orderBy: { id: "asc" } });
    expect(h.map((x) => [x.accion, x.campo, x.antes, x.despues, x.motivo])).toEqual(expect.arrayContaining([
      ["desactivar", "activa", "activa", "inactiva", MOTIVO],
      ["es_la_misma", "diferencia_excel", "pendiente", "misma:Nueva Tel", MOTIVO],
    ]));
    expect(h.some((x) => x.accion === "justificar")).toBe(true); // el historial anterior sigue ahí
    const f = await filaDe(clave);
    expect(f).toMatchObject({ estado: "decidida", acciones: [], puedeGestionar: false, decision: { accion: "es_la_misma", motivo: MOTIVO } });
  });

  it("«Son distintas»: descarta la sugerencia sin tocar ninguna obligación", async () => {
    const clave = `r-${ids.vieja}-${ids.nueva}`;
    expect((await resolver({ tipo: "posible_renombre", claves: [clave], accion: "son_distintas", motivo: MOTIVO })).statusCode).toBe(200);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.vieja } })).activa).toBe(true);
    expect((await filaDe(clave))!.estado).toBe("decidida");
    const h = await prisma.historialCambio.findMany();
    expect(h.map((x) => [x.accion, x.campo, x.antes, x.despues])).toEqual([["son_distintas", "diferencia_excel", "pendiente", "distintas"]]);
  });

  it("«Sigue vigente» reconoce la diferencia; «Desactivar» desactiva con motivo; ambas se pueden hacer en lote", async () => {
    expect((await resolver({ tipo: "ya_no_esta", claves: [`y-${ids.huerfana}`], accion: "sigue_vigente", motivo: MOTIVO })).statusCode).toBe(200);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.huerfana } })).activa).toBe(true);
    expect((await filaDe(`y-${ids.huerfana}`))).toMatchObject({ estado: "decidida", decision: { accion: "sigue_vigente" } });
    const r = await resolver({ tipo: "ya_no_esta", claves: [`y-${ids.viejaB}`], accion: "desactivar", motivo: MOTIVO }, jefa);
    expect(r.json().datos).toEqual({ resueltas: 1 });
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.viejaB } })).activa).toBe(false);
    expect(await prisma.historialCambio.count({ where: { obligacionId: ids.viejaB, accion: "desactivar_diferencia" } })).toBe(1);
    expect(await prisma.historialCambio.count({ where: { obligacionId: ids.viejaB, accion: "desactivar" } })).toBe(1);
    // una desactivada ya no es diferencia, pero se ve decidida desde su propia decisión
    expect(await filaDe(`y-${ids.viejaB}`)).toMatchObject({ tipo: "ya_no_esta", estado: "decidida", decision: { accion: "desactivar" } });
  });

  it("«Mantener el de la plataforma» reconoce la diferencia sin cambiar el día", async () => {
    expect((await resolver({ tipo: "dia_distinto", claves: [`d-${ids.diaEd}`], accion: "mantener_plataforma", motivo: MOTIVO })).statusCode).toBe(200);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.diaEd } })).diaEsperadoPago).toBe(12);
    expect(await prisma.cambioDia.count()).toBe(0);
    expect((await filaDe(`d-${ids.diaEd}`))).toMatchObject({ estado: "decidida", decision: { accion: "mantener_plataforma" } });
  });

  it("«Usar el del Excel» usa el cambio permanente: mismo «Desde el mes», misma pregunta del mes en curso y su propia línea del historial", async () => {
    const clave = `d-${ids.diaEd}`;
    const c = { tipo: "dia_distinto", claves: [clave], accion: "usar_excel", motivo: MOTIVO };
    // desde el mes: obligatorio, válido y no pasado (las mismas reglas del paso 6)
    for (const desdeMes of [undefined, "2026-08", "2026-13"]) {
      const r = await resolver({ ...c, desdeMes });
      expect(r.statusCode, String(desdeMes)).toBe(422);
      expect(r.json().campo, String(desdeMes)).toBe("desdeMes");
    }
    // un mes posterior con el pago de este mes pendiente: se pregunta
    const pregunta = await resolver({ ...c, desdeMes: "2026-11" });
    expect(pregunta.statusCode).toBe(422);
    expect(pregunta.json().campo).toBe("aplicaAlMesEnCurso");
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.cambioDia.count()).toBe(0);
    const r = await resolver({ ...c, desdeMes: "2026-11", aplicaAlMesEnCurso: false });
    expect(r.statusCode, JSON.stringify(r.json())).toBe(200);
    const cambio = await prisma.cambioDia.findFirstOrThrow();
    expect(cambio).toMatchObject({ tipo: "permanente", obligacionId: ids.diaEd, diaAnterior: 12, diaNuevo: 20, aplicaDesde: "2026-11", motivo: MOTIVO });
    const v = await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: ids.diaEd, periodo: "2026-11" } });
    expect(v.fecha.toISOString().slice(0, 10)).toBe("2026-11-20");
    const h = await prisma.historialCambio.findMany({ where: { obligacionId: ids.diaEd }, orderBy: { id: "asc" } });
    expect(h.map((x) => [x.accion, x.campo, x.antes, x.despues])).toEqual([["cambiar_dia", "diaEsperadoPago", "12", "20 desde 2026-11"], ["usar_excel", "diferencia_excel", "pendiente", "excel"]]);
    expect(await filaDe(clave)).toMatchObject({ estado: "decidida", decision: { accion: "usar_excel" } });
  });

  it("«Usar el del Excel» desde el mes en curso cambia el día y la diferencia desaparece (queda como decidida)", async () => {
    const r = await resolver({ tipo: "dia_distinto", claves: [`d-${ids.diaEd}`], accion: "usar_excel", motivo: MOTIVO, desdeMes: "2026-09" });
    expect(r.statusCode, JSON.stringify(r.json())).toBe(200);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.diaEd } })).diaEsperadoPago).toBe(20);
    expect(await filaDe(`d-${ids.diaEd}`)).toMatchObject({ estado: "decidida", decision: { accion: "usar_excel" } });
    expect((await listar(jefa)).resumen.dia_distinto).toBe(0);
  });
});

describe("la decisión y los datos que cambian", () => {
  it("una diferencia decidida no reaparece mientras los datos no cambian; si cambian, vuelve a aparecer y la decisión anterior se cierra sin borrarse", async () => {
    const clave = `d-${ids.diaEd}`;
    await resolver({ tipo: "dia_distinto", claves: [clave], accion: "mantener_plataforma", motivo: MOTIVO });
    expect((await listar(jefa)).pendientes).toBe(3);
    expect((await listar(jefa)).pendientes).toBe(3); // sigue igual
    // el Excel trae ahora otro día: es otra diferencia
    filasExcel![2] = fila(4, "AAA", cat1.nombre, "Dia Editado", "9000001", 25);
    expect(await filaDe(clave)).toMatchObject({ estado: "pendiente", decision: null });
    expect((await listar(jefa)).pendientes).toBe(4);
    expect((await resolver({ tipo: "dia_distinto", claves: [clave], accion: "mantener_plataforma", motivo: "Se vuelve a confirmar" })).statusCode).toBe(200);
    const todas = await prisma.decisionManual.findMany({ where: { tipo: "diferencia_excel" }, orderBy: { id: "asc" } });
    expect(todas.map((d) => [d.vigente, d.motivo])).toEqual([[false, MOTIVO], [true, "Se vuelve a confirmar"]]);
    expect(todas[0]).toMatchObject({ revertidaPorId: ana, nombreRevierte: "Ana Uno", motivoReversion: "Los datos cambiaron" });
    expect(todas[0]!.revertidaEn).toBeInstanceOf(Date);
  });
});

describe("historial y atomicidad", () => {
  it("si falla el registro no queda nada a medias: ni la desactivación, ni la decisión, ni el historial", async () => {
    const { filas } = await (await import("../src/diferencias/servicio.js")).listarDiferencias(async () => filasExcel);
    const dif = filas.find((f) => f.clave === `r-${ids.vieja}-${ids.nueva}`)!;
    const falla = resolverDiferencia({ diferencia: dif, accion: "es_la_misma", motivo: MOTIVO, autor: { id: 987_654, nombre: "No existe", modoPruebas: false } }, reloj);
    await expect(falla).rejects.toThrow();
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.vieja } })).activa).toBe(true);
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    // «Usar el del Excel» tampoco deja un cambio de día sin su decisión
    const dia = filas.find((f) => f.clave === `d-${ids.diaEd}`)!;
    await expect(resolverDiferencia({ diferencia: dia, accion: "usar_excel", motivo: MOTIVO, desdeMes: "2026-09", autor: { id: 987_654, nombre: "No existe", modoPruebas: false } }, reloj)).rejects.toThrow();
    expect(await prisma.cambioDia.count()).toBe(0);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.diaEd } })).diaEsperadoPago).toBe(12);
  });

  it("el Historial de cambios lista las líneas nuevas sin identificadores completos", async () => {
    await resolver({ tipo: "posible_renombre", claves: [`r-${ids.vieja}-${ids.nueva}`], accion: "es_la_misma", motivo: MOTIVO });
    await resolver({ tipo: "dia_distinto", claves: [`d-${ids.diaEd}`], accion: "mantener_plataforma", motivo: MOTIVO });
    const r = await pedir("GET", "/api/historial-cambios?porPagina=50", jefa);
    expect(r.statusCode).toBe(200);
    const datos = r.json().datos as { accion: string; campo: string; antes: string | null; despues: string | null; modoPruebas: boolean }[];
    expect(datos.filter((x) => x.campo === "diferencia_excel").map((x) => x.accion).sort()).toEqual(["es_la_misma", "mantener_plataforma"]);
    expect(datos.every((x) => x.modoPruebas)).toBe(true);
    expect(JSON.stringify(r.json())).not.toMatch(/7000001|7000002|9000001/);
    expect(r.json().opciones.campos ?? r.json().opciones).toBeDefined();
  });
});

describe("de la API a lo que se lee en el Historial (de punta a punta)", () => {
  it("las líneas reales pasan por las funciones del Frontend: dos valores, nunca una flecha sola, grupo «Decisiones manuales»", async () => {
    const { resolve } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const f = (await import(/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "../Frontend/src/lib/formato.ts")).href)) as {
      cambioEnPalabras: (x: { accion: string; campo: string; antes: string | null; despues: string | null }) => { tipo: string; antes?: string; despues?: string };
      rotuloDeFila: (x: { accion: string; campo: string; antes?: string | null; despues?: string | null }) => string;
      agruparCampos: (c: string[]) => { titulo: string; campos: string[] }[];
    };
    await resolver({ tipo: "posible_renombre", claves: [`r-${ids.vieja}-${ids.nueva}`], accion: "es_la_misma", motivo: MOTIVO });
    await resolver({ tipo: "ya_no_esta", claves: [`y-${ids.huerfana}`], accion: "desactivar", motivo: MOTIVO });
    await resolver({ tipo: "dia_distinto", claves: [`d-${ids.diaEd}`], accion: "mantener_plataforma", motivo: MOTIVO });
    const filas = ((await pedir("GET", "/api/historial-cambios?porPagina=50&campo=diferencia_excel", jefa)).json().datos as { accion: string; campo: string; antes: string | null; despues: string | null }[]);
    expect(filas.length).toBe(3);
    for (const fila of filas) {
      expect(f.rotuloDeFila(fila)).toBe("Diferencia con el Excel");
      const c = f.cambioEnPalabras(fila);
      expect(c.tipo, fila.accion).toBe("valores");
      expect(c.antes && c.despues, fila.accion).toBeTruthy();
    }
    expect(f.cambioEnPalabras(filas.find((x) => x.accion === "es_la_misma")!)).toEqual({ tipo: "valores", antes: "Pendiente", despues: "Misma que Nueva Tel" });
    expect(f.agruparCampos(["diferencia_excel"])).toEqual([{ titulo: "Decisiones manuales", campos: ["diferencia_excel"] }]);
  });
});
