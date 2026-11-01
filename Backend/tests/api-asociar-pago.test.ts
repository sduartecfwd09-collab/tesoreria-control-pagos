import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { ErrorDeServicio } from "../src/domain/permisos.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { vencimientoParaAsociar } from "../src/repositories/vencimientos.js";
import { asociarPago } from "../src/vencimientos/asociar-pago.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Asociar un pago a mano: permisos, estados, candidatos, el cruce con la decisión, invariantes e historial. Datos inventados. Hoy = 2026-10-27.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const enc = (id: number) => ({ "x-usuario-actual": String(id) });
const CUENTA_A = "CR0000000000000000001234";
const CUENTA_B = "CR0000000000000000009999";

let app: Awaited<ReturnType<typeof crearApp>>;
let ana: number; // tesorera de AAA
let beto: number; // tesorero de BBB
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let cuentaA: number;
let cuentaB: number;
let archivoA: number;
let archivoB: number;
let luz: number; // obligación de AAA
let agua: number; // otra obligación de AAA
let gas: number; // obligación de BBB
let n = 0;

const mov = (cuentaId: number, archivoId: number, fecha: Date, descripcion: string, debito = 5000n, credito = 0n) =>
  prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito, claveDedup: `k${n}`.padEnd(40, "0") } });
const movA = (fecha: Date, descripcion: string, debito = 5000n) => mov(cuentaA, archivoA, fecha, descripcion, debito);
const venc = (obligacionId: number) => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId, periodo: "2026-10" } });
const pedir = (metodo: "GET" | "POST", url: string, actor: number | null, payload?: object) =>
  app.inject({ method: metodo, url, headers: actor === null ? {} : enc(actor), ...(payload ? { payload } : {}) });
const candidatos = async (obligacionId: number, actor = ana) => pedir("GET", `/api/vencimientos/${(await venc(obligacionId)).id}/pagos-candidatos`, actor);
const asociar = async (obligacionId: number, movimiento: unknown, motivo: unknown = "Se pagó con otra referencia", actor = ana) =>
  pedir("POST", `/api/vencimientos/${(await venc(obligacionId)).id}/asociar-pago`, actor, { movimiento, motivo });
const quitar = async (obligacionId: number, motivo: unknown = "Se asoció por error", actor = ana) =>
  pedir("POST", `/api/vencimientos/${(await venc(obligacionId)).id}/quitar-asociacion`, actor, { motivo });
type Cand = { movimientoId: number; fecha: string; descripcion: string | null; cuenta: string; monto: number; moneda: string | null };

beforeAll(async () => {
  app = await crearApp({ reloj, modoPruebas: true });
});
afterAll(async () => {
  await app.close();
  await prisma.parametro.updateMany({ where: { clave: "ventana_asociacion_manual_dias" }, data: { valor: "30" } });
  await fijarRango(10, 12);
  await vaciarImportaciones();
  await vaciarUsuarios();
});

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  await fijarRango(3, 3);
  await prisma.parametro.updateMany({ where: { clave: "ventana_asociacion_manual_dias" }, data: { valor: "30" } });
  const roles = await mapaDeRoles();
  const persona = async (correo: string, nombre: string, rol: string) =>
    (await prisma.usuario.create({ data: { correo, nombre, nombreNormalizado: nombre.toLowerCase(), rolId: roles.get(rol)! } })).id;
  ana = await persona("ana@x.cr", "Ana Uno", "Tesorero");
  beto = await persona("beto@x.cr", "Beto Dos", "Tesorero");
  jefa = await persona("jefa@x.cr", "Jefa Tres", "Jefatura");
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  cuentaA = (await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: CUENTA_A } })).id;
  cuentaB = (await prisma.cuenta.create({ data: { sociedadId: sociedadB, numero: CUENTA_B } })).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: `a${mes}`, sociedadId: sociedadA, cuentaId: cuentaA, mes, estado: "leido" } });
    const b = await prisma.archivoImportado.create({ data: { ruta: `BBB/${mes}.xlsx`, hash: `b${mes}`, sociedadId: sociedadB, cuentaId: cuentaB, mes, estado: "leido" } });
    if (mes === "2026-10") [archivoA, archivoB] = [a.id, b.id];
  }
  const categoria = await prisma.categoria.findFirstOrThrow();
  const crear = async (sociedadId: number, proveedor: string, identificador: string) =>
    (await prisma.obligacion.create({ data: { sociedadId, categoriaId: categoria.id, proveedor, identificador, diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) } })).id;
  luz = await crear(sociedadA, "Luz Uno", "7771234");
  agua = await crear(sociedadA, "Agua", "8881111");
  gas = await crear(sociedadB, "Gas", "9990000");
  // movimientos que dan cobertura (el primero está antes de cualquier rango de búsqueda)
  for (const [c, a] of [[cuentaA, archivoA], [cuentaB, archivoB]] as const) {
    await mov(c, a, dia(2026, 9, 3), "COMISION INICIAL");
    await mov(c, a, dia(2026, 10, 26), "COMISION SIN RELACION");
  }
  await actualizarVencimientos(reloj);
});

