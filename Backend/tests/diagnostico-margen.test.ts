import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { cruzar } from "../src/domain/cruce.js";
import { DEFINICIONES } from "../src/domain/parametros.js";
import { listarArchivos } from "../src/repositories/consultas.js";
import { categoriasPorObligacion, creditosParaDiagnostico, debitosParaFormato } from "../src/repositories/cruce.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { informeMargenCruce } from "../src/vencimientos/diagnostico-margen.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones } from "./helpers/db.js";

// Diagnóstico del margen con datos inventados. Hoy = 2026-10-27, -3/+12.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let sociedadId: number;
let otraSociedadId: number;
let cuentaId: number;
let cuentaOtraId: number;
let archivoId: number;
let archivoOtroId: number;
let categoriaId: number;
let n = 0;

const mov = (cuenta: number, archivo: number, fecha: Date, descripcion: string, debito: bigint, extra: object = {}) =>
  prisma.movimiento.create({
    data: { cuentaId: cuenta, archivoId: archivo, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito: 0n, claveDedup: `m${n}`.padEnd(40, "0"), ...extra },
  });
const debito = (fecha: Date, descripcion: string, extra: object = {}) => mov(cuentaId, archivoId, fecha, descripcion, 5000n, extra);
const obligacion = (proveedor: string, identificador: string) =>
  prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) } });

async function informe(diasLejos = 45, umbralesImagen?: { grandePct: number; esquinaPct: number }) {
  await actualizarVencimientos(reloj);
  const r = await cruzarVencimientos(reloj);
  const anterior = cruzar({ ...r.datos, ...r.parametros, diasDespues: 3 });
  
  return informeMargenCruce(r, { diasDespues: 3, resultados: anterior.resultados }, [{ id: sociedadId, codigo: "AAA" }, { id: otraSociedadId, codigo: "BBB" }], {
    categorias: await categoriasPorObligacion(), debitosFormato: await debitosParaFormato(), creditos: await creditosParaDiagnostico(), archivos: (await listarArchivos()).filter((a) => a.retiradoEn === null), diasLejos, umbralesImagen,
  });
}

beforeEach(async () => {
  await vaciarImportaciones();
  await fijarRango(3, 12);
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  otraSociedadId = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } })).id;
  cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001234", formato: "E1", codigoBanco: "0107" } })).id;
  cuentaOtraId = (await prisma.cuenta.create({ data: { sociedadId: otraSociedadId, numero: "CR0000000000000000005678", formato: "E2", codigoBanco: "0102" } })).id;
  categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido", numMovimientos: 1 } });
    if (mes === "2026-10") archivoId = a.id;
    const b = await prisma.archivoImportado.create({ data: { ruta: `BBB/${mes}.xlsx`, hash: `b${mes}`, sociedadId: otraSociedadId, cuentaId: cuentaOtraId, mes, estado: "leido", numMovimientos: 1 } });
    if (mes === "2026-10") archivoOtroId = b.id;
  }
  await debito(dia(2026, 9, 1), "COMISION SIN RELACION"); // primera fecha de AAA: 1 de septiembre
  await mov(cuentaOtraId, archivoOtroId, dia(2026, 9, 1), "COMISION BBB", 100n);
  await debito(dia(2026, 10, 26), "COMISION OTRA"); // datos de AAA hasta el 26 de octubre
});
afterAll(async () => {
  await fijarRango(10, 12);
  await vaciarImportaciones();
});

