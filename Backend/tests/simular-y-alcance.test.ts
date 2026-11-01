import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { simularCruce, textoSimulacion } from "../src/vencimientos/simular.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Alcance común a todas las pantallas y simulación del cruce, con datos inventados. Hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number;
let beto: number;
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let cuentaA: number;
let cuentaB: number;
let archivoA: number;
let archivoB: number;
let categoriaId: number;
let n = 0;

const obligacion = (sociedadId: number, proveedor: string, identificador: string, extra: object = {}) =>
  prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 20, controlDesde: dia(2026, 10, 1), ...extra } });
const movimiento = (cuentaId: number, archivoId: number, fecha: Date, descripcion: string, debito: bigint, credito = 0n) =>
  prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: fecha.toISOString().slice(0, 7), fecha, descripcion, debito, credito, claveDedup: `a${n}`.padEnd(40, "0") } });

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await fijarRango(3, 12);
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  beto = (await prisma.usuario.create({ data: { correo: "beto@x.cr", nombre: "Beto Dos", nombreNormalizado: "beto dos", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  cuentaA = (await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: "CR0000000000000000001111", formato: "E1", codigoBanco: "0107" } })).id;
  cuentaB = (await prisma.cuenta.create({ data: { sociedadId: sociedadB, numero: "CR0000000000000000002222", formato: "E1", codigoBanco: "0107" } })).id;
  archivoA = (await prisma.archivoImportado.create({ data: { ruta: "AAA/CR0000000000000000001111 1026 AAA.xlsx", hash: "a", sociedadId: sociedadA, cuentaId: cuentaA, mes: "2026-10", estado: "leido", numMovimientos: 1 } })).id;
  archivoB = (await prisma.archivoImportado.create({ data: { ruta: "BBB/CR0000000000000000002222 1026 BBB.xlsx", hash: "b", sociedadId: sociedadB, cuentaId: cuentaB, mes: "2026-10", estado: "leido", numMovimientos: 1 } })).id;
});
afterAll(async () => {
  await fijarRango(10, 12);
  await vaciarUsuarios();
  await vaciarImportaciones();
});

/** Luz (AAA, tesorera Ana), Agua y Gas (BBB, tesorero Beto). */
async function escenario() {
  const luz = await obligacion(sociedadA, "Luz Ana", "7771234");
  const agua = await obligacion(sociedadB, "Agua Beto", "8885678");
  const gas = await obligacion(sociedadB, "Gas Beto", "9990001");
  await movimiento(cuentaA, archivoA, dia(2026, 10, 26), "COMISION", 100n);
  await movimiento(cuentaB, archivoB, dia(2026, 10, 26), "COMISION", 100n);
  await movimiento(cuentaA, archivoA, dia(2026, 10, 21), "Pago:TIGO 55500055", 1000n);
  await movimiento(cuentaB, archivoB, dia(2026, 10, 22), "Pago:CNFL 66600066", 2000n);
  await actualizarVencimientos(reloj);
  return { luz, agua, gas };
}

const llamar = async (url: string, cabeceras: Record<string, string> = {}, modoPruebas = true) => {
  const app = await crearApp({ reloj, modoPruebas });
  try {
    const r = await app.inject({ method: "GET", url, headers: cabeceras });
    return { codigo: r.statusCode, cuerpo: r.json() };
  } finally {
    await app.close();
  }
};

