import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { calidadCatalogo, estadoDeObligacion, etiquetasDe, identificadoresRepetidos } from "../src/domain/obligaciones.js";
import { ErrorDeServicio } from "../src/domain/permisos.js";
import { sincronizarCatalogo } from "../src/repositories/obligaciones.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { marcarRevisada } from "../src/revisiones/obligacion.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// «Revisada»: permisos, reglas, efecto de la huella (incluida una reimportación del Excel simulada), conteos, reversión e historial. Datos inventados.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const enc = (id: number) => ({ "x-usuario-actual": String(id) });
const IBAN = "CR05015202001026284066";

let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let categoriaId: number;
let categoriaNombre: string;
const ids: Record<string, number> = {};

const pedir = (metodo: "GET" | "POST" | "PATCH", url: string, actor: number | null, payload?: object) =>
  app.inject({ method: metodo, url, headers: actor === null ? {} : enc(actor), ...(payload ? { payload } : {}) });
const marcar = (clave: string, nota: unknown = "Falta el dato en el catálogo del proveedor", actor: number | null = ana) =>
  pedir("POST", `/api/obligaciones/${ids[clave]}/marcar-revisada`, actor, { nota });
const quitar = (clave: string, motivo: unknown = "Se corrigió el catálogo", actor: number | null = ana) =>
  pedir("POST", `/api/obligaciones/${ids[clave]}/quitar-revision`, actor, { motivo });
type Fila = { id: number; proveedor: string; estado: string; etiquetas: { codigo: string }[]; puedeGestionar: boolean; revision: { quien: string; nota: string; cuando: string; sinEfecto: boolean } | null };
const lista = async (actor: number | null = jefa) => (await pedir("GET", "/api/obligaciones?porPagina=100", actor)).json().datos as Fila[];
const fila = async (clave: string, actor: number | null = jefa) => (await lista(actor)).find((x) => x.id === ids[clave])!;
const resumen = async (actor = jefa) => (await pedir("GET", "/api/obligaciones/resumen", actor)).json().datos;

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
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  const cat = await prisma.categoria.findFirstOrThrow();
  categoriaId = cat.id;
  categoriaNombre = cat.nombre;
  const crear = async (clave: string, sociedadId: number, proveedor: string, identificador: string, extra: object = {}) => {
    ids[clave] = (await prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 10, ...extra } })).id;
  };
  await crear("sinDia", sociedadA, "SinDia", "1000001", { diaEsperadoPago: null });
  await crear("mesFalta", sociedadA, "MesFalta", "1000002", { frecuencia: "anual", mesArranque: null, diaEsperadoPago: 5 });
  await crear("iban", sociedadA, "Iban", IBAN, { diaEsperadoPago: 10 });
  await crear("repUno", sociedadA, "RepUno", "1000003", { diaEsperadoPago: 3 });
  await crear("repDos", sociedadA, "RepDos", "1000003", { diaEsperadoPago: 4 });
  await crear("ok", sociedadA, "Ok", "1000004", { diaEsperadoPago: 6 });
  await crear("inactiva", sociedadA, "Inactiva", "1000005", { diaEsperadoPago: null, activa: false });
  await crear("sinDiaB", sociedadB, "SinDiaB", "2000001", { diaEsperadoPago: null });
});