describe("permisos", () => {
  it("sin persona 401; un tesorero ajeno 403; Jefatura y el tesorero propio sí; sin modo de pruebas no hay persona", async () => {
    const id = (await venc(luz)).id;
    const rutas: [("GET" | "POST"), string, object | undefined][] = [
      ["GET", `/api/vencimientos/${id}/pagos-candidatos`, undefined],
      ["POST", `/api/vencimientos/${id}/asociar-pago`, { movimiento: 1, motivo: "Prueba de permiso" }],
      ["POST", `/api/vencimientos/${id}/quitar-asociacion`, { motivo: "Prueba de permiso" }],
    ];
    for (const [m, u, p] of rutas) {
      expect((await pedir(m, u, null, p)).statusCode, u).toBe(401);
      const ajeno = await pedir(m, u, beto, p);
      expect(ajeno.statusCode, u).toBe(403);
      expect(ajeno.json()).toEqual({ error: expect.any(String) });
      expect((await pedir(m, u, ana, p)).statusCode, u).not.toBe(403);
      expect((await pedir(m, u, jefa, p)).statusCode, u).not.toBe(403);
    }
    expect(await prisma.decisionManual.count()).toBe(0);
    const sinModo = await crearApp({ reloj, modoPruebas: false });
    try {
      expect((await sinModo.inject({ method: "GET", url: `/api/vencimientos/${id}/pagos-candidatos`, headers: enc(ana) })).statusCode).toBe(401);
    } finally {
      await sinModo.close();
    }
    expect((await pedir("GET", "/api/vencimientos/999999/pagos-candidatos", ana)).statusCode).toBe(404);
    expect((await pedir("GET", "/api/vencimientos/0/pagos-candidatos", ana)).statusCode).toBe(400);
  });
});

describe("estados que lo permiten", () => {
  it("Vencido sí; Pagado no (409 en candidatos, asociar y quitar)", async () => {
    expect((await venc(luz)).estado).toBe("vencido");
    expect((await candidatos(luz)).statusCode).toBe(200);
    await movA(dia(2026, 10, 14), "PAGO LUZ 7771234");
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("pagado");
    expect((await candidatos(luz)).statusCode).toBe(409);
    const otro = await movA(dia(2026, 10, 16), "OTRA COSA");
    expect((await asociar(luz, otro.id)).statusCode).toBe(409);
    expect((await quitar(luz)).statusCode).toBe(409); // no hay asociación manual
  });

  it("Por revisar sí; Sin información sí", async () => {
    const dos = await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId: (await prisma.categoria.findFirstOrThrow()).id, proveedor: "Luz Dos", identificador: "7771234", diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) } });
    await movA(dia(2026, 10, 15), "PAGO 7771234");
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("por_revisar");
    expect((await candidatos(luz)).statusCode).toBe(200);
    expect((await candidatos(dos.id)).statusCode).toBe(200);
    await prisma.archivoImportado.updateMany({ where: { sociedadId: sociedadA, mes: "2026-10" }, data: { retiradoEn: new Date() } });
    await actualizarVencimientos(reloj);
    expect((await venc(agua)).estado).toBe("sin_informacion");
    expect((await candidatos(agua)).statusCode).toBe(200);
  });
});

