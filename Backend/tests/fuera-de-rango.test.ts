import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import type { CuentaCorte } from "../src/domain/cobertura-corte.js";
import { cruzar, MOTIVOS, type EntradaCruce, type MovimientoCruce, type ObligacionCruce, type VencimientoCruce } from "../src/domain/cruce.js";
import { textoSinEstadosAnteriores } from "../src/domain/textos-pago.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones } from "./helpers/db.js";

const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const HOY = dia(2026, 10, 27);

// --- Reglas puras ---------------------------------------------------------------------------------------------------
const cuenta = (primera: Date | null, meses = ["2026-07", "2026-08", "2026-09", "2026-10"]): CuentaCorte => ({
  cuentaId: 1, primeraFecha: primera, meses: new Map(meses.map((m) => [m, m === "2026-10" ? dia(2026, 10, 26) : dia(2026, 9, 30)])),
});
function correr(p: Partial<EntradaCruce>) {
  return cruzar({ obligaciones: [], vencimientos: [], movimientos: [], cuentas: new Map(), diasAntes: 3, diasDespues: 3, diasAviso: 3, hoy: HOY, ...p });
}
const estadoDe = (r: ReturnType<typeof correr>, id: number) => r.resultados.find((x) => x.vencimientoId === id)!;
const oblig = (id: number, proveedor: string, identificador = "99999"): ObligacionCruce => ({ id, sociedadId: 1, proveedor, identificador });
const venc = (id: number, obligacionId: number, fecha: Date): VencimientoCruce => ({ id, obligacionId, sociedadId: 1, fecha });
const mov = (id: number, fecha: Date, descripcion: string): MovimientoCruce => ({ id, sociedadId: 1, fecha, descripcion });

describe("rango que empieza antes de la primera fecha cargada", () => {
  const o = [oblig(1, "Luz Uno", "12345")];
  it("sin pago y con datos desde antes del rango: Vencido", () => {
    const r = correr({ obligaciones: o, vencimientos: [venc(10, 1, dia(2026, 10, 15))], cuentas: new Map([[1, [cuenta(dia(2026, 7, 15))]]]) });
    expect(estadoDe(r, 10).estado).toBe("vencido");
  });
  it("sin pago y con el rango empezando antes de los primeros datos: Sin información, no Vencido", () => {
    // el rango empieza el 12 de octubre y los datos cargados empiezan el 14
    const r = correr({ obligaciones: o, vencimientos: [venc(10, 1, dia(2026, 10, 15))], cuentas: new Map([[1, [cuenta(dia(2026, 10, 14), ["2026-10"])]]]) });
    expect(estadoDe(r, 10)).toMatchObject({ estado: "sin_informacion", motivo: MOTIVOS.sinInformacionDesde, sinInfoHasta: null });
  });
  it("si hay pago, el pago manda aunque falten estados anteriores", () => {
    const r = correr({ obligaciones: o, vencimientos: [venc(10, 1, dia(2026, 10, 15))], cuentas: new Map([[1, [cuenta(dia(2026, 10, 14), ["2026-10"])]]]), movimientos: [mov(100, dia(2026, 10, 14), "PAGO 12345")] });
    expect(estadoDe(r, 10).estado).toBe("pagado");
  });
  it("el texto dice desde cuándo hay estados de cuenta", () => {
    expect(textoSinEstadosAnteriores("2026-10-14")).toBe("No hay estados de cuenta anteriores al 14 oct 2026");
  });
});

