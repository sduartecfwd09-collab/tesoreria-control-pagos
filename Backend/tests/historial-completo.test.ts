import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import type { FilaCatalogo } from "../src/catalogo/lector.js";
import { prisma } from "../src/db.js";
import { ACCIONES_HISTORIAL, CAMPOS_HISTORIAL } from "../src/domain/historial.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { generarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// El Historial de cambios muestra TODO lo que se registra: cada acción se resuelve por la ruta real, se lee por GET /api/historial-cambios con y sin el filtro
// «Qué cambió», y se pasa por las funciones del Frontend. Además, una prueba falla si un campo o una acción nuevos quedan fuera del mapa de grupos, de los
// rótulos o de la lectura. Datos inventados; el Excel se simula con filas sintéticas. Hoy = 2026-09-10.
const reloj = () => new Date(2026, 8, 10, 10, 0);
const enc = (id: number) => ({ "x-usuario-actual": String(id) });

interface Formato {
  rotuloDeCampo: (c: string) => string;
  rotuloDeFila: (x: { accion: string; campo: string; antes?: string | null; despues?: string | null }) => string;
  cambioEnPalabras: (x: { accion: string; campo: string; antes: string | null; despues: string | null }) => { tipo: string; antes?: string; despues?: string };
  agruparCampos: (c: string[]) => { titulo: string; campos: string[] }[];
  GRUPOS_DE_CAMPOS: { titulo: string; campos: string[] }[];
}
const cargarFormato = async () => (await import(/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "../Frontend/src/lib/formato.ts")).href)) as Formato;

let filasExcel: FilaCatalogo[] = [];
let app: Awaited<ReturnType<typeof crearApp>>;
let jefa: number;
let ana: number;
const ids: Record<string, number> = {};
type LineaApi = { accion: string; campo: string; antes: string | null; despues: string | null; sociedad: string | null };
const pedir = (metodo: "GET" | "POST", url: string, actor: number, payload?: object) => app.inject({ method: metodo, url, headers: enc(actor), ...(payload ? { payload } : {}) });
const leer = async (q = "") => (await pedir("GET", `/api/historial-cambios?porPagina=100${q}`, jefa)).json() as { datos: LineaApi[]; opciones: { campos: string[] } };

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
  jefa = await persona("jefa@x.cr", "Jefa Tres", "Jefatura");
  const sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  const [c1, c2] = await prisma.categoria.findMany({ orderBy: { id: "asc" }, take: 2 });
  const crear = async (clave: string, categoriaId: number, proveedor: string, identificador: string, dia: number, extra: object = {}) => {
    ids[clave] = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor, identificador, diaEsperadoPago: dia, ...extra } })).id;
  };
  await crear("vieja", c2!.id, "Vieja Tel", "7000001", 10);
  await crear("nueva", c2!.id, "Nueva Tel", "7000002", 10);
  await crear("huerfana", c1!.id, "Huerfana", "8000001", 5);
  await crear("diaEd", c1!.id, "Dia Editado", "9000001", 12, { diaEditado: true });
  await generarRango("2026-08", "2026-11");
  const fila = (n: number, categoria: string, proveedor: string, identificador: string, dia: number): FilaCatalogo => ({ fila: n, sociedad: "AAA", categoria, proveedor, identificador, dia, estado: null });
  filasExcel = [fila(2, c2!.nombre, "Nueva Tel", "7000002", 10), fila(3, c1!.nombre, "Dia Editado", "9000001", 20)];
});