describe("candidatos", () => {
  it("misma sociedad, libres, dentro de la ventana, por cercanía y luego por fecha; con monto, cuenta enmascarada y descripción enmascarada", async () => {
    const m1 = await movA(dia(2026, 10, 20), "TRANSFERENCIA ALFA 123456789012", 1500000n); // a 5 días
    const m2 = await movA(dia(2026, 10, 14), "COBRO BETA"); // a 1 día
    const m3 = await movA(dia(2026, 10, 14), "COBRO GAMMA"); // a 1 día, misma fecha
    const m4 = await movA(dia(2026, 10, 17), "COBRO DELTA"); // a 2 días
    await mov(cuentaA, archivoA, dia(2026, 10, 15), "UN CREDITO", 0n, 9000n); // crédito: no es un pago
    await mov(cuentaB, archivoB, dia(2026, 10, 15), "PAGO DE OTRA SOCIEDAD"); // otra sociedad
    await movA(dia(2026, 8, 1), "MUY ANTIGUO"); // fuera de la ventana de 30 días
    await movA(dia(2026, 11, 20), "MUY POSTERIOR");
    await movA(dia(2026, 10, 15), "PAGO AGUA 8881111"); // respalda el vencimiento de agua: no está libre
    await actualizarVencimientos(reloj);
    const r = await candidatos(luz);
    expect(r.statusCode).toBe(200);
    const datos = r.json().datos as Cand[];
    // el movimiento de relleno del 26 de octubre (a 11 días) también es un pago libre de la sociedad
    const relleno = await prisma.movimiento.findFirstOrThrow({ where: { cuentaId: cuentaA, descripcion: "COMISION SIN RELACION" } });
    expect(datos.map((c) => c.movimientoId)).toEqual([m2.id, m3.id, m4.id, m1.id, relleno.id]);
    expect(datos[3]).toMatchObject({ fecha: "2026-10-20", descripcion: "TRANSFERENCIA ALFA ****9012", cuenta: "****1234", monto: 1500000, moneda: null });
    for (const prohibido of ["123456789012", CUENTA_A, CUENTA_B]) expect(r.body).not.toContain(prohibido);
    // la ventana es un parámetro
    await prisma.parametro.updateMany({ where: { clave: "ventana_asociacion_manual_dias" }, data: { valor: "3" } });
    expect(((await candidatos(luz)).json().datos as Cand[]).map((c) => c.movimientoId)).toEqual([m2.id, m3.id, m4.id]); // m1 está a 5 días y el relleno a 11
    await prisma.parametro.updateMany({ where: { clave: "ventana_asociacion_manual_dias" }, data: { valor: "abc" } }); // inválido: respaldo de 30
    expect((await candidatos(luz)).json().datos).toHaveLength(5);
  });

  it("cada pago trae las marcas «número» y «proveedor», y se ordena por grupos antes que por cercanía", async () => {
    const ambos = await movA(dia(2026, 10, 24), "PAGO LUZ UNO 7771234"); // número y proveedor, a 9 días (fuera del rango del cruce: no se asigna solo)
    const soloNumero = await movA(dia(2026, 10, 25), "PAGO 7771234"); // número, a 10 días
    const numeroEnReferencia = await prisma.movimiento.create({
      data: { cuentaId: cuentaA, archivoId: archivoA, hoja: "H", fila: 5000, periodo: "2026-10", fecha: dia(2026, 10, 18), descripcion: "TRANSFERENCIA", referencia: "7771234", debito: 5000n, credito: 0n, claveDedup: "r".padEnd(40, "0") },
    }); // el número está en la referencia, a 3 días
    const soloProveedor = await movA(dia(2026, 10, 15), "COBRO LUZ UNO"); // proveedor, el más cercano de todos
    const ninguno = await movA(dia(2026, 10, 15), "COBRO BETA"); // ninguna marca, igual de cercano
    await actualizarVencimientos(reloj);
    expect((await venc(luz)).estado).toBe("vencido"); // nada de esto es un pago de la ventana del cruce con el número
    const datos = (await candidatos(luz)).json().datos as (Cand & { traeNumero: boolean; traeProveedor: boolean })[];
    const relleno = await prisma.movimiento.findFirstOrThrow({ where: { cuentaId: cuentaA, descripcion: "COMISION SIN RELACION" } });
    expect(datos.map((c) => c.movimientoId)).toEqual([ambos.id, numeroEnReferencia.id, soloNumero.id, soloProveedor.id, ninguno.id, relleno.id]);
    const marcas = (id: number) => {
      const c = datos.find((x) => x.movimientoId === id)!;
      return [c.traeNumero, c.traeProveedor];
    };
    expect(marcas(ambos.id)).toEqual([true, true]);
    expect(marcas(soloNumero.id)).toEqual([true, false]);
    expect(marcas(numeroEnReferencia.id)).toEqual([true, false]);
    expect(marcas(soloProveedor.id)).toEqual([false, true]);
    expect(marcas(ninguno.id)).toEqual([false, false]);
    // nada nuevo expuesto: las mismas claves de siempre más las dos marcas, y la cuenta sigue enmascarada
    expect(Object.keys(datos[0]!).sort()).toEqual(["banco", "cuenta", "descripcion", "fecha", "moneda", "monto", "movimientoId", "traeNumero", "traeProveedor"]);
    expect(datos[0]!.cuenta).toBe("****1234");
    expect(JSON.stringify(datos)).not.toContain(CUENTA_A);
  });

  it("el tope de 50 se aplica después de ordenar: un pago con marca lejano entra y uno sin marca cercano queda fuera", async () => {
    await prisma.movimiento.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ cuentaId: cuentaA, archivoId: archivoA, hoja: "H", fila: 2000 + i, periodo: "2026-10", fecha: dia(2026, 10, 12 + (i % 7)), descripcion: `COBRO ${i}`, debito: 100n, credito: 0n, claveDedup: `t${String(i).padStart(3, "0")}`.padEnd(40, "0") })),
    });
    const lejano = await movA(dia(2026, 11, 20), "PAGO LUZ UNO 7771234"); // a 36 días: fuera de la ventana de 30
    const dentro = await movA(dia(2026, 11, 10), "PAGO LUZ UNO 7771234"); // a 26 días: dentro, pero más lejos que los 55 sin marca
    const datos = (await candidatos(luz)).json().datos as (Cand & { traeNumero: boolean })[];
    expect(datos).toHaveLength(50);
    expect(datos[0]!.movimientoId).toBe(dentro.id); // el que trae número y proveedor entra y va primero aunque esté lejos
    expect(datos.map((c) => c.movimientoId)).not.toContain(lejano.id); // la ventana no cambió
    // de los 56 libres sin marca (55 más el relleno) solo caben 49: los más lejanos quedan fuera
    expect(datos.filter((c) => !c.traeNumero)).toHaveLength(49);
  });

  it("como máximo 50", async () => {
    await prisma.movimiento.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({ cuentaId: cuentaA, archivoId: archivoA, hoja: "H", fila: 1000 + i, periodo: "2026-10", fecha: dia(2026, 10, 1 + (i % 28)), descripcion: `COBRO ${i}`, debito: 100n, credito: 0n, claveDedup: `m${String(i).padStart(3, "0")}`.padEnd(40, "0") })),
    });
    expect((await candidatos(luz)).json().datos).toHaveLength(50);
  });

  it("sin pagos libres cerca de la fecha, lista vacía", async () => {
    await prisma.parametro.updateMany({ where: { clave: "ventana_asociacion_manual_dias" }, data: { valor: "3" } }); // el único pago libre (relleno) está a 11 días
    expect((await candidatos(luz)).json().datos).toEqual([]);
  });
});

