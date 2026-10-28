import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { MOTIVOS } from "../src/domain/cruce.js";
import { enmascararSalvo } from "../src/domain/enmascarar.js";
import { textoDatosDesactualizados, textoFaltanEstados, textosDePago, type DatosTexto, type MovimientoTexto } from "../src/domain/textos-pago.js";
import { movimientosParaGrupos } from "../src/repositories/cruce.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { informeGruposCompartidos } from "../src/vencimientos/diagnostico-grupos.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { fijarRango, vaciarImportaciones } from "./helpers/db.js";

// Textos de la pantalla: con datos reales, sin valores técnicos crudos y sin huecos aunque falte un dato.
const CRUDO = /por_revisar|sin_informacion|pagado_con_inconsistencia|\bnull\b|undefined|NaN|\[object|\{|\}|\(\s*\)|\s{2,}|\s[,.;:]|,\s*,|:\s*\./i;
const todo = (t: { resumen: string; parrafos: string[]; queHacer: string | null }) => [t.resumen, ...t.parrafos, ...(t.queHacer ? [t.queHacer] : [])];

const mov = (extra: Partial<MovimientoTexto> = {}): MovimientoTexto => ({
  fecha: "2026-10-13", monto: 1500050, moneda: "CRC", banco: "Banco Uno", cuenta: "****1111", sociedad: "Sociedad AAA",
  descripcion: "PAGO MOVIS ****5678", porNombre: ["Movistar"], porFecha: ["Cabletica"], ...extra,
});
const base: DatosTexto = {
  estado: "por_revisar", motivo: MOTIVOS.compartido, fecha: "2026-10-15", dias: -12, diasAviso: 3, diferenciaDias: null,
  ventana: { desde: "2026-10-12", hasta: "2026-10-18" }, cobertura: null, movimientos: [mov()],
  grupo: [
    { proveedor: "Cabletica", categoria: "Cable", diaPago: 15, estado: "por_revisar" },
    { proveedor: "Movistar", categoria: "Teléfono", diaPago: 20, estado: "por_revisar" },
  ],
};

describe("textos del detalle", () => {
  it("por revisar (número de servicio compartido): qué pasó, por qué, las obligaciones y qué hacer, con datos reales", () => {
    const t = textosDePago(base);
    expect(t.resumen).toBe("No se pudo saber con certeza a cuál servicio corresponde este pago.");
    expect(t.parrafos).toEqual([
      "El 13 oct 2026 el banco registró un pago que dice «PAGO MOVIS ****5678» (Banco Uno cuenta ****1111, ₡15 000,50).",
      "Coincide por nombre con Movistar y por fecha con Cabletica.",
      "Ese número de servicio está en 2 obligaciones de esta sociedad: Cabletica (Cable, día 15, Por revisar) y Movistar (Teléfono, día 20, Por revisar).",
    ]);
    expect(t.queHacer).toBe("Qué hacer: confirmar con quien paga cuál es el servicio correcto.");
  });

  it("vencido: dónde y hasta cuándo se buscó, en cuántas cuentas y hasta qué fecha hay estados", () => {
    const t = textosDePago({ ...base, estado: "vencido", motivo: MOTIVOS.vencido, movimientos: [], cobertura: { estadosHasta: "2026-10-26", cuentas: 3, sinCobertura: [] } });
    expect(t.resumen).toBe("No se encontró pago hasta el 18 oct 2026.");
    expect(t.parrafos).toEqual([
      "No se encontró un pago entre el 12 oct 2026 y el 18 oct 2026 en las 3 cuentas de la sociedad.",
      "Tampoco hay un pago con este número en las fechas cercanas dentro de los estados de cuenta cargados.",
      "Hay estados de cuenta cargados hasta el 26 oct 2026.",
    ]);
    expect(textosDePago({ ...base, estado: "vencido", movimientos: [], cobertura: { estadosHasta: "2026-10-26", cuentas: 1, sinCobertura: [] } }).parrafos[0]).toContain("en la cuenta de la sociedad");
  });

  it("sin información: qué cuentas faltan y desde cuándo", () => {
    const t = textosDePago({
      ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacion, movimientos: [],
      cobertura: { estadosHasta: "2026-10-15", cuentas: 2, sinCobertura: [{ cuenta: "****2222", banco: "Banco Dos", hasta: "2026-10-15" }, { cuenta: "****3333", banco: null, hasta: null }] },
    });
    expect(t.resumen).toBe("Todavía no se puede saber si se pagó.");
    expect(t.parrafos[0]).toBe("Faltan los estados de cuenta de Banco Dos ****2222 desde el 16 oct 2026 y ****3333.");
    expect(textoFaltanEstados("2026-10-15")).toBe("Faltan estados de cuenta desde el 16 oct 2026");
  });

  it("datos desactualizados: una línea por sociedad, con la fecha real", () => {
    expect(textoDatosDesactualizados("Sociedad AAA", "2026-10-20")).toBe("Sociedad AAA: los estados de cuenta llegan hasta el 20 oct 2026; faltan los posteriores.");
    expect(textoDatosDesactualizados("Sociedad AAA", null)).toBe("Sociedad AAA: no hay estados de cuenta cargados.");
  });

  it("ningún texto muestra valores técnicos crudos ni queda con huecos, aunque falte cualquier dato", () => {
    const estados = ["proyectado", "por_vencer", "vencido", "pagado", "pagado_con_inconsistencia", "sin_informacion", "por_revisar", "otro_estado"];
    const motivos = [null, MOTIVOS.compartido, MOTIVOS.empate, MOTIVOS.otraSociedad, MOTIVOS.repetido, MOTIVOS.vencidoSinEstado, MOTIVOS.vencido, MOTIVOS.sinInformacion, "texto libre"];
    const movimientos = [[], [mov()], [mov({ banco: null, moneda: null, descripcion: null, porNombre: [], porFecha: [] })], [mov({ porNombre: ["A", "B"] }), mov({ porNombre: ["A"], porFecha: ["A"] })]];
    const coberturas: DatosTexto["cobertura"][] = [
      null,
      { estadosHasta: null, cuentas: 0, sinCobertura: [] },
      { estadosHasta: "2026-10-20", cuentas: 1, sinCobertura: [{ cuenta: "****9", banco: null, hasta: null }] },
    ];
    const grupos = [[], base.grupo, [{ proveedor: "X", categoria: "Cable", diaPago: null, estado: null }, { proveedor: "Y", categoria: "Cable", diaPago: null, estado: "inventado" }]];
    let casos = 0;
    for (const estado of estados) for (const motivo of motivos) for (const m of movimientos) for (const cobertura of coberturas) for (const grupo of grupos) for (const dias of [-3, 0, 1, 40]) {
      const t = textosDePago({ ...base, estado, motivo, movimientos: m, cobertura, grupo, dias, diferenciaDias: dias === 1 ? null : dias });
      for (const linea of todo(t)) {
        expect(linea, `${estado} | ${motivo} | ${linea}`).not.toMatch(CRUDO);
        expect(linea.trim().length).toBeGreaterThan(0);
      }
      casos++;
    }
    expect(casos).toBeGreaterThan(3000);
  });
});

describe("el número que es el identificador se ve completo; los demás números largos, enmascarados", () => {
  it("enmascararSalvo", () => {
    expect(enmascararSalvo("PAGO MOVIS 0066600012 REF 12345678 Y 1234567", "66600012")).toBe("PAGO MOVIS 0066600012 REF ****5678 Y 1234567");
  });
});

describe("grupo de obligaciones con el mismo número de servicio: detalle de Por revisar", () => {
  let app: Awaited<ReturnType<typeof crearApp>>;
  const reloj = () => new Date(2026, 9, 27, 10, 0);
  const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
  let cuentaId: number;
  let archivoId: number;
  let sociedadId: number;
  let categoriaId: number;
  let n = 0;
  const mov2 = (fecha: Date, descripcion: string) =>
    prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito: 4500000n, credito: 0n, claveDedup: `g${n}`.padEnd(40, "0") } });
  const obl = (proveedor: string, diaPago: number, categoria = categoriaId) =>
    prisma.obligacion.create({ data: { sociedadId, categoriaId: categoria, proveedor, identificador: "66600012", diaEsperadoPago: diaPago, controlDesde: dia(2026, 10, 1) } });
  const detalleDe = async (proveedor: string) => {
    const lista = (await app.inject("/api/vencimientos?periodo=2026-10&porPagina=500")).json().datos as { id: number; proveedor: string }[];
    return (await app.inject(`/api/vencimientos/${lista.find((x) => x.proveedor === proveedor)!.id}`)).json().datos;
  };

  beforeAll(async () => {
    await fijarRango(3, 3);
    await vaciarImportaciones();
    sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
    cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001111", banco: "Banco Uno", moneda: "CRC" } })).id;
    const cats = await prisma.categoria.findMany({ orderBy: { id: "asc" }, take: 2 });
    categoriaId = cats[0]!.id;
    for (const mes of ["2026-09", "2026-10"]) {
      const a = await prisma.archivoImportado.create({ data: { ruta: `x/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido" } });
      if (mes === "2026-10") archivoId = a.id;
    }
    await obl("Cabletica", 15);
    await obl("Movistar", 20, cats[1]!.id);
    await mov2(dia(2026, 10, 13), "PAGO MOVIS 66600012 REF 12345678"); // el nombre dice Movistar; la fecha solo encaja con Cabletica
    await mov2(dia(2026, 9, 3), "COMISION INICIAL"); // los datos empiezan antes de cualquier rango
    await mov2(dia(2026, 10, 26), "COMISION");
    await actualizarVencimientos(reloj);
    app = await crearApp({ reloj });
  });
  afterAll(async () => {
    await app.close();
    await fijarRango(10, 12);
    await vaciarImportaciones();
  });

  it("las dos filas del grupo quedan por revisar con el mismo movimiento (nunca un pago leído distinto para cada una)", async () => {
    for (const proveedor of ["Cabletica", "Movistar"]) {
      const d = await detalleDe(proveedor);
      expect(d.estado).toBe("por_revisar");
      expect(d.movimientos).toHaveLength(1);
      expect(d.movimientos[0]).toMatchObject({ fecha: "2026-10-13", banco: "Banco Uno", cuenta: "****1111", monto: 4500000 });
    }
  });

  it("el detalle lista las obligaciones del grupo y el motivo concreto, y muestra completo solo el número del servicio", async () => {
    const d = await detalleDe("Movistar");
    expect(d.grupo.map((g: { proveedor: string; diaPago: number }) => [g.proveedor, g.diaPago])).toEqual([["Cabletica", 15], ["Movistar", 20]]);
    expect(d.movimientos[0].descripcion).toBe("PAGO MOVIS 66600012 REF ****5678");
    const texto = [d.textos.resumen, ...d.textos.parrafos, d.textos.queHacer].join(" ");
    expect(texto).toContain("Coincide por nombre con Movistar y por fecha con Cabletica.");
    expect(texto).toContain("Ese número de servicio está en 2 obligaciones de esta sociedad: Cabletica (");
    expect(texto).toContain("día 15, Por revisar) y Movistar (");
    expect(texto).toContain("₡45 000,00");
    expect(texto).toContain("Banco Uno cuenta ****1111");
    expect(texto).not.toMatch(CRUDO);
  });

  it("el diagnóstico del grupo muestra estados, rótulos enmascarados y si se reconoce el nombre, sin el número de servicio", async () => {
    const r = await cruzarVencimientos(reloj);
    const informe = informeGruposCompartidos(r, [{ id: sociedadId, codigo: "AAA" }], await movimientosParaGrupos());
    expect(informe).toContain("Grupos de obligaciones con el mismo número de servicio en una misma sociedad: 1");
    expect(informe).toContain("Movistar: el nombre se busca en la descripción como «movistar», «movis»");
    expect(informe).toContain("2026-10-15 | Cabletica: Por revisar");
    expect(informe).toContain("2026-10-20 | Movistar: Por revisar");
    expect(informe).toContain("2026-10-13 | débito | rótulo: PAGO MOVIS ****0012 REF ****5678 | se reconoce el proveedor: Cabletica no · Movistar sí");
    expect(informe).not.toContain("45000");
  });

  it("un grupo de dos obligaciones que sí se desempata (nombre y fecha de acuerdo): solo una fila queda pagada", async () => {
    await prisma.movimiento.deleteMany({ where: { descripcion: { contains: "MOVIS" } } });
    await mov2(dia(2026, 10, 19), "PAGO MOVIS 66600012"); // solo en la ventana de Movistar y dice Movistar
    await actualizarVencimientos(reloj);
    expect((await detalleDe("Movistar")).estado).toBe("pagado");
    expect((await detalleDe("Cabletica")).estado).toBe("vencido");
  });
});
