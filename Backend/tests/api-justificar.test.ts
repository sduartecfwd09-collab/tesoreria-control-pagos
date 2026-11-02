import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { MOTIVO_CARPETA_SIN_SOCIEDAD, MOTIVO_NOMBRE_NO_COINCIDE } from "../src/domain/estado-archivo.js";
import { MOTIVOS } from "../src/domain/cruce.js";
import { ErrorDeServicio } from "../src/domain/permisos.js";
import { justificarVencimiento } from "../src/justificaciones/vencimiento.js";
import { justificarArchivo } from "../src/justificaciones/archivo.js";
import { archivoParaJustificar } from "../src/repositories/consultas.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { vencimientoParaAsociar } from "../src/repositories/vencimientos.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Justificar vencimientos y archivos: permisos, estados, motivos y notas, el pago manda, reversión, cobertura, archivo sin sociedad, historial. Datos inventados. Hoy = 2026-10-27.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const enc = (id: number) => ({ "x-usuario-actual": String(id) });
const CUENTA_A = "CR0000000000000000001234";
const CUENTA_B = "CR0000000000000000009999";
const IMAGEN = { continuidad: { estado: "no_verificable", razon: "imagen_no_legible" } };
const SALDO_NO_CUADRA = { continuidad: { estado: "no_cuadra", verificados: 10, fallos: 2 } };
const SIN_MOVIMIENTOS = { continuidad: { estado: "no_verificable", razon: "sin_movimientos" } };

let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let cuentaA: number;
let archivoA: number; // archivo normal de AAA, octubre (con cuenta: da cobertura)
let luz: number;
let agua: number;
let gas: number;
let n = 0;

const mov = (fecha: Date, descripcion: string, debito = 5000n) =>
  prisma.movimiento.create({ data: { cuentaId: cuentaA, archivoId: archivoA, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito: 0n, claveDedup: `k${n}`.padEnd(40, "0") } });
const venc = (obligacionId: number) => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId, periodo: "2026-10" } });
const pedir = (metodo: "GET" | "POST", url: string, actor: number | null, payload?: object) =>
  app.inject({ method: metodo, url, headers: actor === null ? {} : enc(actor), ...(payload ? { payload } : {}) });
const justificar = async (obligacionId: number, motivo: unknown = "no_se_paga", nota?: unknown, actor: number | null = ana) =>
  pedir("POST", `/api/vencimientos/${(await venc(obligacionId)).id}/justificar`, actor, { motivo, nota });
const quitarJ = async (obligacionId: number, motivo: unknown = "Ya no aplica", actor: number | null = ana) =>
  pedir("POST", `/api/vencimientos/${(await venc(obligacionId)).id}/quitar-justificacion`, actor, { motivo });
const justificarA = (archivoId: number, motivo: unknown, nota?: unknown, actor: number | null = ana) => pedir("POST", `/api/archivos/${archivoId}/justificar`, actor, { motivo, nota });
const quitarA = (archivoId: number, motivo: unknown = "Ya no aplica", actor: number | null = ana) => pedir("POST", `/api/archivos/${archivoId}/quitar-justificacion`, actor, { motivo });

/** Un archivo registrado sin cuenta (no da cobertura): sirve para probar cada problema de «Estados de cuenta». */
const extra = (ruta: string, d: { estado?: string; motivo?: string | null; error?: string | null; hash?: string; mes?: string; detalle?: object | null; sociedadId?: number | null; retiradoEn?: Date | null } = {}) =>
  prisma.archivoImportado.create({
    data: {
      ruta, hash: d.hash ?? `h-${ruta}`, estado: d.estado ?? "leido", motivo: d.motivo ?? null, error: d.error ?? null, mes: d.mes ?? "2026-08",
      sociedadId: d.sociedadId === undefined ? sociedadA : d.sociedadId, detalle: d.detalle ? JSON.stringify(d.detalle) : null, retiradoEn: d.retiradoEn ?? null,
    },
  });
type FilaArchivo = { id: number; problema: string | null; justificacion: { quien: string; motivo: string; nota: string | null; sinEfecto: boolean } | null; motivosPosibles: { clave: string }[]; puedeJustificar: boolean; puedeQuitarJustificacion: boolean };
const filaDe = async (id: number, actor: number | null = jefa) => ((await pedir("GET", "/api/importaciones", actor)).json().datos as FilaArchivo[]).find((x) => x.id === id);