describe("asociar y quitar", () => {
  it("asociar: Pagado con la decisión, el pago sale de los demás, el historial queda en la misma transacción y sin montos ni cuentas", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA", 777777n);
    const r = await asociar(luz, elegido.id, "  Se pagó  con otra referencia ");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ estado: "pagado" });
    const v = await venc(luz);
    expect(v).toMatchObject({ estado: "pagado", movimientoId: elegido.id, motivo: "Pago asociado a mano", diferenciaDias: -1 });
    const d = await prisma.decisionManual.findFirstOrThrow();
    expect(d).toMatchObject({
      tipo: "asociacion_pago", sociedadId: sociedadA, obligacionId: luz, periodo: "2026-10", movimientoId: elegido.id, claveMovimiento: elegido.claveDedup,
      motivo: "Se pagó con otra referencia", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true, vigente: true,
      unicaObligacionPeriodo: `${luz}|2026-10`, unicaMovimiento: elegido.claveDedup, revertidaPorId: null, revertidaEn: null,
    });
    // historial: una línea, con el periodo y nada más
    const h = await prisma.historialCambio.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      entidad: "vencimiento", entidadId: v.id, obligacionId: luz, sociedadId: sociedadA, accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: "2026-10",
      motivo: "Se pagó con otra referencia", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true,
    });
    for (const prohibido of ["777777", CUENTA_A, "7771234", "COBRO"]) expect(JSON.stringify(h)).not.toContain(prohibido);
    // el pago ya no se ofrece a otro vencimiento y no se puede usar otra vez
    expect(((await candidatos(agua)).json().datos as Cand[]).map((c) => c.movimientoId)).not.toContain(elegido.id);
    expect((await asociar(agua, elegido.id)).statusCode).toBe(409);
    // ya está pagado: no admite otra asociación
    expect((await asociar(luz, (await movA(dia(2026, 10, 16), "OTRO")).id)).statusCode).toBe(409);
    // estable: volver a calcular no cambia nada
    expect((await actualizarVencimientos(reloj)).cambiados).toBe(0);
  });

  it("gana a Por revisar: el otro vencimiento del grupo se recalcula solo", async () => {
    const dos = await prisma.obligacion.create({ data: { sociedadId: sociedadA, categoriaId: (await prisma.categoria.findFirstOrThrow()).id, proveedor: "Luz Dos", identificador: "7771234", diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) } });
    const pago = await movA(dia(2026, 10, 15), "PAGO 7771234");
    await actualizarVencimientos(reloj);
    expect([(await venc(luz)).estado, (await venc(dos.id)).estado]).toEqual(["por_revisar", "por_revisar"]);
    expect(((await candidatos(luz)).json().datos as Cand[]).map((c) => c.movimientoId)).toContain(pago.id);
    expect((await asociar(luz, pago.id)).statusCode).toBe(200);
    expect(await venc(luz)).toMatchObject({ estado: "pagado", movimientoId: pago.id });
    expect(await venc(dos.id)).toMatchObject({ estado: "vencido", movimientoId: null });
  });

  it("quitar: vuelve al estado calculado, la decisión queda como no vigente (nada se borra) y el historial lo registra", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA");
    await asociar(luz, elegido.id);
    const r = await quitar(luz, "  La asociación   era de otro mes ");
    expect(r.statusCode).toBe(200);
    expect(r.json().datos).toEqual({ estado: "vencido" });
    expect(await venc(luz)).toMatchObject({ estado: "vencido", movimientoId: null });
    const filas = await prisma.decisionManual.findMany();
    expect(filas).toHaveLength(1); // no se borró
    expect(filas[0]).toMatchObject({
      vigente: false, unicaObligacionPeriodo: null, unicaMovimiento: null, revertidaPorId: ana, nombreRevierte: "Ana Uno", motivoReversion: "La asociación era de otro mes",
    });
    expect(filas[0]!.revertidaEn).toBeInstanceOf(Date);
    const h = await prisma.historialCambio.findMany({ orderBy: { id: "asc" } });
    expect(h.map((x) => [x.accion, x.campo, x.antes, x.despues, x.motivo])).toEqual([
      ["asociar_pago", "pago_asociado", null, "2026-10", "Se pagó con otra referencia"],
      ["quitar_asociacion", "pago_asociado", "2026-10", null, "La asociación era de otro mes"],
    ]);
    expect((await quitar(luz)).statusCode).toBe(409); // ya no hay asociación
    // después de quitar se puede volver a asociar, también el mismo pago; quedan las dos decisiones
    expect((await asociar(luz, elegido.id)).statusCode).toBe(200);
    const todas = await prisma.decisionManual.findMany({ orderBy: { id: "asc" } });
    expect(todas.map((x) => x.vigente)).toEqual([false, true]);
  });

  it("motivo y pago inválidos: 422 y no se guarda nada", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA");
    for (const motivo of [null, "", "ab", "x".repeat(301), 123]) {
      const r = await asociar(luz, elegido.id, motivo);
      expect(r.statusCode, String(motivo)).toBe(422);
      expect(r.json().campo).toBe("motivo");
    }
    for (const movimiento of [null, "x", 0, -1, 1.5]) {
      const r = await asociar(luz, movimiento);
      expect(r.statusCode, String(movimiento)).toBe(422);
      expect(r.json().campo).toBe("movimiento");
    }
    expect((await asociar(luz, 999_999)).statusCode).toBe(409); // un pago que no está entre los candidatos
    await asociar(luz, elegido.id);
    for (const motivo of [null, "", "ab", "x".repeat(301)]) expect((await quitar(luz, motivo)).statusCode, String(motivo)).toBe(422);
    expect(await prisma.decisionManual.count({ where: { vigente: true } })).toBe(1);
    expect(await prisma.historialCambio.count()).toBe(1);
  });

  it("si el registro falla, nada se guarda (misma transacción)", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA");
    const v = (await vencimientoParaAsociar((await venc(luz)).id))!;
    // una persona que no existe hace fallar el insert dentro de la transacción
    await expect(asociarPago({ vencimiento: v, movimientoId: elegido.id, motivo: "Prueba de rollback", autor: { id: 999_999, nombre: "Nadie", modoPruebas: true } }, reloj)).rejects.toThrow();
    expect(await prisma.decisionManual.count()).toBe(0);
    expect(await prisma.historialCambio.count()).toBe(0);
    expect((await venc(luz)).estado).toBe("vencido");
    await expect(asociarPago({ vencimiento: { ...v, estado: "pagado" }, movimientoId: elegido.id, motivo: "Prueba", autor: { id: ana, nombre: "Ana Uno", modoPruebas: true } }, reloj)).rejects.toBeInstanceOf(ErrorDeServicio);
  });
});