describe("una sola regla de alcance", () => {
  it("Pagos del mes y Vencidos: un tesorero ve solo sus obligaciones y las tarjetas cuentan lo mismo; Jefatura y sin persona ven todo", async () => {
    await escenario();
    const proveedores = (c: { cuerpo: { datos: { proveedor: string }[] } }) => c.cuerpo.datos.map((v) => v.proveedor).sort();
    const todo = await llamar("/api/vencimientos?periodo=2026-10&porPagina=500", encabezado(jefa));
    expect(proveedores(todo)).toEqual(["Agua Beto", "Gas Beto", "Luz Ana"]);
    expect(todo.cuerpo.alcance).toEqual({ tipo: "todo", nombre: null });
    const deAna = await llamar("/api/vencimientos?periodo=2026-10&porPagina=500", encabezado(ana));
    expect(proveedores(deAna)).toEqual(["Luz Ana"]);
    expect(deAna.cuerpo.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    expect(Object.values(deAna.cuerpo.resumen as Record<string, number>).reduce((s, x) => s + x, 0)).toBe(1); // las tarjetas respetan el alcance
    const deBeto = await llamar("/api/vencimientos?periodo=2026-10&porPagina=500", encabezado(beto));
    expect(proveedores(deBeto)).toEqual(["Agua Beto", "Gas Beto"]);
    expect(Object.values(deBeto.cuerpo.resumen as Record<string, number>).reduce((s, x) => s + x, 0)).toBe(2);
    expect(proveedores(await llamar("/api/vencimientos?periodo=2026-10&porPagina=500", {}, true))).toHaveLength(3); // sin persona elegida: todo
    expect(proveedores(await llamar("/api/vencimientos?periodo=2026-10&porPagina=500", encabezado(ana), false))).toHaveLength(3); // sin modo de pruebas el encabezado no vale
  });

  it("el detalle de un vencimiento ajeno no existe para el tesorero", async () => {
    const { agua, luz } = await escenario();
    const idAgua = (await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: agua.id } })).id;
    const idLuz = (await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: luz.id } })).id;
    expect((await llamar(`/api/vencimientos/${idAgua}`, encabezado(ana))).codigo).toBe(404);
    expect((await llamar(`/api/vencimientos/${idLuz}`, encabezado(ana))).codigo).toBe(200);
    expect((await llamar(`/api/vencimientos/${idAgua}`, encabezado(jefa))).codigo).toBe(200);
  });

  it("Obligaciones: lista, resumen y detalle respetan el alcance", async () => {
    const { agua } = await escenario();
    const lista = await llamar("/api/obligaciones?porPagina=500", encabezado(ana));
    expect((lista.cuerpo.datos as { proveedor: string }[]).map((o) => o.proveedor)).toEqual(["Luz Ana"]);
    expect(lista.cuerpo.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    expect((await llamar("/api/obligaciones/resumen", encabezado(ana))).cuerpo.datos.activas).toBe(1);
    expect((await llamar("/api/obligaciones/resumen", encabezado(jefa))).cuerpo.datos.activas).toBe(3);
    expect((await llamar(`/api/obligaciones/${agua.id}`, encabezado(ana))).codigo).toBe(404);
    expect((await llamar(`/api/obligaciones/${agua.id}`, encabezado(beto))).codigo).toBe(200);
  });

  it("Estados de cuenta: por las sociedades de las que es tesorero", async () => {
    await escenario();
    const archivosDe = async (id: number) => ((await llamar("/api/importaciones", encabezado(id))).cuerpo.datos as { sociedad: string }[]).map((a) => a.sociedad).sort();
    expect(await archivosDe(ana)).toEqual(["Sociedad AAA"]);
    expect(await archivosDe(beto)).toEqual(["Sociedad BBB"]); // tesorero de BBB
    expect(await archivosDe(jefa)).toEqual(["Sociedad AAA", "Sociedad BBB"]);
    const cob = await llamar("/api/cobertura", encabezado(ana));
    expect((cob.cuerpo.datos.filas as unknown[]).length).toBe(1);
    expect(cob.cuerpo.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    expect((await llamar("/api/importaciones", encabezado(ana))).cuerpo.resumen.leidos).toBe(1); // los contadores también
  });

  it("Movimientos sin obligación: por las sociedades de las que es tesorero", async () => {
    await escenario();
    const deAna = (await llamar("/api/movimientos-sin-obligacion", encabezado(ana))).cuerpo;
    expect((deAna.datos as { proveedor: string }[]).map((g) => g.proveedor)).toEqual(["TIGO"]);
    expect(deAna.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    const deBeto = (await llamar("/api/movimientos-sin-obligacion", encabezado(beto))).cuerpo;
    expect((deBeto.datos as { proveedor: string }[]).map((g) => g.proveedor).sort()).toEqual(["CNFL"]);
    expect(((await llamar("/api/movimientos-sin-obligacion", encabezado(jefa))).cuerpo.datos as unknown[]).length).toBe(2);
  });

  it("Mi configuración es personal: Jefatura también tiene la suya y no depende del alcance", async () => {
    const r = await llamar("/api/mi-configuracion", encabezado(jefa));
    expect(r.codigo).toBe(200);
    expect(r.cuerpo.datos.usuario.nombre).toBe("Jefa Tres");
  });
});

describe("cruzar:simular", () => {
  const foto = async () => JSON.stringify([
    await prisma.vencimiento.findMany({ orderBy: { id: "asc" } }),
    await prisma.movimiento.findMany({ orderBy: { id: "asc" } }),
    await prisma.archivoImportado.findMany({ orderBy: { id: "asc" } }),
    await prisma.parametro.findMany({ orderBy: { id: "asc" } }),
    await prisma.obligacion.findMany({ orderBy: { id: "asc" } }),
  ], (_k, v) => (typeof v === "bigint" ? Number(v) : v));

  it("no escribe nada en la base, ni siquiera con un «hoy» fuera del calendario", async () => {
    await escenario();
    const antes = await foto();
    for (const fecha of [dia(2026, 10, 5), dia(2026, 10, 27), dia(2026, 12, 15)]) await simularCruce(fecha);
    expect(await foto()).toBe(antes);
  });

  it("ignora los movimientos posteriores al «hoy» simulado y cambia los estados según la fecha", async () => {
    const { luz } = await escenario();
    await movimiento(cuentaA, archivoA, dia(2026, 10, 22), "PAGO LUZ 7771234", 5000n); // paga la de Luz el 22
    await actualizarVencimientos(reloj);
    expect((await prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: luz.id } })).estado).toBe("pagado");
    const el15 = await simularCruce(dia(2026, 10, 15));
    expect(el15.porEstado.pagado ?? 0).toBe(0); // el pago del 22 todavía no existía
    expect(el15.movimientosIgnorados).toBeGreaterThanOrEqual(4);
    expect(el15.porEstado.proyectado).toBeGreaterThan(0); // faltan más de 3 días para el 20
    const el18 = await simularCruce(dia(2026, 10, 18));
    expect(el18.porEstado.por_vencer).toBeGreaterThan(0); // dentro de los días de aviso (el 20 menos 3 = el 17)
    expect((await simularCruce(dia(2026, 10, 27))).porEstado.pagado).toBe(1);
  });

  it("si el «hoy» cae más allá del calendario, planifica los vencimientos que faltan en memoria", async () => {
    await obligacion(sociedadA, "Luz Ana", "7771234");
    await movimiento(cuentaA, archivoA, dia(2026, 10, 26), "COMISION", 100n);
    await actualizarVencimientos(reloj); // el calendario real solo llega a octubre
    expect(await prisma.vencimiento.count()).toBe(1);
    const r = await simularCruce(dia(2026, 12, 15));
    expect(r).toMatchObject({ vencimientos: 3, delCalendario: 1, planificadosEnMemoria: 2 }); // octubre del calendario; noviembre y diciembre en memoria
    expect(r.porEstado.proyectado).toBe(1); // el 20 de diciembre aún no entra en los días de aviso
    expect(await prisma.vencimiento.count()).toBe(1); // y nada se guardó
    expect(textoSimulacion(r)).toContain("planificados en memoria: 2");
    expect(textoSimulacion(r)).toContain("no se escribió nada en la base");
  });

  it("un vencimiento con otra frecuencia no se planifica en meses que no le tocan", async () => {
    await obligacion(sociedadA, "Agua Bi", "4440004", { frecuencia: "bimestral", mesArranque: 10 });
    await actualizarVencimientos(reloj);
    const r = await simularCruce(dia(2026, 12, 15)); // octubre y diciembre tocan; noviembre no
    expect(r.vencimientos).toBe(2);
  });
});
