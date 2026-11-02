import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { listarSociedades } from "../src/repositories/obligaciones.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../src/vencimientos/diagnostico.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones } from "./helpers/db.js";

// «Pagos del mes», «Vencidos», el detalle y el diagnóstico deben dar los mismos números. Datos inventados; hoy = 2026-10-27.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let app: Awaited<ReturnType<typeof crearApp>>;
let n = 0;

beforeAll(async () => {
  await fijarRango(3, 3);
  await vaciarImportaciones();
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  const aaa = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } });
  const bbb = await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB" } });
  const cuentaA = (await prisma.cuenta.create({ data: { sociedadId: aaa.id, numero: "CR0000000000000000001111", banco: "Banco Uno", moneda: "USD" } })).id;
  const cuentaB = (await prisma.cuenta.create({ data: { sociedadId: bbb.id, numero: "CR0000000000000000002222", banco: "Banco Dos" } })).id;
  const archivo = async (sociedadId: number, cuentaId: number, mes: string) =>
    (await prisma.archivoImportado.create({ data: { ruta: `${sociedadId}/${mes}.xlsx`, hash: `${sociedadId}${mes}`, sociedadId, cuentaId, mes, estado: "leido" } })).id;
  const aSep = await archivo(aaa.id, cuentaA, "2026-09");
  const aOct = await archivo(aaa.id, cuentaA, "2026-10");
  const bSep = await archivo(bbb.id, cuentaB, "2026-09");
  const bOct = await archivo(bbb.id, cuentaB, "2026-10");
  const mov = (cuentaId: number, archivoId: number, fecha: Date, descripcion: string, debito = 250000n) =>
    prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito: 0n, claveDedup: `p${n}`.padEnd(40, "0") } });
  const obl = (sociedadId: number, proveedor: string, identificador: string, diaPago: number) =>
    prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: diaPago, controlDesde: dia(2026, 9, 1) } });
  await obl(aaa.id, "Luz Uno", "7771111", 15); // pagado
  await obl(aaa.id, "Agua Dos", "8882222", 10); // vencido (AAA tiene datos hasta el 26)
  await obl(aaa.id, "Fono Tres", "9993333", 29); // por vencer
  await obl(aaa.id, "Cabletica", "6664444", 15); // identificador compartido sin proveedor
  await obl(aaa.id, "Movistar", "6664444", 15);
  await obl(aaa.id, "Gas Cinco", "4445555", 15); // lo paga una cuenta de BBB
  await obl(bbb.id, "Net Seis", "3336666", 14); // BBB solo tiene datos hasta el 15
  await mov(cuentaA, aSep, dia(2026, 9, 3), "COMISION INICIAL", 100n); // los datos empiezan antes de cualquier rango
  await mov(cuentaB, bSep, dia(2026, 9, 3), "COMISION INICIAL", 100n);
  await mov(cuentaA, aOct, dia(2026, 10, 14), "PAGO LUZ 7771111");
  await mov(cuentaA, aOct, dia(2026, 10, 15), "PAGO SERVICIO 6664444");
  await mov(cuentaA, aOct, dia(2026, 10, 26), "COMISION");
  await mov(cuentaB, bOct, dia(2026, 10, 15), "PAGO GAS 4445555", 99900n);
  await actualizarVencimientos(reloj);
  app = await crearApp({ reloj });
});
afterAll(async () => {
  await app.close();
  await fijarRango(10, 12);
  await vaciarImportaciones();
});

const listar = async (q: string) => (await app.inject(`/api/vencimientos?${q}`)).json();