describe("invariantes en la base", () => {
  it("una sola asociación vigente por pago y por (obligación, periodo); al revertir se libera", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA");
    const otro = await movA(dia(2026, 10, 16), "COBRO OTRO");
    await asociar(luz, elegido.id);
    const datos = (clave: string, obligacionId: number, periodo: string) => ({
      tipo: "asociacion_pago", sociedadId: sociedadA, obligacionId, periodo, claveMovimiento: clave, motivo: "Prueba", usuarioId: ana, nombreUsuario: "Ana Uno", modoPruebas: true,
      unicaObligacionPeriodo: `${obligacionId}|${periodo}`, unicaMovimiento: clave,
    });
    // el mismo pago para otro vencimiento
    await expect(prisma.decisionManual.create({ data: datos(elegido.claveDedup, agua, "2026-10") })).rejects.toThrow();
    // otro pago para el mismo vencimiento
    await expect(prisma.decisionManual.create({ data: datos(otro.claveDedup, luz, "2026-10") })).rejects.toThrow();
    // otro pago para otro vencimiento sí cabe
    await expect(prisma.decisionManual.create({ data: datos(otro.claveDedup, agua, "2026-10") })).resolves.toBeTruthy();
    await prisma.decisionManual.deleteMany({ where: { obligacionId: agua } });
    // revertida, la base ya no la cuenta
    await quitar(luz);
    await expect(prisma.decisionManual.create({ data: datos(elegido.claveDedup, luz, "2026-10") })).resolves.toBeTruthy();
  });
});