describe("permisos", () => {
  it("sin persona 401; un tesorero ajeno 403; el tesorero propio y Jefatura sí; 404 y 400; sin modo de pruebas no hay persona", async () => {
    for (const [ruta, cuerpo] of [["marcar-revisada", { nota: "Prueba de permiso" }], ["quitar-revision", { motivo: "Prueba de permiso" }]] as const) {
      const url = `/api/obligaciones/${ids.sinDia}/${ruta}`;
      expect((await pedir("POST", url, null, cuerpo)).statusCode, ruta).toBe(401);
      const ajeno = await pedir("POST", url, beto, cuerpo);
      expect(ajeno.statusCode, ruta).toBe(403);
      expect(ajeno.json()).toEqual({ error: expect.any(String) });
      expect((await pedir("POST", url, ana, cuerpo)).statusCode, ruta).not.toBe(403);
      expect((await pedir("POST", url, jefa, cuerpo)).statusCode, ruta).not.toBe(403);
      expect((await pedir("POST", `/api/obligaciones/999999/${ruta}`, ana, cuerpo)).statusCode, ruta).toBe(404);
      expect((await pedir("POST", `/api/obligaciones/0/${ruta}`, ana, cuerpo)).statusCode, ruta).toBe(400);
    }
    const sinModo = await crearApp({ reloj, modoPruebas: false });
    try {
      expect((await sinModo.inject({ method: "POST", url: `/api/obligaciones/${ids.sinDia}/marcar-revisada`, headers: enc(ana), payload: { nota: "Prueba de permiso" } })).statusCode).toBe(401);
    } finally {
      await sinModo.close();
    }
  });
});

describe("reglas de negocio y validación", () => {
  it("nota obligatoria (3 a 300): 422 con el campo y nada guardado", async () => {
    // sin la nota en el cuerpo
    expect((await pedir("POST", `/api/obligaciones/${ids.sinDia}/marcar-revisada`, ana, {})).json().campo).toBe("nota");
    for (const nota of [null, "", "  ", "ab", "x".repeat(301), 123]) {
      const r = await marcar("sinDia", nota);
      expect(r.statusCode, String(nota)).toBe(422);
      expect(r.json().campo).toBe("nota");
    }
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect((await marcar("sinDia", "x".repeat(300))).statusCode).toBe(200);
  });

  it("409 si no está «En revisión» (sin causas, inactiva) o ya está revisada con efecto", async () => {
    expect((await marcar("ok")).statusCode).toBe(409);
    expect((await marcar("inactiva")).statusCode).toBe(409);
    expect(await prisma.decisionManual.count()).toBe(0);
    expect((await marcar("sinDia")).statusCode).toBe(200);
    expect((await marcar("sinDia")).statusCode).toBe(409);
  });

  it("quitar: 409 si no hay revisión; motivo 422 (3 a 300)", async () => {
    expect((await quitar("sinDia")).statusCode).toBe(409);
    await marcar("sinDia");
    for (const motivo of [null, "", "ab", "x".repeat(301)]) {
      const r = await quitar("sinDia", motivo);
      expect(r.statusCode, String(motivo)).toBe(422);
      expect(r.json().campo).toBe("motivo");
    }
    expect((await prisma.decisionManual.findFirstOrThrow()).vigente).toBe(true);
  });
});