describe("diagnóstico del margen del cruce", () => {
  it("el parámetro «días después» arranca en 12 y su descripción no usa la palabra ventana", () => {
    const d = DEFINICIONES.find((x) => x.clave === "ventana_dias_despues")!;
    expect(d.valorInicial).toBe("12");
    expect(d.ayuda.toLowerCase()).not.toContain("ventana");
  });


  it("0 y 1: cifras antes y después del margen, y distribución de la fecha de pago", async () => {
    await obligacion("Luz Uno", "7771234");
    await debito(dia(2026, 10, 20), "PAGO LUZ 7771234"); // 5 días después: con 3 es Vencido, con 12 es Pagado
    const t = await informe();
    expect(t).toContain("Pagado (incluye pagado con inconsistencia): 0 -> 1 · cobertura completa 0 -> 1 · parcial 0 -> 0");
    expect(t).toContain("Vencido: 1 -> 0");
    expect(t).toContain("10. Vencimientos que cambian de estado por la regla «desde»");
    expect(t).toContain("3 días antes (valor actual): ");
    expect(t).toContain("pagos que respaldan más de un vencimiento: 0");
    expect(t).toMatch(/7 días antes: Pagado 1 \(completa 1 · parcial 0\)/);
    expect(t).toMatch(/AAA \[cobertura completa\]: 1 pagos · antes de -10: 0 · después de \+20: 0\n\s+\+5: 1/);
  });

  it("2 y 8: clasifica antes, después, otra sociedad y no aparece; la lista enmascara el número", async () => {
    await obligacion("Antes Uno", "1110001"); // fecha 15 de oct: pago el 10 (5 días antes, fuera de -3)
    await obligacion("Despues Dos", "2220002"); // pago el 30 de oct: 15 días después, fuera de +12
    await obligacion("Otra Tres", "3330003");
    await obligacion("Nada Cuatro", "4440004");
    await debito(dia(2026, 10, 10), "PAGO ANTES 1110001");
    await debito(dia(2026, 10, 30), "PAGO DESPUES 2220002");
    await mov(cuentaOtraId, archivoOtroId, dia(2026, 9, 20), "PAGO OTRA 3330003", 5000n);
    const t = await informe();
    expect(t).toMatch(/\(a\) hay un débito con el número fuera del rango, antes: 1 /);
    expect(t).toMatch(/\(b\) hay un débito con el número fuera del rango, después: 1 /);
    expect(t).toMatch(/\(c\) el número aparece solo en una cuenta de otra sociedad: 1 /);
    expect(t).toMatch(/\(d\) el número no aparece en ningún archivo: 1 /);
    expect(t).toContain("AAA | Nada Cuatro |");
    expect(t).toContain("****0004");
    for (const completo of ["1110001", "2220002", "3330003", "4440004"]) expect(t).not.toContain(completo);
  });

  it("2: la distancia máxima es un parámetro; con 3 días el pago lejano pasa a (e)", async () => {
    await obligacion("Antes Uno", "1110001");
    await debito(dia(2026, 10, 10), "PAGO ANTES 1110001"); // 5 días antes de la fecha
    expect(await informe(10)).toMatch(/\(a\) [^\n]*: 1 /);
    const t = await informe(3);
    expect(t).toMatch(/\(a\) [^\n]*: 0 /);
    expect(t).toMatch(/\(e\) el número aparece en la sociedad, pero a más de 3 días[^\n]*: 1 /);
  });

  it("2 (h) y 2b: el número solo en un crédito, y créditos con un número del catálogo por formato", async () => {
    await obligacion("Luz Uno", "7771234");
    await mov(cuentaId, archivoId, dia(2026, 10, 12), "DEVOLUCION 7771234", 0n, { credito: 900n });
    await mov(cuentaId, archivoId, dia(2026, 10, 13), "OTRO CREDITO SIN NUMERO", 0n, { credito: 100n });
    const t = await informe();
    expect(t).toMatch(/\(h\) el número aparece en un crédito y en ningún débito de la sociedad: 1 /);
    expect(t).toMatch(/\(d\) el número no aparece en ningún archivo: 0 /);
    expect(t).toContain("E1: 2 créditos · con un número del catálogo: 1 (cobertura completa 1 · parcial 0)");
  });

  it("cobertura parcial: una cuenta sin archivo del mes separa las cifras y conserva el total", async () => {
    await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000009000", formato: "E1", codigoBanco: "0107" } }); // sin archivo
    const segunda = (await prisma.cuenta.findFirstOrThrow({ where: { numero: "CR0000000000000000009000" } })).id;
    await prisma.archivoImportado.create({ data: { ruta: "AAA/segunda-sep.xlsx", hash: "segunda", sociedadId, cuentaId: segunda, mes: "2026-09", estado: "leido", numMovimientos: 1 } });
    await obligacion("Luz Uno", "7771234");
    await debito(dia(2026, 10, 20), "PAGO LUZ 7771234");
    const t = await informe();
    expect(t).toContain("2026-10: 0 sociedades con cobertura completa · 1 con cobertura parcial (AAA)");
    expect(t).toContain("Pagado (incluye pagado con inconsistencia): 0 -> 1 · cobertura completa 0 -> 0 · parcial 0 -> 1");
    expect(t).toContain("AAA [cobertura parcial]: 1 pagos");
  });

  it("5b: columna de saldo, archivos que cuadran por formato, razones de «no verificable» y fechas", async () => {
    const detalle = (estado: string, motivo?: string, extra: object = {}) => JSON.stringify({ continuidad: { estado, motivo, usoSaldoApertura: estado === "cuadra" }, ...extra });
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-10", cuentaId }, data: { formato: "E1", detalle: detalle("cuadra", undefined, { fechas: { del: "2026-10-01", al: "2026-10-31" }, periodoDeclarado: { del: "2026-10-01", al: "2026-10-31" } }) } });
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-09", cuentaId }, data: { formato: "E1", detalle: detalle("no_cuadra") } });
    await prisma.archivoImportado.updateMany({ where: { cuentaId: cuentaOtraId }, data: { formato: "E2", detalle: detalle("no_verificable", "hay movimientos sin saldo") } });
    const t = await informe();
    expect(t).toMatch(/E1: columna de saldo en el formato: sí · archivos leídos: 2 /);
    expect(t).toMatch(/cuadran: 1 \([^)]*\) · no cuadran: 1 /);
    expect(t).toMatch(/Del y Al reales guardados: 1 [^\n]*declaran el período en el encabezado: 1 [^\n]*mismo Del y Al que las fechas reales: 1 /);
    expect(t).toMatch(/E2: columna de saldo en el formato: sí · archivos leídos: 2 [^\n]*\n\s+cuadran: 0 [^\n]*no verificables: 2 [^\n]*\n\s+no verificables porque algunas filas no traen saldo: 2 /);
  });

  it("3: obligaciones sin coincidencia por sociedad y proveedor", async () => {
    await obligacion("Fono Tres", "9990000");
    await obligacion("Luz Uno", "7771234");
    await debito(dia(2026, 10, 15), "PAGO LUZ 7771234");
    const t = await informe();
    expect(t).toContain("AAA | Fono Tres: 1 (cobertura completa 1 · parcial 0)");
  });

  it("4, 5 y 6: débitos «Pago:» sin obligación, por formato y variantes sin alias (ICETEL se reconoce como ICE)", async () => {
    await obligacion("ICE", "5550005");
    await debito(dia(2026, 10, 14), "Pago:ICE 55500051"); // proveedor reconocido, pero sin obligación con ese número
    await debito(dia(2026, 10, 14), "Pago:ICETEL 66600066"); // ICETEL: alias supuesto de ICE
    await debito(dia(2026, 10, 14), "Pago:TIGO 77700077");
    await debito(dia(2026, 10, 14), "OTRO SIN FORMA", { referencia: "12345678" });
    const t = await informe();
    expect(t).toContain("total: 3 (cobertura completa 3 · parcial 0) · identificadores distintos: 3 (de 3 débitos con esa forma)");
    expect(t).toMatch(/por proveedor reconocido[^\n]*\n\s+ICE: 2 /);
    expect(t).toMatch(/por proveedor NO reconocido:\n\s+TIGO: 1 /);
    expect(t).toContain("banco 0107 | formato E1: 6 débitos\n    cobertura completa: 6 débitos · con la forma de pago: 3 · con 8+ dígitos en descripción: 3, en referencia: 1");
    expect(t).toContain("TIGO: 1 (cobertura completa 1 · parcial 0) débitos · 1 identificadores distintos · correspondería a: sin sugerencia");
    expect(t).not.toContain("ICETEL");
  });

  it("7: vencimientos cuyo rango empieza antes de la primera fecha con datos", async () => {
    await prisma.movimiento.updateMany({ where: { cuentaId, fecha: dia(2026, 9, 1) }, data: { fecha: dia(2026, 10, 20) } }); // los datos de AAA empiezan el 20 de octubre
    await obligacion("Luz Uno", "7771234"); // rango desde el 12 de octubre
    const t = await informe();
    expect(t).toMatch(/total B: 1 \(cobertura completa 1 · parcial 0\) · de ellos A: 1/);
    expect(t).toContain("AAA | 2026-10: A 1 · B 1");
  });

  it("no imprime descripciones, cuentas ni identificadores completos", async () => {
    await obligacion("Luz Uno", "7771234");
    await debito(dia(2026, 10, 14), "SECRETOXYZ Pago:LUZ 12345678");
    const t = await informe();
    for (const prohibido of ["SECRETOXYZ", "7771234", "12345678", "CR0000"]) expect(t).not.toContain(prohibido);
  });
});