describe("sin efecto y huella estable", () => {
  it("si el movimiento desaparece, la decisión sigue vigente sin efecto (la API lo indica) y se puede quitar; si el archivo se vuelve a leer, vuelve a valer", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA");
    await asociar(luz, elegido.id);
    // el archivo se vuelve a leer: los movimientos se recrean con otro id y la misma huella
    await prisma.movimiento.delete({ where: { id: elegido.id } });
    const decision = await prisma.decisionManual.findFirstOrThrow();
    expect(decision).toMatchObject({ vigente: true, movimientoId: null, claveMovimiento: elegido.claveDedup });
    await actualizarVencimientos(reloj);
    expect(await venc(luz)).toMatchObject({ estado: "vencido", movimientoId: null });
    const lista = async (actor: number) => ((await pedir("GET", "/api/vencimientos?periodo=2026-10", actor)).json().datos as { obligacionId: number; asociadoAMano: { quien: string; motivo: string } | null; sinEfecto: boolean; puedeGestionar: boolean }[]).find((x) => x.obligacionId === luz)!;
    expect(await lista(ana)).toMatchObject({ asociadoAMano: { quien: "Ana Uno", motivo: "Se pagó con otra referencia" }, sinEfecto: true, puedeGestionar: true });
    const detalle = (await pedir("GET", `/api/vencimientos/${(await venc(luz)).id}`, ana)).json().datos;
    expect(detalle).toMatchObject({ sinEfecto: true, puedeGestionar: true, asociadoAMano: { quien: "Ana Uno" } });
    // vuelve a leerse el archivo: mismo movimiento (misma huella), id nuevo
    const nuevo = await prisma.movimiento.create({ data: { cuentaId: cuentaA, archivoId: archivoA, hoja: "H", fila: 999, periodo: "2026-10", fecha: dia(2026, 10, 14), descripcion: "COBRO BETA", debito: 5000n, credito: 0n, claveDedup: elegido.claveDedup } });
    await actualizarVencimientos(reloj);
    expect(await venc(luz)).toMatchObject({ estado: "pagado", movimientoId: nuevo.id });
    expect(await lista(ana)).toMatchObject({ sinEfecto: false });
    // desaparece otra vez y se quita estando sin efecto
    await prisma.movimiento.delete({ where: { id: nuevo.id } });
    await actualizarVencimientos(reloj);
    expect((await quitar(luz)).statusCode).toBe(200);
    expect((await lista(ana)).asociadoAMano).toBeNull();
  });
});