describe("marcar como revisada", () => {
  it("queda «Revisada» (con su nota y las causas a la vista de la ficha), con la decisión y su línea del historial, sin identificadores completos", async () => {
    const antes = await fila("iban");
    expect(antes).toMatchObject({ estado: "en_revision", puedeGestionar: true, revision: null });
    expect(antes.etiquetas.map((e) => e.codigo)).toEqual(["formato_iban"]);

    const r = await marcar("iban", "  El proveedor solo da su cuenta   bancaria  ");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ estado: "revisada" });
    const f = await fila("iban");
    expect(f).toMatchObject({ estado: "revisada", puedeGestionar: true, revision: { quien: "Ana Uno", nota: "El proveedor solo da su cuenta bancaria", sinEfecto: false } });
    expect(f.etiquetas.map((e) => e.codigo)).toEqual(["formato_iban"]); // la causa sigue siendo real; la pantalla deja vacía «Observaciones»
    const d = await prisma.decisionManual.findFirstOrThrow();
    expect(d).toMatchObject({
      tipo: "revision_obligacion", sociedadId: sociedadA, obligacionId: ids.iban, periodo: null, motivo: "El proveedor solo da su cuenta bancaria", usuarioId: ana, nombreUsuario: "Ana Uno",
      modoPruebas: true, vigente: true, unicaObligacionPeriodo: `r|${ids.iban}`, unicaMovimiento: null, claveMovimiento: null,
    });
    expect(d.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(d.datos!)).toEqual({ causas: ["formato_iban"] });
    const h = await prisma.historialCambio.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      entidad: "obligacion", entidadId: ids.iban, obligacionId: ids.iban, sociedadId: sociedadA, accion: "marcar_revisada", campo: "revision_obligacion", antes: "en_revision", despues: "revisada",
      motivo: "El proveedor solo da su cuenta bancaria", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true,
    });
    for (const prohibido of [IBAN, "1000001"]) expect(JSON.stringify(h), prohibido).not.toContain(prohibido);
    // un tesorero ajeno no la ve en su lista; el detalle (GET por id) trae la misma información
    expect((await lista(beto)).map((x) => x.id)).toEqual([ids.sinDiaB]);
    const det = (await pedir("GET", `/api/obligaciones/${ids.iban}`, ana)).json().datos as Fila;
    expect(det).toMatchObject({ estado: "revisada", revision: { quien: "Ana Uno" } });
  });

  it("las demás en revisión siguen igual; una «Revisada» sale de los conteos de IBAN e identificador repetido, pero «Falta día» y «Falta mes de arranque» siguen contando el dato faltante", async () => {
    const antes = await resumen();
    expect(antes).toMatchObject({ sinDia: 2, sinDiaRevisadas: 0, sinMesArranque: 1, sinMesArranqueRevisadas: 0 });
    expect(antes.formatoIban).toHaveLength(1);
    expect(antes.identificadoresRepetidos).toHaveLength(1);

    await marcar("sinDia");
    await marcar("mesFalta");
    await marcar("iban");
    const r1 = await resumen();
    expect(r1).toMatchObject({ sinDia: 2, sinDiaRevisadas: 1, sinMesArranque: 1, sinMesArranqueRevisadas: 1 }); // el dato faltante sigue contando
    expect(r1.formatoIban).toHaveLength(0); // sale de su conteo
    expect(r1.identificadoresRepetidos).toHaveLength(1);
    // un grupo repetido solo desaparece si todas sus obligaciones están revisadas
    await marcar("repUno");
    expect((await resumen()).identificadoresRepetidos).toHaveLength(1);
    await marcar("repDos");
    expect((await resumen()).identificadoresRepetidos).toHaveLength(0);
    // el filtro de «Falta día» sigue encontrando la revisada (no se esconde el hueco)
    const sinDia = (await pedir("GET", "/api/obligaciones?falta=dia&activa=true", jefa)).json().datos as Fila[];
    expect(sinDia.map((x) => x.id).sort()).toEqual([ids.sinDia, ids.sinDiaB].sort());
    expect(sinDia.find((x) => x.id === ids.sinDia)!.estado).toBe("revisada");
    // el tesorero ve solo lo suyo
    expect(await resumen(ana)).toMatchObject({ sinDia: 1, sinDiaRevisadas: 1 });
    expect(await resumen(beto)).toMatchObject({ sinDia: 1, sinDiaRevisadas: 0 });
  });

  it("la revisión no genera vencimientos: si el dato faltante lo impide, siguen sin generarse", async () => {
    await marcar("sinDia");
    expect(await prisma.vencimiento.count({ where: { obligacionId: ids.sinDia } })).toBe(0);
    expect((await fila("sinDia")).estado).toBe("revisada");
  });
});

