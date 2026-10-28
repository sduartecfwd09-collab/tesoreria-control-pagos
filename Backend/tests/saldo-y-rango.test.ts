import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { verificarContinuidad } from "../src/ingest/calidad.js";
import { leerEstadoDeCuenta, leerLibro } from "../src/ingest/lector.js";
import { parsearNombreArchivo } from "../src/ingest/nombre-archivo.js";
import { razonDeContinuidad, textoSaldo } from "../src/domain/saldo.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { copiaDeObligacion, fijarRango, vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Pruebas con datos inventados. Hoy = 2026-10-27; rango -3/+12 salvo que la prueba lo cambie.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let sociedadId: number;
let cuentaId: number;
let archivoOct: number;
let categoriaId: number;
let n = 0;

const debito = (fecha: Date, descripcion: string) =>
  prisma.movimiento.create({
    data: { cuentaId, archivoId: archivoOct, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito: 5000n, credito: 0n, claveDedup: `s${n}`.padEnd(40, "0") },
  });
const obligacion = (proveedor: string, identificador: string, diaPago: number) =>
  prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: diaPago, controlDesde: dia(2026, 10, 1) } });
const vencimientoDe = (obligacionId: number, periodo = "2026-10") => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId, periodo } });
const fijar = (clave: string, valor: string) => prisma.parametro.updateMany({ where: { clave }, data: { valor } });

beforeEach(async () => {
  await vaciarImportaciones();
  await fijarRango(3, 12);
  await fijar("marcar_vencido_sin_estado", "no");
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001234" } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido", numMovimientos: 1 } });
    if (mes === "2026-10") archivoOct = a.id;
  }
  await debito(dia(2026, 9, 1), "COMISION INICIAL"); // los datos empiezan antes de cualquier rango
  await debito(dia(2026, 10, 26), "COMISION"); // datos hasta el 26 de octubre
});
afterAll(async () => {
  await fijar("marcar_vencido_sin_estado", "no");
  await fijarRango(10, 12);
  await vaciarImportaciones();
});

describe("grupo con el mismo número de servicio", () => {
  it("Cabletica y Movistar con el mismo número (****1083) y un movimiento «CABLETICA» el día 1: Cabletica Pagado; Movistar se evalúa por su cuenta", async () => {
    const cabletica = await obligacion("Cabletica", "5551083", 3);
    const movistar = await obligacion("Movistar", "5551083", 20);
    await debito(dia(2026, 10, 1), "PAGO CABLETICA 5551083");
    await actualizarVencimientos(reloj);
    expect(await vencimientoDe(cabletica.id)).toMatchObject({ estado: "pagado", diferenciaDias: -2 });
    const m = await vencimientoDe(movistar.id);
    expect(m.estado).not.toBe("por_revisar");
    expect(m.movimientoId).toBeNull();
  });
});

describe("estado de cuenta cuyo saldo no cuadra", () => {
  const marcar = (estado: string) => prisma.archivoImportado.updateMany({ where: { mes: "2026-10", cuentaId }, data: { detalle: JSON.stringify({ continuidad: { estado, verificados: 4, fallos: 1, motivo: "hay movimientos sin saldo" } }) } });

  it("no cuadra: no cuenta como cobertura y queda Sin información, nunca Vencido (ni con «Marcar Vencido» encendido)", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10); // sin pago: con cobertura sería Vencido
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("vencido");
    await marcar("no_cuadra");
    await actualizarVencimientos(reloj);
    expect(await vencimientoDe(o.id)).toMatchObject({ estado: "sin_informacion", motivo: "Un estado de cuenta no cuadra con su saldo: no se usa para confirmar si hubo pago" });
    await fijar("marcar_vencido_sin_estado", "si");
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("sin_informacion");
  });

  it("no verificable: la cobertura sigue por fechas (Vencido)", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    await marcar("no_verificable");
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("vencido");
  });

  it("un pago encontrado en un archivo que no cuadra sigue siendo Pagado (el archivo solo deja de ser cobertura)", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    await debito(dia(2026, 10, 9), "PAGO LUZ 7771234");
    await marcar("no_cuadra");
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("pagado");
  });
});

