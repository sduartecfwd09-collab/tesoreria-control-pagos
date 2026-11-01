import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { MOTIVOS } from "../src/domain/cruce.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// «Avisos» y «Movimientos sin obligación» (solo lectura), con datos inventados. Hoy = 27 de octubre de 2026.
// Los estados de los vencimientos se escriben a mano: las pantallas leen lo que dejó el motor y no recalculan nada.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number;
let beto: number;
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let categoriaId: number;

async function crearObligacion(sociedadId: number, proveedor: string, identificador: string, responsable: string | null = null) {
  return prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 10, controlDesde: dia(2026, 10, 1), responsable } });
}
async function crearVencimiento(o: Awaited<ReturnType<typeof crearObligacion>>, estado: string, fecha: Date, extra: object = {}) {
  return prisma.vencimiento.create({ data: { obligacionId: o.id, fecha, periodo: fecha.toISOString().slice(0, 7), estado, ...copiaDeObligacion(o), ...extra } });
}

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  beto = (await prisma.usuario.create({ data: { correo: "beto@x.cr", nombre: "Beto Dos", nombreNormalizado: "beto dos", rolId: roles.get("Tesorero")!, diasAviso: 7 } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  await prisma.parametro.updateMany({ where: { clave: "aviso_dias" }, data: { valor: "3" } });
});
afterAll(async () => {
  await vaciarUsuarios();
  await vaciarImportaciones();
});

/** Una obligación de Ana (tesorera de AAA) y dos de Beto (tesorero de BBB). */
async function escenario() {
  const luz = await crearObligacion(sociedadA, "Luz Ana", "7771234"); // la tesorera de AAA, Ana
  const agua = await crearObligacion(sociedadB, "Agua Beto", "8885678"); // tesorero de BBB: Beto
  const gas = await crearObligacion(sociedadB, "Gas Beto", "9990001"); // el tesorero de BBB, Beto
  await crearVencimiento(luz, "vencido", dia(2026, 10, 10), { motivo: MOTIVOS.vencido });
  await crearVencimiento(luz, "pagado", dia(2026, 9, 10)); // pagado: nunca aparece
  await crearVencimiento(agua, "por_vencer", dia(2026, 10, 25), { motivo: MOTIVOS.esperaPago }); // pasó hace 2 días
  await crearVencimiento(agua, "por_revisar", dia(2026, 9, 25), { motivo: MOTIVOS.compartido });
  await crearVencimiento(gas, "proyectado", dia(2026, 11, 5)); // aviso de Beto: 7 días
  await crearVencimiento(gas, "sin_informacion", dia(2026, 10, 12), { motivo: MOTIVOS.sinInformacion, sinInfoHasta: dia(2026, 10, 5) });
  return { luz, agua, gas };
}

type Respuesta = { alcance: { tipo: string; nombre: string | null }; usuario: { nombre: string } | null; diasAviso: number; total: number; grupos: { clave: string; total: number; filas: { id: number; proveedor: string; identificador: string; estado: string; textoEstado: string; pasaAPorVencerEl: string | null; sociedad: string }[] }[] };
const avisos = async (modoPruebas: boolean, cabeceras: Record<string, string> = {}) => {
  const app = await crearApp({ reloj, modoPruebas });
  try {
    return (await app.inject({ method: "GET", url: "/api/avisos", headers: cabeceras })).json() as Respuesta;
  } finally {
    await app.close();
  }
};
const proveedoresDe = (r: Respuesta) => r.grupos.flatMap((g) => g.filas.map((f) => f.proveedor)).sort();

describe("Avisos", () => {
  it("sin persona elegida muestra todo, en cuatro grupos con su contador (sin Programados), sin los pagados y con el identificador enmascarado", async () => {
    await escenario();
    const r = await avisos(false);
    expect(r.alcance).toEqual({ tipo: "todo", nombre: null });
    expect(r.grupos.map((g) => [g.clave, g.total])).toEqual([["vencidos", 1], ["por_vencer", 1], ["por_revisar", 1], ["sin_informacion", 1]]);
    expect(r.total).toBe(4); // el programado de Gas y el pagado de Luz no se listan
    const luz = r.grupos[0]!.filas[0]!;
    expect(luz).toMatchObject({ proveedor: "Luz Ana", identificador: "****1234", estado: "vencido" });
    expect(JSON.stringify(r)).not.toContain("7771234");
  });

  it("un tesorero ve lo de las obligaciones de sus sociedades", async () => {
    await escenario();
    const deAna = await avisos(true, encabezado(ana));
    expect(deAna.alcance).toEqual({ tipo: "mio", nombre: "Ana Uno" });
    expect(deAna.usuario).toMatchObject({ nombre: "Ana Uno" });
    expect(proveedoresDe(deAna)).toEqual(["Luz Ana"]);
    const deBeto = await avisos(true, encabezado(beto));
    expect(proveedoresDe(deBeto)).toEqual(["Agua Beto", "Agua Beto", "Gas Beto"]);
    expect(deBeto.total).toBe(3);
  });

  it("Jefatura ve todo; el encabezado se ignora sin MODO_PRUEBAS", async () => {
    await escenario();
    const jefatura = await avisos(true, encabezado(jefa));
    expect(jefatura.alcance).toEqual({ tipo: "todo", nombre: null });
    expect(jefatura.total).toBe(4);
    const sinModo = await avisos(false, encabezado(ana));
    expect(sinModo.alcance.tipo).toBe("todo");
    expect(sinModo.total).toBe(4);
  });

  it("Por vencer dice «El día de pago pasó hace N días; se espera el pago.»; los Programados no se listan", async () => {
    await escenario();
    const r = await avisos(false);
    expect(r.grupos.find((g) => g.clave === "por_vencer")!.filas[0]!.textoEstado).toBe("El día de pago pasó hace 2 días; se espera el pago.");
    expect(r.grupos.map((g) => g.clave)).not.toContain("programados");
  });

  it("muestra el aviso de la persona: el propio o el general", async () => {
    await escenario();
    expect((await avisos(true, encabezado(beto))).diasAviso).toBe(7);
    expect((await avisos(true, encabezado(ana))).diasAviso).toBe(3);
  });

  it("estado vacío: un tesorero sin obligaciones no tiene nada por atender", async () => {
    await escenario();
    const sinNada = await prisma.usuario.create({ data: { correo: "c@x.cr", nombre: "Carla Cuatro", nombreNormalizado: "carla cuatro", rolId: (await mapaDeRoles()).get("Tesorero")! } });
    const r = await avisos(true, encabezado(sinNada.id));
    expect(r).toMatchObject({ alcance: { tipo: "mio", nombre: "Carla Cuatro" }, total: 0 });
    expect(r.grupos.every((g) => g.total === 0)).toBe(true);
  });

  it("no escribe nada en la base: los estados y las fechas de actualización quedan iguales", async () => {
    await escenario();
    const foto = async () => JSON.stringify(await prisma.vencimiento.findMany({ orderBy: { id: "asc" } }), (_k, v) => (typeof v === "bigint" ? Number(v) : v));
    const antes = await foto();
    await avisos(true, encabezado(ana));
    await avisos(false);
    expect(await foto()).toBe(antes);
  });
});

describe("Movimientos sin obligación", () => {
  let cuentaE1: number;
  let cuentaOtroBanco: number;
  let archivoE1: number;
  let archivoOtro: number;
  let n = 0;

  const movimiento = (cuentaId: number, archivoId: number, fecha: Date, descripcion: string, debito: bigint, credito = 0n) =>
    prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito, claveDedup: `x${n}`.padEnd(40, "0") } });

  beforeEach(async () => {
    cuentaE1 = (await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: "CR0000000000000000001234", formato: "E1", codigoBanco: "0107" } })).id;
    cuentaOtroBanco = (await prisma.cuenta.create({ data: { sociedadId: sociedadB, numero: "CR0000000000000000005678", formato: "E2", codigoBanco: "0102" } })).id;
    archivoE1 = (await prisma.archivoImportado.create({ data: { ruta: "AAA/a.xlsx", hash: "a", sociedadId: sociedadA, cuentaId: cuentaE1, mes: "2026-10", estado: "leido" } })).id;
    archivoOtro = (await prisma.archivoImportado.create({ data: { ruta: "BBB/b.xlsx", hash: "b", sociedadId: sociedadB, cuentaId: cuentaOtroBanco, mes: "2026-10", estado: "leido" } })).id;
  });

  const lista = async () => {
    const app = await crearApp({ reloj });
    try {
      return (await app.inject("/api/movimientos-sin-obligacion")).json() as { datos: { proveedor: string; identificador: string; pagos: number; primeraFecha: string; ultimaFecha: string; sociedades: string[]; cuentas: string[] }[]; totalPagos: number; totalGrupos: number; nota: string };
    } finally {
      await app.close();
    }
  };

  it("lista solo los débitos «Pago:PROVEEDOR número» del banco 0107 cuyo número no está en el catálogo, agrupados por proveedor y número", async () => {
    await crearObligacion(sociedadA, "Luz Ana", "7771234"); // este número sí está en el catálogo
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 3), "Pago:TIGO 55500055", 1000n);
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 20), "Pago:TIGO 55500055", 1000n);
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 9), "Pago:CNFL 66600066", 2000n);
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 10), "Pago:ICE 7771234", 3000n); // número del catálogo: no se lista
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 11), "COMISION SIN FORMA 88800088", 500n); // sin la forma «Pago:»
    await movimiento(cuentaOtroBanco, archivoOtro, dia(2026, 10, 12), "Pago:ICETEL 99900099", 700n); // otro banco
    const r = await lista();
    expect(r.datos.map((g) => [g.proveedor, g.identificador, g.pagos])).toEqual([["TIGO", "****0055", 2], ["CNFL", "****0066", 1]]);
    expect(r.datos[0]).toMatchObject({ primeraFecha: "2026-10-03", ultimaFecha: "2026-10-20", sociedades: ["Sociedad AAA"], cuentas: ["****1234"] });
    expect(r).toMatchObject({ totalGrupos: 2, totalPagos: 3, alcance: { tipo: "todo", nombre: null } });
    expect(JSON.stringify(r)).not.toContain("Revisar con Tesorería");
    const texto = JSON.stringify(r);
    for (const prohibido of ["55500055", "66600066", "CR0000"]) expect(texto).not.toContain(prohibido);
  });

  it("los créditos nunca aparecen, aunque la descripción tenga la forma de pago", async () => {
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 3), "Pago:TIGO 55500055", 0n, 1000n); // crédito
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 4), "Pago:CNFL 66600066", 2000n); // débito
    const r = await lista();
    expect(r.datos.map((g) => g.proveedor)).toEqual(["CNFL"]);
    expect(r.totalPagos).toBe(1);
  });

  it("filtra por fecha del movimiento (desde y hasta, ambos incluidos) en la lista y en el detalle, y rechaza fechas inválidas", async () => {
    await movimiento(cuentaE1, archivoE1, dia(2026, 9, 30), "Pago:TIGO 55500055", 1000n);
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 3), "Pago:TIGO 55500055", 1000n);
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 20), "Pago:TIGO 55500055", 1000n);
    const app = await crearApp({ reloj });
    try {
      const pedir = async (consulta: string) => (await app.inject(`/api/movimientos-sin-obligacion${consulta}`)).json() as { totalPagos: number; datos: { clave: string; primeraFecha: string; ultimaFecha: string }[]; error?: string };
      expect((await pedir("")).totalPagos).toBe(3);
      const octubre = await pedir("?desde=2026-10-01&hasta=2026-10-31");
      expect(octubre.totalPagos).toBe(2);
      expect(octubre.datos[0]).toMatchObject({ primeraFecha: "2026-10-03", ultimaFecha: "2026-10-20" });
      expect((await pedir("?desde=2026-10-03&hasta=2026-10-03")).totalPagos).toBe(1);
      expect((await pedir("?desde=2026-11-01")).totalPagos).toBe(0);
      const detalle = (await app.inject(`/api/movimientos-sin-obligacion/detalle?clave=${encodeURIComponent(octubre.datos[0]!.clave)}&desde=2026-10-01&hasta=2026-10-31`)).json() as { datos: { pagos: unknown[] } };
      expect(detalle.datos.pagos).toHaveLength(2);
      expect((await app.inject("/api/movimientos-sin-obligacion?desde=2026-13-01")).statusCode).toBe(400);
      expect((await app.inject("/api/movimientos-sin-obligacion?desde=2026-10-31&hasta=2026-10-01")).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("un servicio desactivado sigue siendo del catálogo; la lista vacía se informa con ceros; no escribe nada", async () => {
    const o = await crearObligacion(sociedadA, "Luz Ana", "7771234");
    await prisma.obligacion.update({ where: { id: o.id }, data: { activa: false } });
    await movimiento(cuentaE1, archivoE1, dia(2026, 10, 10), "Pago:ICE 7771234", 3000n);
    const antes = await prisma.movimiento.count();
    const r = await lista();
    expect(r).toMatchObject({ datos: [], totalGrupos: 0, totalPagos: 0 });
    expect(await prisma.movimiento.count()).toBe(antes);
    expect(await prisma.obligacion.count()).toBe(1);
  });
});
