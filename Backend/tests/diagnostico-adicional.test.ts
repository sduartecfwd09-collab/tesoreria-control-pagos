import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { listarArchivos } from "../src/repositories/consultas.js";
import { cargarDescripcionesPorSociedad, primerasFechasPorCuenta } from "../src/repositories/cruce.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { informeAdicionalCruce } from "../src/vencimientos/diagnostico-adicional.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarDiasDespues, vaciarImportaciones } from "./helpers/db.js";

// Diagnóstico adicional con datos inventados. Hoy = 2026-10-27, ventana -3/+3.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let sociedadId: number;
let cuentaId: number;
let archivoOct: number;
let categoriaId: number;
let n = 0;

const mov = (fecha: Date, descripcion: string, debito: bigint, credito = 0n) =>
  prisma.movimiento.create({
    data: { cuentaId, archivoId: archivoOct, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito, claveDedup: `d${n}`.padEnd(40, "0") },
  });

async function informe() {
  await actualizarVencimientos(reloj);
  const r = await cruzarVencimientos(reloj);
  const archivos = (await listarArchivos()).filter((a) => a.retiradoEn === null);
  return informeAdicionalCruce(r, [{ id: sociedadId, codigo: "AAA" }], {
    descripcionesPorSociedad: await cargarDescripcionesPorSociedad(), primeraFechaPorCuenta: await primerasFechasPorCuenta(), archivos,
  });
}

beforeEach(async () => {
  await vaciarImportaciones();
  await fijarDiasDespues(3);
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001234" } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido", numMovimientos: 1 } });
    if (mes === "2026-10") archivoOct = a.id;
  }
  await mov(dia(2026, 10, 26), "COMISION SIN RELACION", 100n); // último día con datos
});
afterAll(async () => {
  await fijarDiasDespues(12);
  await vaciarImportaciones();
});

const obligacion = (proveedor: string, identificador: string, extra: object = {}) =>
  prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1), ...extra } });

describe("diagnóstico adicional del cruce", () => {
  it("1: distancia del débito con el identificador fuera de la ventana; 2: obligaciones sin coincidencia; 3: ventana antes de la primera fecha", async () => {
    await obligacion("Luz Uno", "7771234");
    await obligacion("Agua Dos", "8880000");
    await obligacion("Fono Tres", "9990000");
    await mov(dia(2026, 10, 20), "PAGO LUZ 7771234", 5000n); // 5 días después: fuera de la ventana
    await mov(dia(2026, 9, 3), "DEVOLUCION 8880000", 0n, 700n); // crédito de otra fecha con el identificador de Agua
    const t = await informe();
    // 1
    expect(t).toMatch(/vencido: 3 evaluados · con un débito fuera de la ventana: 1 · sin ninguno en ±15 días: 2\n\s+\+5 días: 1/);
    // 2: las tres sin coincidencia dentro de la ventana; Luz (un débito fuera de ventana) y Agua (un crédito) tienen su identificador en alguna descripción
    expect(t).toContain("total: 3 · de ellas con el identificador en alguna descripción de cualquier movimiento de la sociedad (cualquier fecha y cuenta, débito o crédito): 2");
    expect(t).toContain("AAA | Agua Dos: 1 (con el identificador en alguna descripción: 1)");
    expect(t).toContain("AAA | Fono Tres: 1 (con el identificador en alguna descripción: 0)");
    expect(t).toContain("AAA | Luz Uno: 1 (con el identificador en alguna descripción: 1)");
    // 3: la primera fecha con datos es el 3 de septiembre; ninguna ventana de octubre empieza antes
    expect(t).toContain("primera fecha de AAA: A 2026-09-03 · B 2026-09-03");
    expect(t).toContain("AAA | 2026-10: 3 vencidos · A 0 · B 0");
  });

  it("3 y 6: el vencimiento cuyo rango empieza antes de la primera fecha cargada ya no es Vencido: queda Sin información y se cuenta aparte", async () => {
    await obligacion("Luz Uno", "7771234", { diaEsperadoPago: 2, controlDesde: dia(2026, 10, 1) }); // rango desde el 29 de septiembre
    await prisma.movimiento.updateMany({ data: { fecha: dia(2026, 10, 10) } }); // los datos empiezan el 10 de octubre
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-09" }, data: { retiradoEn: new Date() } });
    const t = await informe();
    expect(t).toContain("6. Sin información porque el rango de búsqueda empieza antes de la primera fecha con movimientos cargados");
    expect(t).toMatch(/total: 1\n\s+AAA \| 2026-10: 1/);
  });

  it("4: archivos con imagen y cero movimientos con un pago esperado ese mes (por cuenta y por sociedad)", async () => {
    const cuenta2 = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000005678" } })).id;
    const cuenta3 = (await prisma.cuenta.create({ data: { sociedadId: (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } })).id, numero: "CR0000000000000000009999" } })).id;
    await prisma.archivoImportado.create({ data: { ruta: "AAA/c2.xlsx", hash: "c2", sociedadId, cuentaId: cuenta2, mes: "2026-10", estado: "leido", detalle: JSON.stringify({ conImagenes: true }) } });
    await prisma.archivoImportado.create({ data: { ruta: "BBB/c3.xlsx", hash: "c3", cuentaId: cuenta3, mes: "2026-10", estado: "leido", detalle: JSON.stringify({ conImagenes: true }) } });
    await obligacion("Luz Uno", "7771234", { cuentaEsperadaId: cuenta2 }); // esperaba pagar desde la cuenta 2 en octubre
    const t = await informe();
    expect(t).toContain("4. Archivos con imagen y cero movimientos: 2");
    expect(t).toContain("(cuenta de pago esperada de algún vencimiento del mes): 1");
    expect(t).toContain("en la sociedad de la cuenta (cualquier cuenta): 1");
  });

  it("no imprime descripciones, identificadores ni cuentas", async () => {
    await obligacion("Luz Uno", "7771234");
    await mov(dia(2026, 10, 20), "SECRETOXYZ 7771234", 5000n);
    const t = await informe();
    for (const prohibido of ["SECRETOXYZ", "7771234", "CR0000"]) expect(t).not.toContain(prohibido);
  });
});