describe("sin efecto: cambian los datos o la causa", () => {
  it("al completar el dato cambia la causa: queda sin efecto, la decisión sigue vigente y, si sigue otra causa, vuelve a «En revisión»", async () => {
    // una obligación con dos causas: falta día y formato de IBAN
    ids.doble = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "Doble", identificador: "CR05015202001026284077", diaEsperadoPago: null } })).id;
    await marcar("doble");
    expect((await fila("doble")).estado).toBe("revisada");
    const patch = await pedir("PATCH", `/api/obligaciones/${ids.doble}`, ana, { diaEsperadoPago: 12 });
    expect(patch.statusCode).toBe(200);
    expect(await fila("doble")).toMatchObject({ estado: "en_revision", puedeGestionar: true, revision: { nota: "Falta el dato en el catálogo del proveedor", sinEfecto: true } });
    expect(await prisma.decisionManual.count({ where: { vigente: true } })).toBe(1); // no se borra ni se cierra
  });

  it("si desaparece la última causa la obligación queda «Activa» (la revisión inerte no estorba)", async () => {
    await marcar("sinDia");
    await pedir("PATCH", `/api/obligaciones/${ids.sinDia}`, ana, { diaEsperadoPago: 15 });
    expect(await fila("sinDia")).toMatchObject({ estado: "activa", puedeGestionar: false, revision: { sinEfecto: true } });
    expect((await resumen()).sinDiaRevisadas).toBe(0);
  });

  it("una reimportación del Excel que cambia el día deja la revisión sin efecto sin tocar la decisión; con el mismo contenido sigue vigente", async () => {
    await marcar("iban");
    const filaCatalogo = (dia: number) => ({ fila: 2, sociedad: "AAA", categoria: categoriaNombre, proveedor: "Iban", identificador: IBAN, dia, estado: null });
    await sincronizarCatalogo([filaCatalogo(10)], "mensual"); // mismo día: nada cambia
    expect((await fila("iban")).estado).toBe("revisada");
    const antes = await prisma.decisionManual.findFirstOrThrow();
    await sincronizarCatalogo([filaCatalogo(20)], "mensual"); // el Excel trae otro día
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.iban } })).diaEsperadoPago).toBe(20);
    expect(await fila("iban")).toMatchObject({ estado: "en_revision", revision: { sinEfecto: true } });
    expect(await prisma.decisionManual.findFirstOrThrow()).toEqual(antes); // la decisión quedó intacta
    // si el Excel vuelve a traer el día de antes, la misma huella vuelve a tener efecto
    await sincronizarCatalogo([filaCatalogo(10)], "mensual");
    expect((await fila("iban")).estado).toBe("revisada");
  });

  it("un proveedor nuevo con el mismo identificador cambia el grupo repetido: sin efecto", async () => {
    await marcar("repUno");
    expect((await fila("repUno")).estado).toBe("revisada");
    await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "RepTres", identificador: "1000003", diaEsperadoPago: 7 } });
    expect(await fila("repUno")).toMatchObject({ estado: "en_revision", revision: { sinEfecto: true } });
    // lo irrelevante no la afecta: monto, cuenta, moneda y activa de otra obligación
    await prisma.obligacion.update({ where: { id: ids.repDos }, data: { montoEsperado: 12345n } });
    expect((await fila("repUno")).revision!.sinEfecto).toBe(true); // sigue sin efecto (el cambio de arriba no se deshizo)
  });

  it("lo irrelevante no afecta la revisión: monto, cuenta, moneda, «Control desde» y activa de la misma obligación", async () => {
    await marcar("sinDia");
    const patch = await pedir("PATCH", `/api/obligaciones/${ids.sinDia}`, ana, { montoEsperado: 99999, moneda: "USD", controlDesde: "2026-12" });
    expect(patch.statusCode).toBe(200);
    expect((await fila("sinDia")).estado).toBe("revisada");
  });

  it("al volver a marcar una revisión sin efecto, la anterior se cierra (no se borra) y la nueva queda vigente", async () => {
    ids.doble = (await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId, proveedor: "Doble", identificador: "CR05015202001026284077", diaEsperadoPago: null } })).id;
    await marcar("doble", "Primera nota");
    await pedir("PATCH", `/api/obligaciones/${ids.doble}`, ana, { diaEsperadoPago: 12 });
    expect((await marcar("doble", "Segunda nota")).statusCode).toBe(200);
    const todas = await prisma.decisionManual.findMany({ orderBy: { id: "asc" } });
    expect(todas.map((x) => [x.vigente, x.motivo])).toEqual([[false, "Primera nota"], [true, "Segunda nota"]]);
    expect(todas[0]!.motivoReversion).toBe("Los datos o la causa de la revisión cambiaron");
    expect((await fila("doble")).revision).toMatchObject({ nota: "Segunda nota", sinEfecto: false });
  });
});