describe("rango de búsqueda: días antes", () => {
  it("un pago 5 días antes del día del catálogo: Vencido con 3 días antes, Pagado con 7", async () => {
    const o = await obligacion("Luz Uno", "7771234", 10);
    await debito(dia(2026, 10, 5), "PAGO LUZ 7771234");
    await actualizarVencimientos(reloj);
    expect((await vencimientoDe(o.id)).estado).toBe("vencido");
    await fijar("ventana_dias_antes", "7");
    await actualizarVencimientos(reloj);
    expect(await vencimientoDe(o.id)).toMatchObject({ estado: "pagado", diferenciaDias: -5 });
  });

  it("un mismo pago no respalda dos vencimientos al ampliar los días antes", async () => {
    const o = await obligacion("Luz Uno", "7771234", 20);
    await actualizarVencimientos(reloj);
    // segundo vencimiento de la misma obligación movido al 28 de octubre: su rango se solapa con el del primero
    await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha: dia(2026, 10, 28), periodo: "2026-11", ...copiaDeObligacion(o) } });
    await fijar("ventana_dias_antes", "7");
    const respaldos = async () => (await prisma.vencimiento.findMany({ where: { obligacionId: o.id, movimientoId: { not: null } } })).map((v) => v.movimientoId);

    await debito(dia(2026, 10, 23), "PAGO LUZ 7771234"); // 3 días del primero, 5 del segundo: va solo al más cercano
    await cruzarVencimientos(reloj);
    expect((await vencimientoDe(o.id, "2026-10")).movimientoId).not.toBeNull();
    expect((await vencimientoDe(o.id, "2026-11")).movimientoId).toBeNull();
    expect((await respaldos()).length).toBe(1);

    await prisma.movimiento.updateMany({ where: { descripcion: "PAGO LUZ 7771234" }, data: { fecha: dia(2026, 10, 24) } }); // 4 y 4: empate
    await cruzarVencimientos(reloj);
    expect(await respaldos()).toEqual([]);
    expect((await vencimientoDe(o.id, "2026-10")).estado).toBe("por_revisar");
    expect((await vencimientoDe(o.id, "2026-11")).estado).toBe("por_revisar");
  });
});

describe("Estados de cuenta muestra los tres resultados del saldo", () => {
  it("la API da el resultado y el motivo en lenguaje claro, por archivo y por celda", async () => {
    const det = (estado: string, extra: object = {}) => JSON.stringify({ continuidad: { estado, ...extra }, fechas: { del: "2026-10-01", al: "2026-10-26" } });
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-10", cuentaId }, data: { detalle: det("no_cuadra", { verificados: 4, fallos: 1, filasConFallo: [7] }) } });
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-09", cuentaId }, data: { detalle: det("no_verificable", { razon: "saldo_vacio_todas" }) } });
    for (const [mes, mmaa] of [["2026-09", "0926"], ["2026-10", "1026"]] as const) {
      await prisma.archivoImportado.updateMany({ where: { mes, cuentaId }, data: { ruta: `AAA/CR0000000000000000001234 ${mmaa} AAA.xlsx` } }); // nombre con la convención, para que la cobertura lo ubique
    }
    const app = await crearApp({ reloj });
    try {
      const imp = (await app.inject("/api/importaciones")).json().datos as { mes: string; saldo: { resultado: string; motivo: string } | null; fechas: { del: string } | null }[];
      const oct = imp.find((a) => a.mes === "2026-10")!;
      expect(oct.saldo).toMatchObject({ resultado: "no_cuadra" });
      expect(oct.saldo!.motivo).toContain("En 1 de 4 comparaciones");
      expect(oct.fechas?.del).toBe("2026-10-01");
      const sep = imp.find((a) => a.mes === "2026-09")!;
      expect(sep.saldo).toMatchObject({ resultado: "no_verificable" });
      expect(sep.saldo!.motivo).toContain("no trae saldo en ninguna fila");
      const cob = (await app.inject("/api/cobertura")).json().datos as { filas: { celdas: Record<string, { saldo?: string; saldoMotivo?: string }> }[] };
      expect(cob.filas[0]!.celdas["2026-10"]).toMatchObject({ saldo: "no_cuadra" });
      expect(cob.filas[0]!.celdas["2026-10"]!.saldoMotivo).toContain("Sin información");
    } finally {
      await app.close();
    }
  });
});