describe("lo que informa la lista y el detalle", () => {
  it("asociadoAMano (quién, cuándo y por qué) y puedeGestionar según la persona; la frase del detalle sigue funcionando", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA");
    await asociar(luz, elegido.id);
    type Fila = { obligacionId: number; estado: string; asociadoAMano: { quien: string; cuando: string; motivo: string } | null; sinEfecto: boolean; puedeGestionar: boolean };
    const lista = async (actor: number | null) => (await pedir("GET", "/api/vencimientos?periodo=2026-10", actor)).json().datos as Fila[];
    const deAna = await lista(ana);
    const fLuz = deAna.find((x) => x.obligacionId === luz)!;
    expect(fLuz).toMatchObject({ estado: "pagado", asociadoAMano: { quien: "Ana Uno", motivo: "Se pagó con otra referencia" }, sinEfecto: false, puedeGestionar: true });
    expect(fLuz.asociadoAMano!.cuando).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(deAna.find((x) => x.obligacionId === agua)).toMatchObject({ estado: "vencido", asociadoAMano: null, sinEfecto: false, puedeGestionar: true });
    // Jefatura ve todo y puede gestionar todo; Beto solo lo suyo; sin persona nadie
    expect((await lista(jefa)).filter((x) => x.puedeGestionar)).toHaveLength(3);
    expect(await lista(beto)).toMatchObject([{ obligacionId: gas, puedeGestionar: true }]);
    expect((await lista(null)).every((x) => x.puedeGestionar === false)).toBe(true);
    // un vencimiento pagado de forma automática no ofrece nada
    await movA(dia(2026, 10, 15), "PAGO AGUA 8881111");
    await actualizarVencimientos(reloj);
    expect((await lista(ana)).find((x) => x.obligacionId === agua)).toMatchObject({ estado: "pagado", asociadoAMano: null, puedeGestionar: false });
    // el detalle: la frase de siempre y lo de la asociación
    const d = (await pedir("GET", `/api/vencimientos/${(await venc(luz)).id}`, ana)).json().datos;
    expect(d.textos.resumen).toMatch(/^Vencía el .* y se pagó el .*\(1 día antes\)\.$/);
    expect(d).toMatchObject({ estado: "pagado", asociadoAMano: { quien: "Ana Uno", motivo: "Se pagó con otra referencia" }, sinEfecto: false, puedeGestionar: true });
    // Beto no puede gestionar el detalle de AAA aunque pidiera verlo
    const deBeto = await pedir("GET", `/api/vencimientos/${(await venc(luz)).id}`, beto);
    if (deBeto.statusCode === 200) expect(deBeto.json().datos.puedeGestionar).toBe(false);
  });

  it("la línea aparece en el Historial de cambios, con el periodo y sin montos ni cuentas", async () => {
    const elegido = await movA(dia(2026, 10, 14), "COBRO BETA", 888888n);
    await asociar(luz, elegido.id);
    const r = await pedir("GET", "/api/historial-cambios", ana);
    expect(r.statusCode).toBe(200);
    expect(r.json().datos[0]).toMatchObject({ accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: "2026-10", nombreUsuario: "Ana Uno", modoPruebas: true, obligacion: { proveedor: "Luz Uno", identificador: "****1234" } });
    for (const prohibido of ["888888", CUENTA_A, "7771234"]) expect(r.body).not.toContain(prohibido);
    expect((await pedir("GET", "/api/historial-cambios", beto)).json().total).toBe(0); // la sociedad de otro no se ve
  });
});