// --- Grupo con un solo pago al mes, el día 1 y con el rótulo cambiante ------------------------------------------------
describe.each([
  ["Cabletica", "CABLETICA", "Movistar", "MOVIS"],
  ["Alfa", "ALFA", "Beta", "BETA"],
])("grupo de dos obligaciones del mismo número (%s día 1 y %s día 10)", (primera, rotuloA, segunda, rotuloB) => {
  const grupo = [oblig(1, primera), oblig(2, segunda)];
  const vs = [
    venc(1, 1, dia(2026, 8, 1)), venc(2, 1, dia(2026, 9, 1)), venc(3, 1, dia(2026, 10, 1)),
    venc(4, 2, dia(2026, 8, 10)), venc(5, 2, dia(2026, 9, 10)), venc(6, 2, dia(2026, 10, 10)),
  ];
  const movs = [mov(100, dia(2026, 9, 1), `PAGO ${rotuloA} 99999`), mov(101, dia(2026, 10, 1), `PAGO ${rotuloB} 99999`)];
  const r = correr({ obligaciones: grupo, vencimientos: vs, movimientos: movs, cuentas: new Map([[1, [cuenta(dia(2026, 7, 15))]]]) });

  it("mes 1, sin pago: ambas sin pago", () => {
    expect([estadoDe(r, 1).estado, estadoDe(r, 4).estado]).toEqual(["vencido", "vencido"]);
  });
  it("mes 2, pago el día 1 con el nombre de la primera: la primera queda Pagada con ese movimiento", () => {
    expect(estadoDe(r, 2)).toMatchObject({ estado: "pagado", movimientoId: 100 });
  });
  it("mes 3, pago el día 1 con el nombre de la segunda: ambas Por revisar (la fecha solo encaja con la primera)", () => {
    expect(estadoDe(r, 3).estado).toBe("por_revisar");
    expect(estadoDe(r, 6).estado).toBe("por_revisar");
    expect(r.estadisticas.compartidosSinResolver).toBe(1);
  });
});

// --- El detalle de un Vencido con un pago fuera del rango -------------------------------------------------------------
describe("detalle de Vencido: pago con el mismo número fuera del rango", () => {
  let app: Awaited<ReturnType<typeof crearApp>>;
  const reloj = () => new Date(2026, 9, 27, 10, 0);
  let n = 0;

  beforeAll(async () => {
    await fijarRango(3, 3);
    await vaciarImportaciones();
    const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    const sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
    const cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001111", banco: "Banco Uno", moneda: "CRC" } })).id;
    let archivoId = 0;
    for (const mes of ["2026-09", "2026-10"]) {
      const a = await prisma.archivoImportado.create({ data: { ruta: `x/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido" } });
      if (mes === "2026-10") archivoId = a.id;
    }
    const mov2 = (fecha: Date, descripcion: string) =>
      prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito: 4500000n, credito: 0n, claveDedup: `r${n}`.padEnd(40, "0") } });
    const obl = (proveedor: string, identificador: string, diaPago: number) =>
      prisma.obligacion.create({ data: { sociedadId, categoriaId, proveedor, identificador, diaEsperadoPago: diaPago, controlDesde: dia(2026, 10, 1) } });
    await obl("Luz Uno", "7771111", 10); // pagó el 15: 5 días después, fuera del margen de 3
    await obl("Agua Dos", "8882222", 10); // sin ningún pago cercano
    await mov2(dia(2026, 10, 1), "COMISION"); // los estados de cuenta empiezan antes de todos los rangos
    await mov2(dia(2026, 10, 15), "PAGO LUZ 7771111");
    await mov2(dia(2026, 10, 26), "COMISION");
    await actualizarVencimientos(reloj);
    app = await crearApp({ reloj });
  });
  afterAll(async () => {
    await app.close();
    await fijarRango(10, 12);
    await vaciarImportaciones();
  });

  const textoDe = async (proveedor: string) => {
    const lista = (await app.inject("/api/vencimientos?periodo=2026-10&porPagina=500")).json().datos as { id: number; proveedor: string; estado: string }[];
    const v = lista.find((x) => x.proveedor === proveedor)!;
    expect(v.estado).toBe("vencido");
    const t = (await app.inject(`/api/vencimientos/${v.id}`)).json().datos.textos;
    return [t.resumen, ...t.parrafos, t.queHacer].join(" ");
  };

  it("dice que sí hay un pago con el número, cuántos días después y el margen", async () => {
    const t = await textoDe("Luz Uno");
    expect(t).toContain("No se encontró un pago entre el 7 oct 2026 y el 13 oct 2026 en la cuenta de la sociedad.");
    expect(t).toContain("Sí hay un pago con este número el 15 oct 2026, 5 días después del día de pago; está fuera del margen de 3 días.");
    expect(t).not.toContain("no hay un pago con este número de servicio");
  });

  it("si no hay ninguno, lo dice igual de claro y sin sugerir que no existe en ningún estado", async () => {
    const t = await textoDe("Agua Dos");
    expect(t).toContain("Tampoco hay un pago con este número en las fechas cercanas dentro de los estados de cuenta cargados.");
    expect(t).not.toContain("Sí hay un pago");
  });
});