describe("«Pagos del mes», «Vencidos» y diagnóstico dan los mismos números", () => {
  it("el resumen del mes, las pestañas, las tarjetas, «Vencidos» y el diagnóstico coinciden", async () => {
    const mes = await listar("periodo=2026-10&porPagina=500");
    expect(mes.resumen).toEqual({ pagado: 1, vencido: 1, por_vencer: 1, por_revisar: 2, pagado_con_inconsistencia: 1, sin_informacion: 1 });
    const cuenta = (...e: string[]) => e.reduce((s, x) => s + (mes.resumen[x] ?? 0), 0);
    const N = mes.total;
    expect(N).toBe(7);
    // pestañas: la suma de los grupos es el total del mes
    const atencion = cuenta("vencido", "por_vencer", "por_revisar", "sin_informacion");
    const pagados = cuenta("pagado", "pagado_con_inconsistencia");
    const programados = cuenta("proyectado");
    expect([atencion, pagados, programados, atencion + pagados + programados]).toEqual([5, 2, 0, N]);
    // cada pestaña, pedida por estado, devuelve exactamente ese conteo
    expect((await listar("periodo=2026-10&estado=vencido,por_vencer,por_revisar,sin_informacion")).total).toBe(atencion);
    expect((await listar("periodo=2026-10&estado=pagado,pagado_con_inconsistencia")).total).toBe(pagados);
    // «Vencidos» (todos los meses) = la suma de la tarjeta Vencidos de cada mes
    const vencidos = await listar("estado=vencido&porPagina=500");
    const septiembre = await listar("periodo=2026-09&porPagina=500");
    expect(vencidos.total).toBe((mes.resumen.vencido ?? 0) + (septiembre.resumen.vencido ?? 0));
    expect(vencidos.datos.every((v: { estado: string }) => v.estado === "vencido")).toBe(true);
    // diagnóstico
    const r = await cruzarVencimientos(reloj);
    expect(r.porEstado.vencido).toBe(vencidos.total);
    for (const [estado, cantidad] of Object.entries(mes.resumen)) expect((r.porEstado[estado] ?? 0) - (septiembre.resumen[estado] ?? 0)).toBe(cantidad);
    const informe = informeDiagnosticoCruce(r, (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo })));
    for (const [estado, cantidad] of Object.entries(r.porEstado)) expect(informe).toContain(`  ${estado}: ${cantidad}\n`);
  });

  it("«Vencidos» ordena del más antiguo al más reciente y trae los días desde que venció, calculados con el reloj", async () => {
    const v = (await listar("estado=vencido&porPagina=500")).datos;
    const fechas = v.map((x: { fecha: string }) => x.fecha);
    expect(fechas).toEqual([...fechas].sort());
    expect(v[0]).toMatchObject({ proveedor: "Agua Dos", fecha: "2026-09-10", dias: -47 }); // el más antiguo: hace 47 días con hoy = 27 de octubre
    expect(v.find((x: { fecha: string }) => x.fecha === "2026-10-10").dias).toBe(-17);
    const porVencer = (await listar("periodo=2026-10&estado=por_vencer")).datos[0];
    expect(porVencer).toMatchObject({ fecha: "2026-10-29", dias: 2 });
    expect((await listar("periodo=2026-10")).diasAviso).toBe(3);
  });

  it("el listado trae el responsable efectivo, el pago con la moneda de su cuenta y no mezcla meses", async () => {
    const mes = await listar("periodo=2026-10&porPagina=500");
    expect(mes.datos.every((x: { periodo: string; mesAnterior: boolean }) => x.periodo === "2026-10" && !x.mesAnterior)).toBe(true);
    const pagado = mes.datos.find((x: { proveedor: string }) => x.proveedor === "Luz Uno");
    expect(pagado.pago).toMatchObject({ fecha: "2026-10-14", monto: 250000, moneda: "USD", cuenta: "****1111" });
    expect(pagado).toHaveProperty("responsableEfectivo");
    const otra = mes.datos.find((x: { proveedor: string }) => x.proveedor === "Gas Cinco");
    expect(otra.pago).toMatchObject({ monto: 99900, moneda: null, cuenta: "****2222" }); // cuenta sin moneda: sin símbolo
  });
});

describe("detalle de solo lectura", () => {
  const detalle = async (proveedor: string) => {
    const id = (await listar("periodo=2026-10&porPagina=500")).datos.find((x: { proveedor: string }) => x.proveedor === proveedor).id;
    const r = await app.inject(`/api/vencimientos/${id}`);
    expect(r.statusCode).toBe(200);
    return r.json().datos;
  };

  it("vencido: ventana buscada, hasta qué fecha hay estados y en cuántas cuentas", async () => {
    const d = await detalle("Agua Dos");
    expect(d).toMatchObject({ estado: "vencido", fecha: "2026-10-10", fechaOriginal: "2026-10-10", periodo: "2026-10", identificador: "8882222", sociedad: "Sociedad AAA" });
    expect(d.ventana).toEqual({ desde: "2026-10-07", hasta: "2026-10-13", diasAntes: 3, diasDespues: 3 });
    expect(d.cobertura).toEqual({ estadosHasta: "2026-10-26", cuentas: 1, cuentasSinCobertura: [] });
    expect(d.movimientos).toEqual([]);
  });

  it("pagado: el movimiento, con la cuenta enmascarada y la moneda de la cuenta", async () => {
    const d = await detalle("Luz Uno");
    expect(d.estado).toBe("pagado");
    expect(d.movimientos).toEqual([expect.objectContaining({ fecha: "2026-10-14", monto: 250000, moneda: "USD", banco: "Banco Uno", cuenta: "****1111", delPago: true })]);
    expect(JSON.stringify(d)).not.toContain("CR0000000000000000001111");
  });

  it("por revisar: el motivo y los movimientos candidatos", async () => {
    const d = await detalle("Cabletica");
    expect(d.estado).toBe("por_revisar");
    expect(d.motivo).toContain("a cuál servicio corresponde");
    expect(d.movimientos).toHaveLength(1);
    expect(d.movimientos[0]).toMatchObject({ fecha: "2026-10-15", banco: "Banco Uno", cuenta: "****1111", delPago: false, descripcion: "PAGO SERVICIO 6664444" });
  });

  it("sin información: desde cuándo y qué cuentas faltan", async () => {
    const d = await detalle("Net Seis");
    expect(d.estado).toBe("sin_informacion");
    expect(d.textoEstado).toBe("Faltan estados de cuenta desde el 16 oct 2026");
    expect(d.cobertura).toMatchObject({ estadosHasta: "2026-10-15", cuentas: 1 });
    expect(d.cobertura.cuentasSinCobertura).toEqual([{ cuenta: "****2222", banco: "Banco Dos", hasta: "2026-10-15" }]);
  });

  it("pagado con inconsistencia: cuál (otra sociedad) y el movimiento con su sociedad", async () => {
    const d = await detalle("Gas Cinco");
    expect(d).toMatchObject({ estado: "pagado_con_inconsistencia", motivo: "Pagado por otra sociedad" });
    expect(d.movimientos).toEqual([expect.objectContaining({ sociedad: "Sociedad BBB", cuenta: "****2222", delPago: true, monto: 99900 })]);
  });

  it("un vencimiento que no existe da 404 y un identificador inválido 400", async () => {
    expect((await app.inject("/api/vencimientos/999999")).statusCode).toBe(404);
    expect((await app.inject("/api/vencimientos/abc")).statusCode).toBe(400);
  });
});