describe("sección 11: archivos sin movimientos con imagen", () => {
  it("cuenta cuántos vencimientos cambiarían de estado si esos archivos no dieran cobertura, sin cambiar la regla", async () => {
    await prisma.archivoImportado.updateMany({ where: { cuentaId, mes: "2026-10" }, data: { numMovimientos: 0, detalle: JSON.stringify({ conImagenes: true, continuidad: { estado: "no_verificable", razon: "sin_movimientos" } }), formato: "E3" } });
    await obligacion("Luz Uno", "7771234"); // sin pago: con la imagen como cobertura es Vencido
    const t = await informe();
    expect(t).toContain("11. Archivos sin movimientos con imagen");
    expect(t).toContain("archivos con logo u otra imagen pequeña (siguen dando cobertura): 1 (E3: 1)");
    expect(t).toContain("archivos con imagen no legible (sin cobertura): 0");
    expect(t).toMatch(/vencimientos que cambiarían de estado: 1 \(cobertura completa 1 · parcial 0\)\n\s+Vencido -> Sin información: 1/);
    expect(t).toMatch(/por sociedad y mes:\n\s+AAA \| 2026-10: 1/);
    expect(t).toContain("Vencido: 1 -> 1"); // la regla actual no cambió: sigue siendo Vencido
  });

  it("con imagen grande el archivo no cubre: el vencimiento ya está en Sin información por imagen no legible y se cuenta aparte", async () => {
    await prisma.archivoImportado.updateMany({ where: { cuentaId, mes: "2026-10" }, data: { numMovimientos: 0, detalle: JSON.stringify({ conImagenes: true, claseImagen: "posible_captura", continuidad: { estado: "no_verificable", razon: "imagen_no_legible" } }), formato: "E3" } });
    await obligacion("Luz Uno", "7771234");
    const t = await informe();
    expect(t).toContain("archivos con imagen no legible (sin cobertura): 1 (E3: 1)");
    expect(t).toContain("vencimientos hoy en Sin información por imagen no legible: 1 (cobertura completa");
    expect(t).toContain("archivos con logo u otra imagen pequeña (siguen dando cobertura): 0");
  });

  it("sin archivos con imagen no cambia nada", async () => {
    await obligacion("Luz Uno", "7771234");
    const t = await informe();
    expect(t).toContain("(siguen dando cobertura): 0");
    expect(t).toMatch(/vencimientos que cambiarían de estado: 0 /);
  });
});