/** Cada acción de «Diferencias con el Excel»: la diferencia que resuelve y lo que debe leerse en el Historial. */
const CASOS = [
  { accion: "es_la_misma", tipo: "posible_renombre", clave: () => `r-${ids.vieja}-${ids.nueva}`, historial: "es_la_misma", antes: "Pendiente", despues: "Misma que Nueva Tel", extra: {} },
  { accion: "son_distintas", tipo: "posible_renombre", clave: () => `r-${ids.vieja}-${ids.nueva}`, historial: "son_distintas", antes: "Pendiente", despues: "Son distintas", extra: {} },
  { accion: "sigue_vigente", tipo: "ya_no_esta", clave: () => `y-${ids.huerfana}`, historial: "sigue_vigente", antes: "Pendiente", despues: "Sigue vigente", extra: {} },
  { accion: "desactivar", tipo: "ya_no_esta", clave: () => `y-${ids.huerfana}`, historial: "desactivar_diferencia", antes: "Pendiente", despues: "Desactivada", extra: {} },
  { accion: "mantener_plataforma", tipo: "dia_distinto", clave: () => `d-${ids.diaEd}`, historial: "mantener_plataforma", antes: "Pendiente", despues: "Se mantiene el de la plataforma", extra: {} },
  { accion: "usar_excel", tipo: "dia_distinto", clave: () => `d-${ids.diaEd}`, historial: "usar_excel", antes: "Pendiente", despues: "Se usa el del Excel", extra: { desdeMes: "2026-09" } },
] as const;

describe("de punta a punta: resolver, leer con y sin el filtro, y pasar por el Frontend", () => {
  it.each(CASOS)("«$accion»: la línea está en la lectura, sale con el filtro «Diferencia con el Excel» y no con otro, y se lee «$antes → $despues»", async (caso) => {
    const f = await cargarFormato();
    const r = await pedir("POST", "/api/diferencias-excel/resolver", ana, { tipo: caso.tipo, claves: [caso.clave()], accion: caso.accion, motivo: "Lo confirmó Tesorería", ...caso.extra });
    expect(r.statusCode, JSON.stringify(r.json())).toBe(200);

    // sin filtro: la línea está; el filtro la deja; otro filtro la excluye; y la opción existe en la lista del filtro
    const todo = await leer();
    const linea = todo.datos.find((x) => x.accion === caso.historial);
    expect(linea, `falta la línea ${caso.historial} en la lectura`).toBeDefined();
    expect(linea!.campo).toBe("diferencia_excel");
    expect(todo.opciones.campos).toContain("diferencia_excel");
    const filtrada = await leer("&campo=diferencia_excel");
    expect(filtrada.datos.map((x) => x.accion)).toEqual([caso.historial]);
    expect((await leer("&campo=fecha_vencimiento")).datos.some((x) => x.campo === "diferencia_excel")).toBe(false);

    // la opción cae en «Decisiones manuales» (el mapa único) y la línea se lee con sus antes y después
    expect(f.agruparCampos(todo.opciones.campos).find((g) => g.campos.includes("diferencia_excel"))!.titulo).toBe("Decisiones manuales");
    expect(f.rotuloDeCampo("diferencia_excel")).toBe("Diferencia con el Excel");
    expect(f.rotuloDeFila(linea!)).toBe("Diferencia con el Excel");
    expect(f.cambioEnPalabras(linea!)).toEqual({ tipo: "valores", antes: caso.antes, despues: caso.despues });
    expect(JSON.stringify(todo)).not.toMatch(/7000001|7000002|8000001|9000001/); // sin identificadores completos
  });

  it("un tesorero con la diferencia dentro de su sociedad también la ve y ve la opción del filtro", async () => {
    await pedir("POST", "/api/diferencias-excel/resolver", ana, { tipo: "ya_no_esta", claves: [`y-${ids.huerfana}`], accion: "sigue_vigente", motivo: "Lo confirmó Tesorería" });
    const r = (await pedir("GET", "/api/historial-cambios?campo=diferencia_excel", ana)).json() as { datos: LineaApi[]; opciones: { campos: string[] } };
    expect(r.datos.map((x) => x.accion)).toEqual(["sigue_vigente"]);
    expect(r.opciones.campos).toContain("diferencia_excel");
  });
});