describe("saldo del estado de cuenta: lector y textos", () => {
  const mv = (fila: number, debito: number, credito: number, saldo: number | null) => ({
    hoja: "H", fila, fecha: new Date(Date.UTC(2026, 7, 1)), referencia: null, codigo: null, descripcion: "x", debito, credito, saldo,
  });

  it("tolerancia de redondeo: una diferencia de 1 centavo cuadra con tolerancia 1 y no cuadra con 0", () => {
    const movs = [mv(1, 0, 10000, 110001), mv(2, 5000, 0, 105001)];
    expect(verificarContinuidad(movs, { apertura: 100000, tolerancia: 1 }).estado).toBe("cuadra");
    expect(verificarContinuidad(movs, { apertura: 100000, tolerancia: 0 }).estado).toBe("no_cuadra");
    expect(verificarContinuidad([mv(1, 0, 10000, 110002)], { apertura: 100000, tolerancia: 1 }).estado).toBe("no_cuadra");
  });

  it("razones de «no verificable»: sin movimientos, saldo vacío en todas o algunas filas, un solo saldo", () => {
    expect(verificarContinuidad([], { apertura: null }).razon).toBe("sin_movimientos");
    expect(verificarContinuidad([mv(1, 0, 1, null), mv(2, 0, 1, null)], { apertura: null }).razon).toBe("saldo_vacio_todas");
    const algunas = verificarContinuidad([mv(1, 0, 1, 5), mv(2, 0, 1, null)], { apertura: null });
    expect(algunas).toMatchObject({ razon: "saldo_vacio_algunas", movimientos: 2, filasSinSaldo: 1 });
    expect(verificarContinuidad([mv(1, 0, 100, 500)], { apertura: null }).razon).toBe("un_solo_saldo");
  });

  it("los archivos guardados antes de registrar la razón se reconocen por su texto", () => {
    expect(razonDeContinuidad({ estado: "no_verificable", motivo: "hay movimientos sin saldo" })).toBe("saldo_vacio_algunas");
    expect(razonDeContinuidad({ estado: "no_verificable", motivo: "algo raro" })).toBe("otro");
    expect(razonDeContinuidad({ estado: "cuadra" })).toBeNull();
  });

  it("textos de los tres resultados en lenguaje claro", () => {
    expect(textoSaldo({ estado: "cuadra" })).toMatchObject({ resultado: "cuadra" });
    const no = textoSaldo({ estado: "no_cuadra", verificados: 10, fallos: 2 })!;
    expect(no.queSePaso).toBe("En 2 de 10 comparaciones el saldo no coincide.");
    expect(no.queSignifica).toContain("Sin información");
    expect(no.queHacer).toContain("Revise el archivo");
    const nv = textoSaldo({ estado: "no_verificable", razon: "un_solo_saldo", movimientos: 1 })!;
    expect(nv).toMatchObject({ resultado: "no_verificable", queSePaso: "Este archivo trae un solo movimiento, así que no hay un saldo anterior para revisar." });
    expect(nv.queSignifica).toContain("La cobertura sigue por fechas");
    expect(textoSaldo({ estado: "no_verificable", razon: "sin_movimientos" })!.queSePaso).toBe("Este archivo no trae movimientos del mes.");
    expect(textoSaldo({ estado: "no_verificable", razon: "un_solo_saldo", movimientos: 3 })!.queSePaso).toContain("movimientos de un solo día");
    // lenguaje claro: tres partes, sin paréntesis técnicos ni «con qué comparar»
    for (const t of [no, nv, textoSaldo({ estado: "cuadra" })!, textoSaldo({ estado: "no_verificable", razon: "saldo_vacio_algunas", filasSinSaldo: 2, movimientos: 9 })!]) {
      expect(t.motivo).toBe(`${t.queSePaso} ${t.queSignifica} ${t.queHacer}`);
      expect(t.motivo).not.toMatch(/[()]|con qué comparar/);
    }
    expect(textoSaldo(null)).toBeNull();
  });

  it("el lector guarda el Del y Al reales y el período que declara el encabezado", async () => {
    const r = leerEstadoDeCuenta(await leerLibro(await M.e1()), parsearNombreArchivo("CR91010710102200000001 0826 ZFL.xlsx"));
    expect(r.fechas).toEqual({ del: "2026-08-03", al: "2026-08-20" });
    expect(r).toHaveProperty("periodoDeclarado");
  });
});