describe("sección 12: archivos sin movimientos e imágenes", () => {
  const logo = { areaPct: 2, colInicioPct: 0, colFinPct: 20, filaInicioPct: 0, filaFinPct: 7 };
  const grande = { areaPct: 60, colInicioPct: 0, colFinPct: 90, filaInicioPct: 20, filaFinPct: 90 };
  const sinMov = { estado: "no_verificable", razon: "sin_movimientos" };

  it("clasifica por formato los archivos sin movimientos (logo, posible captura, sin imagen) y cuenta el bloque de saldos, sin nombres ni montos", async () => {
    await prisma.archivoImportado.updateMany({ where: { cuentaId, mes: "2026-10" }, data: { formato: "E3", numMovimientos: 0, detalle: JSON.stringify({ conImagenes: true, imagenes: [logo], continuidad: sinMov, encabezadoSaldos: { saldoInicial: true, saldoEnLibros: true, saldoDisponible: true, fecha: true, inicialIgualLibros: true } }) } });
    await prisma.archivoImportado.updateMany({ where: { cuentaId, mes: "2026-09" }, data: { formato: "E3", numMovimientos: 0, detalle: JSON.stringify({ conImagenes: false, imagenes: [], continuidad: sinMov, encabezadoSaldos: null }) } });
    const cuenta2 = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000009001" } })).id;
    await prisma.archivoImportado.create({ data: { ruta: "AAA/a-e1.xlsx", hash: "e1", sociedadId, cuentaId: cuenta2, mes: "2026-10", estado: "leido", formato: "E1", numMovimientos: 4, detalle: JSON.stringify({ conImagenes: true, imagenes: [grande], continuidad: { estado: "cuadra" } }) } });
    await prisma.archivoImportado.create({ data: { ruta: "AAA/antiguo.xlsx", hash: "viejo", sociedadId, cuentaId: cuenta2, mes: "2026-09", estado: "leido", formato: "E3", numMovimientos: 0, detalle: JSON.stringify({ continuidad: sinMov }) } });
    const t = await informe();
    expect(t).toContain("12. Archivos sin movimientos e imágenes (solo conteos). Una imagen es «grande» desde el 15% del área de la hoja; la esquina es la franja exterior del 25%");
    expect(t).toContain("archivos leídos: 6 · sin movimientos: 3");
    expect(t).toContain("E3 · sin movimientos: total 3 = con logo (probable; cubre): 1 · imagen no legible (no cubre): 0 · con otra imagen: 0 · sin imagen (cubre): 1 · sin dato (leídos con una versión anterior del lector): 1");
    expect(t).toContain("E1 · con movimientos: total 1 = con logo (probable): 0 · con posible captura: 1");
    expect(t).toContain("con bloque de saldos en el encabezado (Saldo Inicial, Saldo en Libros, Saldo Disponible o Fecha): 1 · sin dato (versión anterior del lector): 1");
    expect(t).toContain("Saldo Inicial igual a Saldo en Libros: sí 1 · no 0 · sin poder comparar (falta uno de los dos): 0");
    expect(t).toContain("traen «Fecha» en el encabezado: sí 1 · no 0");
    for (const prohibido of ["a-e1.xlsx", "antiguo", "CR0000000000000000009001", "AAA/"]) expect(t).not.toContain(prohibido);
  });

  it("el umbral es un parámetro: con un umbral más bajo el mismo archivo pasa de logo a posible captura", async () => {
    await prisma.archivoImportado.updateMany({ where: { cuentaId, mes: "2026-10" }, data: { formato: "E3", numMovimientos: 0, detalle: JSON.stringify({ conImagenes: true, imagenes: [{ ...logo, areaPct: 10 }], continuidad: sinMov }) } });
    expect(await informe()).toContain("E3 · sin movimientos: total 1 = con logo (probable; cubre): 1 · imagen no legible (no cubre): 0");
    expect(await informe(45, { grandePct: 5, esquinaPct: 25 })).toContain("E3 · sin movimientos: total 1 = con logo (probable; cubre): 0 · imagen no legible (no cubre): 1");
  });
});