beforeAll(async () => {
  app = await crearApp({ reloj, modoPruebas: true });
});
afterAll(async () => {
  await app.close();
  await fijarRango(10, 12);
  await vaciarImportaciones();
  await vaciarUsuarios();
});
beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  await fijarRango(3, 3);
  const roles = await mapaDeRoles();
  const persona = async (correo: string, nombre: string, rol: string) =>
    (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  jefa = await persona("jefa@x.cr", "Jefa Tres", "Jefatura");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  cuentaA = (await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: CUENTA_A } })).id;
  const cuentaB = (await prisma.cuenta.create({ data: { sociedadId: sociedadB, numero: CUENTA_B } })).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${CUENTA_A} ${mes.slice(5)}${mes.slice(2, 4)} AAA.xlsx`, hash: `a${mes}`, sociedadId: sociedadA, cuentaId: cuentaA, mes, estado: "leido" } });
    const b = await prisma.archivoImportado.create({ data: { ruta: `BBB/${CUENTA_B} ${mes.slice(5)}${mes.slice(2, 4)} BBB.xlsx`, hash: `b${mes}`, sociedadId: sociedadB, cuentaId: cuentaB, mes, estado: "leido" } });
    if (mes === "2026-10") {
      archivoA = a.id;
      await prisma.movimiento.create({ data: { cuentaId: cuentaB, archivoId: b.id, hoja: "H", fila: ++n, periodo: mes, fecha: dia(2026, 10, 26), descripcion: "COMISION", debito: 5000n, credito: 0n, claveDedup: `k${n}`.padEnd(40, "0") } });
      await prisma.movimiento.create({ data: { cuentaId: cuentaB, archivoId: b.id, hoja: "H", fila: ++n, periodo: mes, fecha: dia(2026, 9, 3), descripcion: "COMISION INICIAL", debito: 5000n, credito: 0n, claveDedup: `k${n}`.padEnd(40, "0") } });
    }
  }
  const categoria = await prisma.categoria.findFirstOrThrow();
  const crear = async (sociedadId: number, proveedor: string, identificador: string) =>
    (await prisma.obligacion.create({ data: { sociedadId, categoriaId: categoria.id, proveedor, identificador, diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) } })).id;
  luz = await crear(sociedadA, "Luz Uno", "7771234");
  agua = await crear(sociedadA, "Agua", "8881111");
  gas = await crear(sociedadB, "Gas", "9990000");
  await mov(dia(2026, 9, 3), "COMISION INICIAL");
  await mov(dia(2026, 10, 26), "COMISION SIN RELACION");
  await actualizarVencimientos(reloj);
});

describe("justificar un vencimiento: permisos y estados", () => {
  it("sin persona 401; un tesorero ajeno 403; Jefatura y el tesorero propio sí; 404 y 400", async () => {
    const id = (await venc(luz)).id;
    for (const [url, body] of [[`/api/vencimientos/${id}/justificar`, { motivo: "no_se_paga" }], [`/api/vencimientos/${id}/quitar-justificacion`, { motivo: "Prueba de permiso" }]] as const) {
      expect((await pedir("POST", url, null, body)).statusCode, url).toBe(401);
      expect((await pedir("POST", url, beto, body)).statusCode, url).toBe(403);
      expect((await pedir("POST", url, ana, body)).statusCode, url).not.toBe(403);
      expect((await pedir("POST", url, jefa, body)).statusCode, url).not.toBe(403);
    }
    expect((await pedir("POST", "/api/vencimientos/999999/justificar", ana, { motivo: "no_se_paga" })).statusCode).toBe(404);
    expect((await pedir("POST", "/api/vencimientos/0/justificar", ana, { motivo: "no_se_paga" })).statusCode).toBe(400);
    const sinModo = await crearApp({ reloj, modoPruebas: false });
    try {
      expect((await sinModo.inject({ method: "POST", url: `/api/vencimientos/${id}/justificar`, headers: enc(ana), payload: { motivo: "no_se_paga" } })).statusCode).toBe(401);
    } finally {
      await sinModo.close();
    }
  });

  it("solo Vencido y Sin información; en los demás estados 409 y no se guarda nada", async () => {
    expect((await venc(luz)).estado).toBe("vencido");
    for (const estado of ["por_vencer", "proyectado", "pagado", "pagado_con_inconsistencia", "por_revisar", "justificado"]) {
      await prisma.vencimiento.updateMany({ where: { obligacionId: agua }, data: { estado } });
      expect((await justificar(agua)).statusCode, estado).toBe(409);
    }
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    await prisma.vencimiento.updateMany({ where: { obligacionId: agua }, data: { estado: "sin_informacion" } });
    expect((await justificar(agua)).statusCode).toBe(200);
    expect((await justificar(luz)).statusCode).toBe(200);
  });

  it("motivo de la lista y nota opcional u obligatoria: 422 con el dato que falla y nada guardado", async () => {
    for (const motivo of [null, "", "inexistente", 3]) {
      const r = await justificar(luz, motivo);
      expect(r.statusCode, String(motivo)).toBe(422);
      expect(r.json().campo).toBe("motivo");
    }
    for (const [motivo, nota] of [["no_se_paga", "x".repeat(301)], ["otro", undefined], ["otro", "ab"], ["otro", "x".repeat(301)], ["otro_medio", 5]] as const) {
      const r = await justificar(luz, motivo, nota);
      expect(r.statusCode, `${motivo} ${String(nota).slice(0, 5)}`).toBe(422);
      expect(r.json().campo).toBe("nota");
    }
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect((await justificar(luz, "otro", "Lo cubre la casa matriz")).statusCode).toBe(200);
  });
});

describe("justificar un vencimiento: estado Justificado", () => {
  it("queda Justificado, sale de Vencidos, de Avisos y de los contadores, con la decisión y su línea en el historial (misma transacción)", async () => {
    type Lista = { datos: { obligacionId: number; estado: string; justificado: { quien: string; motivo: string; nota: string | null } | null; puedeGestionar: boolean }[]; resumen: Record<string, number> };
    const lista = async (qs = "?periodo=2026-10") => (await pedir("GET", `/api/vencimientos${qs}`, ana)).json() as Lista;
    const avisos = async () => ((await pedir("GET", "/api/avisos", ana)).json().grupos as { filas: { proveedor: string }[] }[]).flatMap((g) => g.filas.map((f) => f.proveedor));
    expect((await lista()).resumen).toMatchObject({ vencido: 2 });
    expect(await avisos()).toContain("Luz Uno");

    const r = await justificar(luz, "no_se_paga", "  La tienda   cerró ");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ estado: "justificado" });
    const v = await venc(luz);
    expect(v).toMatchObject({ estado: "justificado", movimientoId: null, diferenciaDias: null, motivo: MOTIVOS.justificado });
    const d = await prisma.decisionManual.findFirstOrThrow();
    expect(d).toMatchObject({
      tipo: "justificacion_vencimiento", sociedadId: sociedadA, obligacionId: luz, periodo: "2026-10", motivo: "No se paga este mes", usuarioId: ana, nombreUsuario: "Ana Uno",
      modoPruebas: true, vigente: true, unicaObligacionPeriodo: `j|${luz}|2026-10`, unicaMovimiento: null, claveMovimiento: null,
    });
    expect(JSON.parse(d.datos!)).toEqual({ clave: "no_se_paga", nota: "La tienda cerró" });
    const h = await prisma.historialCambio.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      entidad: "vencimiento", entidadId: v.id, obligacionId: luz, sociedadId: sociedadA, accion: "justificar", campo: "justificacion_vencimiento", antes: null, despues: "2026-10",
      motivo: "No se paga este mes: La tienda cerró", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true,
    });

    // sale de Vencidos, de Avisos y de los contadores; se cuenta aparte
    const despues = await lista();
    expect(despues.resumen).toMatchObject({ vencido: 1, justificado: 1 });
    expect((await lista("?periodo=2026-10&estado=vencido")).datos.map((x) => x.obligacionId)).toEqual([agua]);
    expect(await avisos()).not.toContain("Luz Uno");
    expect(await avisos()).toContain("Agua");
    const fila = despues.datos.find((x) => x.obligacionId === luz)!;
    expect(fila).toMatchObject({ estado: "justificado", justificado: { quien: "Ana Uno", motivo: "No se paga este mes", nota: "La tienda cerró" }, puedeGestionar: true });
    // el detalle trae los motivos que se pueden elegir y quién, cuándo y por qué
    const det = (await pedir("GET", `/api/vencimientos/${v.id}`, ana)).json().datos;
    expect(det).toMatchObject({ estado: "justificado", justificado: { quien: "Ana Uno" }, puedeGestionar: true });
    expect(det.motivosDeJustificacion.map((m: { clave: string }) => m.clave)).toEqual(["no_se_paga", "otro_medio", "otro"]);
    expect(det.textos.resumen).toBe("");
    // estable: volver a calcular no cambia nada
    expect((await actualizarVencimientos(reloj)).cambiados).toBe(0);
    // no se puede justificar dos veces
    expect((await justificar(luz)).statusCode).toBe(409);
  });

  it("el pago manda: un pago automático lo deja Pagado y la justificación queda sin efecto; sin el pago, vuelve a Justificado", async () => {
    await justificar(luz);
    const pago = await mov(dia(2026, 10, 14), "PAGO LUZ 7771234");
    await actualizarVencimientos(reloj);
    expect(await venc(luz)).toMatchObject({ estado: "pagado", movimientoId: pago.id });
    const fila = async () => ((await pedir("GET", "/api/vencimientos?periodo=2026-10", ana)).json().datos as { obligacionId: number; justificado: unknown }[]).find((x) => x.obligacionId === luz)!;
    expect((await fila()).justificado).toBeNull(); // con un pago no se muestra como justificado
    expect(await prisma.decisionManual.count({ where: { vigente: true } })).toBe(1); // la decisión sigue vigente, sin efecto
    await prisma.movimiento.delete({ where: { id: pago.id } });
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("justificado");
  });

  it("la asociación manual sigue permitida estando justificado (gana la asociación); al quitarla vuelve a Justificado", async () => {
    await justificar(luz);
    const elegido = await mov(dia(2026, 10, 14), "COBRO BETA");
    const id = (await venc(luz)).id;
    expect((await pedir("GET", `/api/vencimientos/${id}/pagos-candidatos`, ana)).statusCode).toBe(200);
    expect((await pedir("POST", `/api/vencimientos/${id}/asociar-pago`, ana, { movimiento: elegido.id, motivo: "Se pagó con otra referencia" })).statusCode).toBe(200);
    expect(await venc(luz)).toMatchObject({ estado: "pagado", movimientoId: elegido.id, motivo: MOTIVOS.asociadoAMano });
    expect((await pedir("POST", `/api/vencimientos/${id}/quitar-asociacion`, ana, { motivo: "Era de otro mes" })).statusCode).toBe(200);
    expect((await venc(luz)).estado).toBe("justificado");
  });

  it("reversión: quitar la justificación vuelve al estado calculado, queda no vigente (nada se borra) y se puede volver a justificar", async () => {
    await justificar(luz);
    expect((await quitarJ(luz, "  Sí se   paga ")).statusCode).toBe(200);
    expect(await venc(luz)).toMatchObject({ estado: "vencido" });
    const filas = await prisma.decisionManual.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ vigente: false, unicaObligacionPeriodo: null, revertidaPorId: ana, nombreRevierte: "Ana Uno", motivoReversion: "Sí se paga" });
    expect(filas[0]!.revertidaEn).toBeInstanceOf(Date);
    const h = await prisma.historialCambio.findMany({ orderBy: { id: "asc" } });
    expect(h.map((x) => [x.accion, x.campo, x.antes, x.despues, x.motivo])).toEqual([
      ["justificar", "justificacion_vencimiento", null, "2026-10", "No se paga este mes"],
      ["quitar_justificacion", "justificacion_vencimiento", "2026-10", null, "Sí se paga"],
    ]);
    expect((await quitarJ(luz)).statusCode).toBe(409);
    for (const motivo of [null, "", "ab", "x".repeat(301)]) expect((await quitarJ(luz, motivo)).statusCode, String(motivo)).toBe(422);
    expect((await justificar(luz, "otro_medio")).statusCode).toBe(200);
    expect((await prisma.decisionManual.findMany({ orderBy: { id: "asc" } })).map((x) => x.vigente)).toEqual([false, true]);
  });

  it("invariantes: una justificación vigente por vencimiento (la base lo impide) y puede convivir con una asociación", async () => {
    await justificar(luz);
    await expect(
      prisma.decisionManual.create({
        data: { tipo: "justificacion_vencimiento", sociedadId: sociedadA, obligacionId: luz, periodo: "2026-10", motivo: "Prueba", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true, unicaObligacionPeriodo: `j|${luz}|2026-10` },
      }),
    ).rejects.toThrow();
    // la clave de una asociación (sin prefijo) no choca con la de la justificación del mismo vencimiento
    await expect(
      prisma.decisionManual.create({
        data: { tipo: "asociacion_pago", sociedadId: sociedadA, obligacionId: luz, periodo: "2026-10", claveMovimiento: "z".repeat(40), motivo: "Prueba", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true, unicaObligacionPeriodo: `${luz}|2026-10`, unicaMovimiento: "z".repeat(40) },
      }),
    ).resolves.toBeTruthy();
  });

  it("si el registro falla, nada se guarda (misma transacción)", async () => {
    const v = (await vencimientoParaAsociar((await venc(luz)).id))!;
    await expect(justificarVencimiento({ vencimiento: v, motivo: "no_se_paga", nota: undefined, autor: { id: 999_999, nombre: "Nadie", modoPruebas: true } }, reloj)).rejects.toThrow();
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect((await venc(luz)).estado).toBe("vencido");
    await expect(justificarVencimiento({ vencimiento: { ...v, estado: "pagado" }, motivo: "no_se_paga", nota: undefined, autor: { id: ana, nombre: "Ana Uno", modoPruebas: true } }, reloj)).rejects.toBeInstanceOf(ErrorDeServicio);
  });
});

describe("justificar un archivo", () => {
  it("permisos: sin persona 401, tesorero ajeno 403 (incluida la sociedad del archivo), retirado o inexistente 404, Jefatura sí", async () => {
    const a = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA });
    const retirado = await extra("AAA/retirado.xlsx", { detalle: SALDO_NO_CUADRA, retiradoEn: new Date() });
    for (const url of [`/api/archivos/${a.id}/justificar`, `/api/archivos/${a.id}/quitar-justificacion`]) {
      const cuerpo = { motivo: url.endsWith("justificar") ? "pedido_al_banco" : "Prueba de permiso" };
      expect((await pedir("POST", url, null, cuerpo)).statusCode, url).toBe(401);
      expect((await pedir("POST", url, beto, cuerpo)).statusCode, url).toBe(403);
      expect((await pedir("POST", url, ana, cuerpo)).statusCode, url).not.toBe(403);
    }
    expect((await justificarA(retirado.id, "pedido_al_banco")).statusCode).toBe(404);
    expect((await justificarA(999_999, "pedido_al_banco")).statusCode).toBe(404);
    expect((await pedir("POST", "/api/archivos/0/justificar", ana, { motivo: "x" })).statusCode).toBe(400);
    expect((await justificarA(a.id, "pedido_al_banco", undefined, jefa)).statusCode).toBe(200);
  });

  it("cada problema ofrece sus motivos (el Backend los entrega); un motivo de otro problema da 422; sin problema 409", async () => {
    const casos: [string, string, object][] = [
      ["AAA/error.xlsx", "con_error", { estado: "error", error: "No se pudo leer" }],
      ["AAA/saldo.xlsx", "saldo_no_cuadra", { detalle: SALDO_NO_CUADRA }],
      ["AAA/imagen.xlsx", "imagen_no_legible", { detalle: IMAGEN }],
      ["AAA/nombre.xlsx", "nombre_distinto", { detalle: { discrepancias: [{ tipo: "mes", mensaje: "no coincide" }] } }],
      ["AAA/revision.xlsx", "con_error", { estado: "en_revision", motivo: MOTIVO_NOMBRE_NO_COINCIDE, hash: "" }],
    ];
    const esperado: Record<string, string[]> = {
      con_error: ["pedido_al_banco", "otro"],
      saldo_no_cuadra: ["saldo_difiere", "solo_ese_movimiento", "pedido_al_banco", "otro"],
      imagen_no_legible: ["banco_confirma_sin_movimientos", "pedido_al_banco", "otro"],
      nombre_distinto: ["pedido_al_banco", "otro"],
    };
    for (const [ruta, problema, datos] of casos) {
      const a = await extra(ruta, datos);
      const f = (await filaDe(a.id))!;
      expect(f.problema, ruta).toBe(problema);
      expect(f.motivosPosibles.map((m) => m.clave), ruta).toEqual(esperado[problema]);
      expect(f.puedeJustificar, ruta).toBe(true);
    }
    // un motivo que no corresponde al problema
    const saldo = (await prisma.archivoImportado.findFirstOrThrow({ where: { ruta: "AAA/saldo.xlsx" } })).id;
    const r = await justificarA(saldo, "banco_confirma_sin_movimientos");
    expect(r.statusCode).toBe(422);
    expect(r.json().campo).toBe("motivo");
    // sin problema: legible con cero movimientos (ya cubre), saldo que cuadra, no verificable
    for (const [ruta, detalle] of [["AAA/sinmov.xlsx", SIN_MOVIMIENTOS], ["AAA/cuadra.xlsx", { continuidad: { estado: "cuadra" } }], ["AAA/noverif.xlsx", { continuidad: { estado: "no_verificable", razon: "un_solo_saldo" } }]] as const) {
      const a = await extra(ruta, { detalle });
      expect((await filaDe(a.id))!, ruta).toMatchObject({ problema: null, motivosPosibles: [], puedeJustificar: false });
      expect((await justificarA(a.id, "pedido_al_banco")).statusCode, ruta).toBe(409);
    }
    expect(await prisma.decisionManual.count()).toBe(0);
  });

  it("nota: opcional en los motivos que no dicen «explicar» y obligatoria (3 a 300) en «Otro» y en «El saldo difiere…»", async () => {
    const a = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA });
    for (const [motivo, nota] of [["saldo_difiere", undefined], ["saldo_difiere", "ab"], ["otro", undefined], ["otro", "x".repeat(301)], ["pedido_al_banco", "x".repeat(301)]] as const) {
      const r = await justificarA(a.id, motivo, nota);
      expect(r.statusCode, `${motivo} ${String(nota).slice(0, 4)}`).toBe(422);
      expect(r.json().campo).toBe("nota");
    }
    expect((await justificarA(a.id, "inexistente")).json().campo).toBe("motivo");
    expect(await prisma.decisionManual.count()).toBe(0);
    expect((await justificarA(a.id, "solo_ese_movimiento")).statusCode).toBe(200); // nota opcional
  });

  it("justificar anota la decisión (huella = hash, problema en datos) y su línea del historial, sin rutas; y se puede quitar", async () => {
    const a = await extra("AAA/carpeta/saldo-123456789012.xlsx", { detalle: SALDO_NO_CUADRA, hash: "hash-del-contenido", mes: "2026-08" });
    const r = await justificarA(a.id, "saldo_difiere", "Es un ajuste del banco");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ problema: "saldo_no_cuadra" });
    const d = await prisma.decisionManual.findFirstOrThrow();
    expect(d).toMatchObject({
      tipo: "justificacion_archivo", sociedadId: sociedadA, archivoId: a.id, huella: "hash-del-contenido", motivo: "El saldo difiere por una razón conocida (explicar)",
      unicaMovimiento: `a|${a.id}`, unicaObligacionPeriodo: null, usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true, vigente: true,
    });
    expect(JSON.parse(d.datos!)).toEqual({ clave: "saldo_difiere", nota: "Es un ajuste del banco", problema: "saldo_no_cuadra" });
    const h = await prisma.historialCambio.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      entidad: "archivo", entidadId: a.id, obligacionId: null, sociedadId: sociedadA, accion: "justificar", campo: "justificacion_archivo", antes: null, despues: "2026-08",
      motivo: "El saldo difiere por una razón conocida (explicar): Es un ajuste del banco", modoPruebas: true,
    });
    for (const prohibido of ["AAA/", "carpeta", "123456789012", CUENTA_A]) expect(JSON.stringify(h), prohibido).not.toContain(prohibido);
    // se ve como justificado y ya no requiere atención
    expect((await filaDe(a.id))!).toMatchObject({ problema: "saldo_no_cuadra", justificacion: { quien: "Ana Uno", nota: "Es un ajuste del banco", sinEfecto: false }, puedeJustificar: false, puedeQuitarJustificacion: true });
    expect((await justificarA(a.id, "otro", "Otra vez")).statusCode).toBe(409);
    // quitar
    expect((await quitarA(a.id, "Se justificó por error")).statusCode).toBe(200);
    expect((await filaDe(a.id))!).toMatchObject({ justificacion: null, puedeJustificar: true });
    expect((await prisma.decisionManual.findFirstOrThrow()).vigente).toBe(false);
    const h2 = await prisma.historialCambio.findMany({ orderBy: { id: "asc" } });
    expect(h2.map((x) => [x.accion, x.antes, x.despues, x.motivo])).toEqual([
      ["justificar", null, "2026-08", "El saldo difiere por una razón conocida (explicar): Es un ajuste del banco"],
      ["quitar_justificacion", "2026-08", null, "Se justificó por error"],
    ]);
    expect((await quitarA(a.id)).statusCode).toBe(409);
    for (const motivo of [null, "", "ab"]) expect((await quitarA(a.id, motivo)).statusCode, String(motivo)).toBe(422);
  });

  it("sin efecto: si el archivo se vuelve a importar con otro contenido o aparece otro tipo de problema, vuelve a requerir atención (la decisión no se borra) y se puede justificar de nuevo", async () => {
    const a = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA, hash: "uno" });
    await justificarA(a.id, "pedido_al_banco");
    expect((await filaDe(a.id))!.justificacion!.sinEfecto).toBe(false);
    // contenido distinto (otro hash, mismo problema)
    await prisma.archivoImportado.update({ where: { id: a.id }, data: { hash: "dos" } });
    expect((await filaDe(a.id))!).toMatchObject({ problema: "saldo_no_cuadra", justificacion: { sinEfecto: true }, puedeJustificar: true });
    // el mismo contenido de antes vuelve a tener efecto
    await prisma.archivoImportado.update({ where: { id: a.id }, data: { hash: "uno" } });
    expect((await filaDe(a.id))!.justificacion!.sinEfecto).toBe(false);
    // otro tipo de problema (mismo hash)
    await prisma.archivoImportado.update({ where: { id: a.id }, data: { detalle: JSON.stringify(IMAGEN) } });
    expect((await filaDe(a.id))!).toMatchObject({ problema: "imagen_no_legible", justificacion: { sinEfecto: true }, puedeJustificar: true });
    // ya no hay problema: nada que justificar
    await prisma.archivoImportado.update({ where: { id: a.id }, data: { detalle: JSON.stringify({ continuidad: { estado: "cuadra" } }) } });
    expect((await filaDe(a.id))!).toMatchObject({ problema: null, justificacion: { sinEfecto: true }, puedeJustificar: false });
    // otra vez con problema distinto: se justifica de nuevo; la anterior se cierra, no se borra
    await prisma.archivoImportado.update({ where: { id: a.id }, data: { detalle: JSON.stringify(IMAGEN) } });
    expect((await justificarA(a.id, "otro", "El banco no envía la imagen en texto")).statusCode).toBe(200);
    const todas = await prisma.decisionManual.findMany({ orderBy: { id: "asc" } });
    expect(todas.map((x) => x.vigente)).toEqual([false, true]);
    expect(todas[0]!.motivoReversion).toBe("El archivo cambió o tiene otro problema");
    expect((await filaDe(a.id))!.justificacion).toMatchObject({ motivo: "Otro (explicar)", sinEfecto: false });
  });

  it("invariante: una justificación vigente por archivo (la base lo impide)", async () => {
    const a = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA });
    await justificarA(a.id, "pedido_al_banco");
    await expect(
      prisma.decisionManual.create({
        data: { tipo: "justificacion_archivo", sociedadId: sociedadA, archivoId: a.id, motivo: "Prueba", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true, unicaMovimiento: `a|${a.id}` },
      }),
    ).rejects.toThrow();
  });

  it("si el registro falla, nada se guarda (misma transacción)", async () => {
    const a = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA });
    const archivo = (await archivoParaJustificar(a.id))!;
    await expect(justificarArchivo({ archivo, motivo: "pedido_al_banco", nota: undefined, autor: { id: 999_999, nombre: "Nadie", modoPruebas: true } }, reloj)).rejects.toThrow();
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
  });
});

describe("archivo sin sociedad (la sociedad de la decisión y del historial es opcional)", () => {
  it("(a) Jefatura lo justifica y la decisión y la línea quedan sin sociedad; (b) un Tesorero recibe 403 y no las ve en el Historial; solo Jefatura las ve", async () => {
    const sin = await extra("SIN/2026-10.xlsx", { estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD, hash: "", sociedadId: null, mes: "2026-10" });
    const deAna = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA });
    // un tesorero no ve el archivo sin sociedad en Estados de cuenta y no puede justificarlo
    expect(await filaDe(sin.id, ana)).toBeUndefined();
    expect((await justificarA(sin.id, "pedido_al_banco", undefined, ana)).statusCode).toBe(403);
    expect((await justificarA(sin.id, "pedido_al_banco", undefined, beto)).statusCode).toBe(403);
    expect((await filaDe(sin.id, jefa))!).toMatchObject({ problema: "sin_sociedad", puedeJustificar: true });
    expect((await filaDe(sin.id, jefa))!.motivosPosibles.map((m) => m.clave)).toEqual(["pedido_al_banco", "otro"]);
    expect(await prisma.decisionManual.count()).toBe(0);

    expect((await justificarA(sin.id, "pedido_al_banco", "Se pidió el estado", jefa)).statusCode).toBe(200);
    expect((await justificarA(deAna.id, "pedido_al_banco", undefined, ana)).statusCode).toBe(200);
    const d = await prisma.decisionManual.findFirstOrThrow({ where: { archivoId: sin.id } });
    expect(d).toMatchObject({ sociedadId: null, huella: "", unicaMovimiento: `a|${sin.id}`, nombreUsuario: "Jefa Tres" });
    const linea = await prisma.historialCambio.findFirstOrThrow({ where: { entidadId: sin.id, entidad: "archivo" } });
    expect(linea).toMatchObject({ sociedadId: null, obligacionId: null, accion: "justificar", despues: "2026-10" });

    type Historial = { total: number; datos: { entidad?: string; sociedad: string | null; accion: string; campo: string; archivo: { nombre: string | null; mes: string | null; cuenta: string | null } | null }[]; opciones: { sociedades: { id: number }[] } };
    const historial = async (actor: number) => (await pedir("GET", "/api/historial-cambios", actor)).json() as Historial;
    const deJefa = await historial(jefa);
    expect(deJefa.total).toBe(2);
    expect(deJefa.datos.find((x) => x.sociedad === null)).toMatchObject({ campo: "justificacion_archivo", archivo: { nombre: "2026-10.xlsx", mes: "2026-10", cuenta: null } });
    const hAna = await historial(ana);
    expect(hAna.total).toBe(1); // solo lo de su sociedad: lo que no tiene sociedad no se ve
    expect(hAna.datos.every((x) => x.sociedad !== null)).toBe(true);
    expect(hAna.opciones.sociedades.map((s) => s.id)).toEqual([sociedadA]);
    expect((await historial(beto)).total).toBe(0);
    // la ruta nunca sale en la respuesta
    for (const [actor, texto] of [[jefa, JSON.stringify(deJefa)], [ana, JSON.stringify(hAna)]] as const) {
      expect(texto, String(actor)).not.toContain("SIN/");
      expect(texto, String(actor)).not.toContain("AAA/");
    }
  });

  it("la justificación de un archivo sin leer (hash vacío) vale mientras siga sin leerse; al leerse con otro contenido queda sin efecto", async () => {
    const sin = await extra("SIN/2026-10.xlsx", { estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD, hash: "", sociedadId: null });
    await justificarA(sin.id, "otro", "La carpeta se asigna el mes próximo", jefa);
    expect((await filaDe(sin.id))!.justificacion!.sinEfecto).toBe(false);
    await prisma.archivoImportado.update({ where: { id: sin.id }, data: { estado: "leido", motivo: null, hash: "nuevo", sociedadId: sociedadA, detalle: JSON.stringify(SALDO_NO_CUADRA) } });
    expect((await filaDe(sin.id))!).toMatchObject({ problema: "saldo_no_cuadra", justificacion: { sinEfecto: true }, puedeJustificar: true });
  });

  it("(c) Estados de cuenta, Historial y alcance siguen funcionando con decisiones sin sociedad: ninguna consulta se rompe", async () => {
    const sin = await extra("SIN/2026-10.xlsx", { estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD, hash: "", sociedadId: null });
    await justificarA(sin.id, "pedido_al_banco", undefined, jefa);
    for (const actor of [jefa, ana, beto]) {
      expect((await pedir("GET", "/api/importaciones", actor)).statusCode).toBe(200);
      expect((await pedir("GET", "/api/historial-cambios", actor)).statusCode).toBe(200);
      expect((await pedir("GET", "/api/historial-cambios?campo=justificacion_archivo", actor)).statusCode).toBe(200);
      expect((await pedir("GET", "/api/cobertura", actor)).statusCode).toBe(200);
    }
    expect((await pedir("GET", `/api/archivos/${sin.id}`, ana)).statusCode).toBe(404); // el archivo sin sociedad no es de ningún tesorero
    expect((await pedir("GET", `/api/archivos/${sin.id}`, jefa)).statusCode).toBe(200);
    // sociedadId queda realmente sin valor (nulo), no un valor inventado
    expect((await prisma.decisionManual.findFirstOrThrow()).sociedadId).toBeNull();
    expect((await prisma.historialCambio.findFirstOrThrow()).sociedadId).toBeNull();
  });
});

// Las funciones que arman los textos del Historial viven en el Frontend (módulo puro, sin React ni red): se cargan tal cual para probar de punta a punta
// lo que devuelve la API real.
interface FormatoFrontend {
  rotuloDeFila: (f: { accion: string; campo: string; antes?: string | null; despues?: string | null }) => string;
  cambioEnPalabras: (f: { accion: string; campo: string; antes: string | null; despues: string | null }) => { tipo: string; antes?: string; despues?: string };
  agruparCampos: (campos: string[]) => { titulo: string; campos: string[] }[];
  rotuloDeCampo: (campo: string) => string;
  fraseJustificado: (j: { quien: string; cuando: string; motivo: string; nota: string | null }) => string;
}
const cargarFormato = async () => (await import(/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "../Frontend/src/lib/formato.ts")).href)) as FormatoFrontend;

describe("de la API a lo que se lee en el Historial y en el detalle (de punta a punta)", () => {
  it("justificar y quitar un vencimiento y un archivo: los mismos objetos de la API pasan por las funciones del Frontend", async () => {
    const f = await cargarFormato();
    expect((await justificar(luz, "no_se_paga", "La tienda cerró")).statusCode).toBe(200);
    // el detalle: la frase que arma la pantalla con lo que devuelve la API
    const det = (await pedir("GET", `/api/vencimientos/${(await venc(luz)).id}`, ana)).json().datos;
    expect(f.fraseJustificado(det.justificado)).toMatch(/^Justificado por Ana Uno el \d{1,2} [a-z]{3}( \d{4})?\. Motivo: No se paga este mes: La tienda cerró\.$/);
    expect((await quitarJ(luz)).statusCode).toBe(200);
    const a = await extra("AAA/saldo.xlsx", { detalle: SALDO_NO_CUADRA, mes: "2026-08" });
    expect((await justificarA(a.id, "pedido_al_banco")).statusCode).toBe(200);
    expect((await quitarA(a.id)).statusCode).toBe(200);

    type Fila = { accion: string; campo: string; antes: string | null; despues: string | null; obligacion: unknown; archivo: { nombre: string | null; mes: string | null; cuenta: string | null } | null; motivo: string | null };
    const r = (await pedir("GET", "/api/historial-cambios", ana)).json() as { datos: Fila[]; opciones: { campos: string[] } };
    const de = (accion: string, campo: string) => r.datos.find((x) => x.accion === accion && x.campo === campo)!;
    const quePasa = (x: Fila) => ({ que: f.rotuloDeFila(x), cambio: f.cambioEnPalabras(x) });

    expect(quePasa(de("justificar", "justificacion_vencimiento"))).toEqual({ que: "Justificación del vencimiento de oct 2026", cambio: { tipo: "valores", antes: "Sin justificar", despues: "Justificado" } });
    expect(quePasa(de("quitar_justificacion", "justificacion_vencimiento"))).toEqual({ que: "Justificación del vencimiento de oct 2026", cambio: { tipo: "valores", antes: "Justificado", despues: "Sin justificar" } });
    expect(quePasa(de("justificar", "justificacion_archivo"))).toEqual({ que: "Justificación del archivo", cambio: { tipo: "valores", antes: "Sin justificar", despues: "Justificado" } });
    expect(quePasa(de("quitar_justificacion", "justificacion_archivo"))).toEqual({ que: "Justificación del archivo", cambio: { tipo: "valores", antes: "Justificado", despues: "Sin justificar" } });
    // la columna del motivo trae el motivo (y la nota); la de «Obligación» de un archivo trae el mes y el nombre, nunca la ruta
    expect(de("justificar", "justificacion_vencimiento").motivo).toBe("No se paga este mes: La tienda cerró");
    expect(de("justificar", "justificacion_archivo")).toMatchObject({ obligacion: null, archivo: { nombre: "saldo.xlsx", mes: "2026-08", cuenta: null }, motivo: "Estado pedido al banco (pendiente)" });
    expect(JSON.stringify(r)).not.toContain("AAA/");
    // el filtro «Qué cambió»: solo hay decisiones manuales, en su grupo, con sus rótulos
    expect(f.agruparCampos(r.opciones.campos)).toEqual([{ titulo: "Decisiones manuales", campos: ["justificacion_vencimiento", "justificacion_archivo"] }]);
    expect(r.opciones.campos.map((c) => f.rotuloDeCampo(c)).sort()).toEqual(["Justificación del archivo", "Justificación del vencimiento"]);
    // y filtrar por «Justificación del archivo» en el servidor trae sus dos filas
    expect(((await pedir("GET", "/api/historial-cambios?campo=justificacion_archivo", ana)).json().datos as unknown[]).length).toBe(2);
  });
});

describe("cobertura: solo «El banco confirma que no hubo movimientos» cubre", () => {
  const marcarImagen = async () => {
    await prisma.archivoImportado.update({ where: { id: archivoA }, data: { detalle: JSON.stringify(IMAGEN) } });
    await actualizarVencimientos(reloj);
  };
  const celdaImagen = async () => {
    const cob = (await pedir("GET", "/api/cobertura", jefa)).json().datos as { filas: { cuentaId: number | null; celdas: Record<string, { imagenNoLegible?: boolean }> }[] };
    return cob.filas.find((f) => f.cuentaId === cuentaA)!.celdas["2026-10"]!.imagenNoLegible === true;
  };

  it("con otro motivo la cobertura no cambia; con ese motivo cubre; al cambiar el contenido o el problema deja de cubrir", async () => {
    await marcarImagen();
    expect(await venc(luz)).toMatchObject({ estado: "sin_informacion", motivo: MOTIVOS.sinInformacionImagen });
    expect(await celdaImagen()).toBe(true);
    // otros motivos: la alerta se quita pero la cobertura no cambia
    for (const [motivo, nota] of [["pedido_al_banco", undefined], ["otro", "Lo revisa Tesorería"]] as const) {
      expect((await justificarA(archivoA, motivo, nota)).statusCode, motivo).toBe(200);
      expect((await filaDe(archivoA))!.justificacion!.sinEfecto, motivo).toBe(false);
      expect(await venc(luz), motivo).toMatchObject({ estado: "sin_informacion", motivo: MOTIVOS.sinInformacionImagen });
      expect(await celdaImagen(), motivo).toBe(true);
      expect((await quitarA(archivoA)).statusCode).toBe(200);
    }
    // «El banco confirma que no hubo movimientos»: cuenta como un archivo sin movimientos que cubre
    expect((await justificarA(archivoA, "banco_confirma_sin_movimientos")).statusCode).toBe(200);
    expect((await venc(luz)).estado).toBe("vencido"); // ya hay cobertura: sin pago es Vencido, no Sin información
    expect(await celdaImagen()).toBe(false);
    // el archivo se vuelve a importar con contenido distinto: sin efecto, no cubre
    await prisma.archivoImportado.update({ where: { id: archivoA }, data: { hash: "otro-contenido" } });
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("sin_informacion");
    expect((await filaDe(archivoA))!.justificacion!.sinEfecto).toBe(true);
    expect(await celdaImagen()).toBe(true);
    // con el contenido de antes vuelve a cubrir
    await prisma.archivoImportado.update({ where: { id: archivoA }, data: { hash: "a2026-10" } });
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("vencido");
    // aparece otro tipo de problema (el saldo no cuadra): sin efecto
    await prisma.archivoImportado.update({ where: { id: archivoA }, data: { detalle: JSON.stringify(SALDO_NO_CUADRA) } });
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("sin_informacion");
    expect((await filaDe(archivoA))!).toMatchObject({ problema: "saldo_no_cuadra", justificacion: { sinEfecto: true } });
  });

  it("quitar la justificación que cubría devuelve la alerta y la cobertura", async () => {
    await marcarImagen();
    await justificarA(archivoA, "banco_confirma_sin_movimientos");
    expect((await venc(luz)).estado).toBe("vencido");
    expect((await quitarA(archivoA, "El banco sí envió movimientos")).statusCode).toBe(200);
    expect((await venc(luz)).estado).toBe("sin_informacion");
    expect((await filaDe(archivoA))!).toMatchObject({ justificacion: null, puedeJustificar: true });
  });

  it("un vencimiento Vencido gracias a esa cobertura se puede justificar", async () => {
    await marcarImagen();
    await justificarA(archivoA, "banco_confirma_sin_movimientos");
    expect((await justificar(luz, "otro_medio")).statusCode).toBe(200);
    expect((await venc(luz)).estado).toBe("justificado");
  });
});