describe("reversión e invariantes", () => {
  it("quitar la revisión vuelve a «En revisión», queda no vigente (nada se borra) y se anota en el historial; se puede volver a marcar", async () => {
    await marcar("sinDia", "Nota inicial");
    expect((await quitar("sinDia", "  Se corrigió   el catálogo ")).statusCode).toBe(200);
    expect(await fila("sinDia")).toMatchObject({ estado: "en_revision", revision: null });
    const filas = await prisma.decisionManual.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ vigente: false, unicaObligacionPeriodo: null, revertidaPorId: ana, nombreRevierte: "Ana Uno", motivoReversion: "Se corrigió el catálogo" });
    expect(filas[0]!.revertidaEn).toBeInstanceOf(Date);
    const h = await prisma.historialCambio.findMany({ orderBy: { id: "asc" } });
    expect(h.map((x) => [x.accion, x.campo, x.antes, x.despues, x.motivo])).toEqual([
      ["marcar_revisada", "revision_obligacion", "en_revision", "revisada", "Nota inicial"],
      ["quitar_revision", "revision_obligacion", "revisada", "en_revision", "Se corrigió el catálogo"],
    ]);
    expect((await quitar("sinDia")).statusCode).toBe(409);
    expect((await marcar("sinDia", "Otra nota")).statusCode).toBe(200);
    expect((await prisma.decisionManual.findMany({ orderBy: { id: "asc" } })).map((x) => x.vigente)).toEqual([false, true]);
  });

  it("una vigente por obligación (la base lo impide); la clave «r|» convive con las de justificaciones, archivos y asociaciones", async () => {
    await marcar("sinDia");
    const base = { sociedadId: sociedadA, obligacionId: ids.sinDia, motivo: "Prueba", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true };
    await expect(prisma.decisionManual.create({ data: { ...base, tipo: "revision_obligacion", unicaObligacionPeriodo: `r|${ids.sinDia}` } })).rejects.toThrow();
    await expect(prisma.decisionManual.create({ data: { ...base, tipo: "justificacion_vencimiento", periodo: "2026-10", unicaObligacionPeriodo: `j|${ids.sinDia}|2026-10` } })).resolves.toBeTruthy();
    await expect(prisma.decisionManual.create({ data: { ...base, tipo: "asociacion_pago", periodo: "2026-10", claveMovimiento: "z".repeat(40), unicaObligacionPeriodo: `${ids.sinDia}|2026-10`, unicaMovimiento: "z".repeat(40) } })).resolves.toBeTruthy();
  });

  it("si el registro falla, nada se guarda (misma transacción)", async () => {
    const o = await prisma.obligacion.findUniqueOrThrow({ where: { id: ids.sinDia } });
    const calidad = { ...o, montoEsperado: null, sociedad: "Sociedad AAA", responsable: null };
    await expect(marcarRevisada({ obligacion: { id: o.id, sociedadId: o.sociedadId, calidad, repetidos: [] }, nota: "Prueba de rollback", autor: { id: 999_999, nombre: "Nadie", modoPruebas: true } })).rejects.toThrow();
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    await expect(marcarRevisada({ obligacion: { id: o.id, sociedadId: o.sociedadId, calidad: { ...calidad, diaEsperadoPago: 5 }, repetidos: [] }, nota: "Prueba", autor: { id: ana, nombre: "Ana Uno", modoPruebas: true } })).rejects.toBeInstanceOf(ErrorDeServicio);
  });
});