describe("nada queda fuera: campos y acciones del Historial", () => {
  // el campo principal con el que cada acción se registra (si falta una acción nueva aquí, la prueba falla y hay que declararla)
  const CAMPO_DE_ACCION: Record<(typeof ACCIONES_HISTORIAL)[number], (typeof CAMPOS_HISTORIAL)[number]> = {
    crear: "obligacion", editar: "frecuencia", activar: "activa", desactivar: "activa", asociar_pago: "pago_asociado", quitar_asociacion: "pago_asociado",
    justificar: "justificacion_vencimiento", quitar_justificacion: "justificacion_vencimiento", marcar_revisada: "revision_obligacion", quitar_revision: "revision_obligacion",
    mover_fecha: "fecha_vencimiento", quitar_movimiento: "fecha_vencimiento", cambiar_dia: "diaEsperadoPago", es_la_misma: "diferencia_excel", son_distintas: "diferencia_excel",
    sigue_vigente: "diferencia_excel", desactivar_diferencia: "diferencia_excel", mantener_plataforma: "diferencia_excel", usar_excel: "diferencia_excel",
  };

  it("cada campo tiene rótulo y está en un solo grupo del filtro «Qué cambió»", async () => {
    const f = await cargarFormato();
    const enGrupos = f.GRUPOS_DE_CAMPOS.flatMap((g) => g.campos);
    expect(new Set(enGrupos).size).toBe(enGrupos.length); // un único mapa campo -> grupo
    for (const campo of CAMPOS_HISTORIAL) {
      expect(f.rotuloDeCampo(campo), `«${campo}» no tiene rótulo en el Frontend`).not.toBe("Otro dato");
      expect(enGrupos, `«${campo}» no está en ningún grupo del filtro`).toContain(campo);
    }
    // y el mapa no guarda campos que el Backend ya no registra
    for (const campo of enGrupos) expect(CAMPOS_HISTORIAL as readonly string[], `«${campo}» sobra en el mapa de grupos`).toContain(campo);
  });

  it("cada acción se lee con dos valores legibles (nunca una flecha sola ni «Otro valor» por no conocerla)", async () => {
    const f = await cargarFormato();
    for (const accion of ACCIONES_HISTORIAL) {
      const campo = CAMPO_DE_ACCION[accion];
      expect(campo, `declare el campo de la acción «${accion}»`).toBeDefined();
      const c = f.cambioEnPalabras({ accion, campo, antes: null, despues: null });
      if (accion === "crear") {
        expect(c.tipo).toBe("vacio");
        continue;
      }
      if (campo === "montoEsperado") continue;
      expect(c.tipo, accion).toBe("valores");
      expect(c.antes && c.despues, accion).toBeTruthy();
      // una acción que el Frontend no conoce caería en «Otro valor» a ambos lados
      if (accion !== "editar" && accion !== "activar" && accion !== "desactivar") expect([c.antes, c.despues], `«${accion}» no tiene lectura en cambioEnPalabras`).not.toEqual(["Otro valor", "Otro valor"]);
    }
  });

  it("la lectura del Backend acepta y devuelve cualquier campo y acción registrados (no hay una lista que deje alguno fuera)", async () => {
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { id: jefa } });
    for (const accion of ACCIONES_HISTORIAL) {
      await prisma.historialCambio.create({
        data: { entidad: "obligacion", entidadId: ids.vieja!, obligacionId: ids.vieja!, accion, campo: CAMPO_DE_ACCION[accion], usuarioId: usuario.id, nombreUsuario: usuario.nombre, modoPruebas: true },
      });
    }
    for (const campo of CAMPOS_HISTORIAL) {
      await prisma.historialCambio.create({ data: { entidad: "obligacion", entidadId: ids.vieja!, obligacionId: ids.vieja!, accion: "editar", campo, usuarioId: usuario.id, nombreUsuario: usuario.nombre, modoPruebas: true } });
    }
    const todo = await leer();
    expect(new Set(todo.datos.map((x) => x.accion))).toEqual(new Set(ACCIONES_HISTORIAL));
    for (const campo of CAMPOS_HISTORIAL) {
      expect(todo.opciones.campos, `«${campo}» no sale en las opciones del filtro`).toContain(campo);
      expect((await leer(`&campo=${campo}`)).datos.every((x) => x.campo === campo), campo).toBe(true);
    }
  });
});