describe("sin decisiones los resultados son idénticos a los de siempre", () => {
  it("el estado y las observaciones de cada obligación son los que calculan las funciones de siempre, y el resumen no cambia salvo los campos nuevos en cero", async () => {
    const todas = await prisma.obligacion.findMany({ include: { sociedad: { include: { tesorero: { select: { nombre: true } } } } } });
    const calidades = todas.map((o) => ({ ...o, montoEsperado: null, sociedad: o.sociedad.nombreLargo, responsable: o.sociedad.tesorero?.nombre ?? null }));
    const repetidos = identificadoresRepetidos(calidades);
    for (const f of await lista()) {
      const c = calidades.find((x) => x.id === f.id)!;
      const antiguas = etiquetasDe(c, repetidos);
      expect(f.etiquetas.map((e) => e.codigo), f.proveedor).toEqual(antiguas.map((e) => e.codigo));
      expect(f.estado, f.proveedor).toBe(estadoDeObligacion(c.activa, antiguas));
      expect(f.revision).toBeNull();
    }
    const r = await resumen();
    const esperado = calidadCatalogo(calidades, [{ nombre: "Sociedad AAA", conEstados: false }, { nombre: "Sociedad BBB", conEstados: false }]);
    expect(r).toMatchObject({ sinDia: esperado.sinDia, sinMesArranque: esperado.sinMesArranque, sinDiaRevisadas: 0, sinMesArranqueRevisadas: 0 });
    expect(r.formatoIban).toHaveLength(esperado.formatoIban.length);
    expect(r.identificadoresRepetidos).toHaveLength(esperado.identificadoresRepetidos.length);
  });
});

// Las funciones que arman los textos del Historial viven en el Frontend (módulo puro, sin React ni red): se cargan tal cual para probar de punta a punta
// lo que devuelve la API real.
interface FormatoFrontend {
  rotuloDeFila: (f: { accion: string; campo: string; antes?: string | null; despues?: string | null }) => string;
  cambioEnPalabras: (f: { accion: string; campo: string; antes: string | null; despues: string | null }) => { tipo: string; antes?: string; despues?: string };
  agruparCampos: (campos: string[]) => { titulo: string; campos: string[] }[];
  rotuloDeCampo: (campo: string) => string;
  fraseRevisada: (r: { quien: string; cuando: string; nota: string }) => string;
}
const cargarFormato = async () => (await import(/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "../Frontend/src/lib/formato.ts")).href)) as FormatoFrontend;

describe("de la API a lo que se lee en el Historial y en la ficha (de punta a punta)", () => {
  it("marcar y quitar la revisión: los mismos objetos de la API pasan por las funciones del Frontend", async () => {
    const f = await cargarFormato();
    await marcar("iban", "El proveedor solo da su cuenta bancaria");
    const fichaFila = await fila("iban");
    expect(f.fraseRevisada(fichaFila.revision!)).toMatch(/^Revisada por Ana Uno el \d{1,2} [a-z]{3}( \d{4})?\. Nota: El proveedor solo da su cuenta bancaria\.$/);
    await quitar("iban", "Se corrigió el catálogo");

    type FilaH = { accion: string; campo: string; antes: string | null; despues: string | null; motivo: string | null; obligacion: { identificador: string } | null };
    const r = (await pedir("GET", "/api/historial-cambios", ana)).json() as { datos: FilaH[]; opciones: { campos: string[] } };
    const de = (accion: string) => r.datos.find((x) => x.accion === accion)!;
    const quePasa = (x: FilaH) => ({ que: f.rotuloDeFila(x), cambio: f.cambioEnPalabras(x) });
    expect(quePasa(de("marcar_revisada"))).toEqual({ que: "Revisión de la obligación", cambio: { tipo: "valores", antes: "En revisión", despues: "Revisada" } });
    expect(quePasa(de("quitar_revision"))).toEqual({ que: "Revisión de la obligación", cambio: { tipo: "valores", antes: "Revisada", despues: "En revisión" } });
    // la nota o el motivo va en la columna del motivo, y la obligación sale con su identificador enmascarado
    expect(de("marcar_revisada").motivo).toBe("El proveedor solo da su cuenta bancaria");
    expect(de("quitar_revision").motivo).toBe("Se corrigió el catálogo");
    expect(de("marcar_revisada").obligacion!.identificador).toBe("****4066");
    expect(JSON.stringify(r)).not.toContain(IBAN);
    expect(f.agruparCampos(r.opciones.campos)).toEqual([{ titulo: "Decisiones manuales", campos: ["revision_obligacion"] }]);
    expect(f.rotuloDeCampo("revision_obligacion")).toBe("Revisión de la obligación");
    expect(((await pedir("GET", "/api/historial-cambios?campo=revision_obligacion", ana)).json().datos as unknown[]).length).toBe(2);
  });
});
