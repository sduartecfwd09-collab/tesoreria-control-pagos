import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { proximoPago } from "../src/domain/vencimientos.js";
import { contarCuentasPorMoneda } from "../src/repositories/cruce.js";
import { listarSociedades } from "../src/repositories/obligaciones.js";
import { cruzarVencimientos } from "../src/vencimientos/cruce.js";
import { informeDiagnosticoCruce } from "../src/vencimientos/diagnostico.js";
import { actualizarVencimientos } from "../src/vencimientos/mantenimiento.js";
import { vaciarImportaciones } from "./helpers/db.js";

// Cruce contra la base de pruebas con datos inventados. Hoy = 2026-10-27.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let sociedadId: number;
let archivoId: number;
let cuentaId: number;
let obligacionId: number;
let n = 0;

const mov = (fecha: Date, descripcion: string, debito = 5000n) =>
  prisma.movimiento.create({ data: { cuentaId, archivoId, hoja: "H", fila: ++n, periodo: "2026-10", fecha, descripcion, debito, credito: 0n, claveDedup: `k${n}`.padEnd(40, "0") } });
const venc = () => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId, periodo: "2026-10" } });

beforeEach(async () => {
  await vaciarImportaciones();
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  cuentaId = (await prisma.cuenta.create({ data: { sociedadId, numero: "CR0000000000000000001234" } })).id;
  const categoria = await prisma.categoria.findFirstOrThrow();
  obligacionId = (await prisma.obligacion.create({
    data: { sociedadId, categoriaId: categoria.id, proveedor: "Luz Uno", identificador: "7771234", diaEsperadoPago: 15, controlDesde: dia(2026, 10, 1) },
  })).id;
  for (const mes of ["2026-09", "2026-10"]) {
    const a = await prisma.archivoImportado.create({ data: { ruta: `AAA/${mes}.xlsx`, hash: mes, sociedadId, cuentaId, mes, estado: "leido" } });
    if (mes === "2026-10") archivoId = a.id;
  }
  // un movimiento que no es de la obligación, en el último día cubierto
  await mov(dia(2026, 9, 3), "COMISION INICIAL"); // los datos empiezan antes de cualquier rango de búsqueda
  await mov(dia(2026, 10, 26), "COMISION SIN RELACION");
});
afterAll(vaciarImportaciones);

describe("cruce sobre la base", () => {
  it("genera el calendario, cruza y es idempotente", async () => {
    await mov(dia(2026, 10, 14), "PAGO LUZ 7771234");
    const r1 = await actualizarVencimientos(reloj);
    expect(r1.calendario.creados).toBe(1);
    expect(r1.cambiados).toBe(1);
    expect(await venc()).toMatchObject({ estado: "pagado", diferenciaDias: -1, motivo: "Pago encontrado en una cuenta de la sociedad" });
    const r2 = await actualizarVencimientos(reloj);
    expect(r2).toEqual({ calendario: { creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 }, cambiados: 0 });
  });

  it("un archivo retirado de la carpeta no cuenta en el cruce ni en la cobertura; si vuelve, se recupera el pago", async () => {
    await mov(dia(2026, 10, 14), "PAGO LUZ 7771234");
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("pagado");
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-10" }, data: { retiradoEn: new Date() } });
    await actualizarVencimientos(reloj);
    expect(await venc()).toMatchObject({ estado: "sin_informacion", movimientoId: null }); // sin archivo de octubre no se afirma nada
    await prisma.archivoImportado.updateMany({ where: { mes: "2026-10" }, data: { retiradoEn: null } });
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("pagado");
  });

  it("sin pago y con cobertura: vencido; con el corte antes de la ventana: sin información hasta esa fecha", async () => {
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("vencido");
    await prisma.movimiento.updateMany({ where: { descripcion: "COMISION SIN RELACION" }, data: { fecha: dia(2026, 10, 16) } }); // el último movimiento cargado es el 16
    await actualizarVencimientos(reloj);
    const v = await venc();
    expect(v.estado).toBe("sin_informacion");
    expect(v.sinInfoHasta?.toISOString().slice(0, 10)).toBe("2026-10-16");
  });

  it("un vencimiento con la fecha movida «solo este mes» usa su fecha vigente y conserva la original", async () => {
    await actualizarVencimientos(reloj);
    const v0 = await venc();
    await prisma.vencimiento.update({ where: { id: v0.id }, data: { fecha: dia(2026, 10, 24), fechaOriginal: dia(2026, 10, 15) } });
    await mov(dia(2026, 10, 22), "PAGO LUZ 7771234"); // en la ventana de la fecha nueva, fuera de la original
    await actualizarVencimientos(reloj);
    const v = await venc();
    expect(v).toMatchObject({ estado: "pagado", diferenciaDias: -2 });
    expect(v.fechaOriginal?.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(v.fecha.toISOString().slice(0, 10)).toBe("2026-10-24");
  });

  it("los parámetros de la ventana salen de Configuración, por separado", async () => {
    await mov(dia(2026, 10, 20), "PAGO LUZ 7771234"); // 5 días después
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("vencido");
    await prisma.parametro.updateMany({ where: { clave: "ventana_dias_despues" }, data: { valor: "5" } });
    await actualizarVencimientos(reloj);
    expect((await venc()).estado).toBe("pagado");
    await prisma.parametro.updateMany({ where: { clave: "ventana_dias_despues" }, data: { valor: "3" } });
  });

  it("el diagnóstico solo trae conteos: ni descripciones, ni identificadores, ni cuentas", async () => {
    await mov(dia(2026, 10, 14), "SECRETOXYZ 7771234");
    await mov(dia(2026, 10, 15), "OTRO SECRETOXYZ SIN OBLIGACION");
    await actualizarVencimientos(reloj);
    const r = await cruzarVencimientos(reloj);
    const informe = informeDiagnosticoCruce(r, (await listarSociedades()).map((s) => ({ id: s.id, codigo: s.codigo })));
    for (const prohibido of ["SECRETOXYZ", "7771234", "1234", "Luz Uno", "CR0000"]) expect(informe).not.toContain(prohibido);
    expect(informe).toContain("Vencimientos por estado:");
    expect(informe).toContain("Débitos sin obligación, por sociedad:");
  });
});

describe("API de vencimientos: pago con moneda, textos y aviso de datos", () => {
  it("el pago trae la moneda de la cuenta que pagó (sin dato = null), la cuenta enmascarada y el monto en centavos", async () => {
    await mov(dia(2026, 10, 14), "PAGO LUZ 7771234", 123456789n);
    await actualizarVencimientos(reloj);
    const app = await crearApp({ reloj });
    try {
      const pago = () => app.inject("/api/vencimientos?periodo=2026-10").then((r) => r.json().datos[0].pago);
      expect(await pago()).toMatchObject({ fecha: "2026-10-14", monto: 123456789, moneda: null, cuenta: "****1234" });
      await prisma.cuenta.update({ where: { id: cuentaId }, data: { moneda: "USD" } });
      expect((await pago()).moneda).toBe("USD");
      expect(JSON.stringify(await pago())).not.toContain("CR0000000000000000001234");
    } finally {
      await app.close();
    }
  });

  it("Sin información trae su texto con fechas; con el parámetro encendido se ve Vencido con la nota", async () => {
    await prisma.movimiento.updateMany({ where: { descripcion: "COMISION SIN RELACION" }, data: { fecha: dia(2026, 10, 16) } });
    await actualizarVencimientos(reloj);
    const app = await crearApp({ reloj });
    try {
      const v = async () => (await app.inject("/api/vencimientos?periodo=2026-10")).json().datos[0];
      expect(await v()).toMatchObject({ estado: "sin_informacion", textoEstado: "Faltan estados de cuenta desde el 17 oct 2026" });
      await prisma.parametro.updateMany({ where: { clave: "marcar_vencido_sin_estado" }, data: { valor: "si" } });
      await actualizarVencimientos(reloj);
      expect(await v()).toMatchObject({ estado: "vencido", textoEstado: "Pasó la fecha de pago; sin estado de cuenta que lo confirme" });
    } finally {
      await prisma.parametro.updateMany({ where: { clave: "marcar_vencido_sin_estado" }, data: { valor: "no" } });
      await app.close();
    }
  });

  it("el aviso de datos lista las sociedades con estados atrasados", async () => {
    await prisma.movimiento.updateMany({ where: { descripcion: "COMISION SIN RELACION" }, data: { fecha: dia(2026, 10, 16) } }); // corte 11 días atrás
    const app = await crearApp({ reloj });
    try {
      const r = (await app.inject("/api/vencimientos/avisos-datos")).json().datos;
      expect(r).toEqual([expect.objectContaining({ sociedad: "Sociedad AAA", sinEstadosDesde: "2026-10-17", texto: "Sociedad AAA: los estados de cuenta llegan hasta el 16 oct 2026; faltan los posteriores." })]);
      await prisma.parametro.updateMany({ where: { clave: "aviso_datos_dias" }, data: { valor: "20" } });
      expect((await app.inject("/api/vencimientos/avisos-datos")).json().datos).toEqual([]);
    } finally {
      await prisma.parametro.updateMany({ where: { clave: "aviso_datos_dias" }, data: { valor: "5" } });
      await app.close();
    }
  });

  it("el diagnóstico incluye la última fecha con movimientos y las cuentas por moneda", async () => {
    await actualizarVencimientos(reloj);
    const informe = informeDiagnosticoCruce(await cruzarVencimientos(reloj), [{ id: sociedadId, codigo: "AAA" }], await contarCuentasPorMoneda());
    expect(informe).toContain("AAA | 2026-10: 2026-10-26");
    expect(informe).toMatch(/CRC: 0\s+USD: 0\s+sin dato: 1/);
  });
});

describe("API de vencimientos: periodo con pendientes anteriores, filtro por estado y resumen", () => {
  it("el periodo trae además los pendientes de meses anteriores (etiquetados), con el resumen por estado", async () => {
    // septiembre sin pagar y con cobertura (vencido); octubre pagado
    await prisma.obligacion.update({ where: { id: obligacionId }, data: { controlDesde: dia(2026, 9, 1) } });
    await mov(dia(2026, 10, 14), "PAGO LUZ 7771234");
    await actualizarVencimientos(reloj);
    const app = await crearApp({ reloj });
    try {
      const sep = (await app.inject("/api/vencimientos?periodo=2026-09&pendientesAnteriores=true")).json();
      expect(sep.datos.map((v: { periodo: string }) => v.periodo)).toEqual(["2026-09"]); // nada anterior a septiembre
      const oct = (await app.inject("/api/vencimientos?periodo=2026-10&pendientesAnteriores=true")).json();
      expect(oct.datos.map((v: { periodo: string; mesAnterior: boolean; estado: string }) => [v.periodo, v.mesAnterior, v.estado])).toEqual([["2026-09", true, "vencido"], ["2026-10", false, "pagado"]]);
      expect(oct.resumen).toEqual({ vencido: 1, pagado: 1 });
      const solo = (await app.inject("/api/vencimientos?periodo=2026-10")).json(); // sin la bandera no hay pendientes anteriores
      expect(solo.datos).toHaveLength(1);
      const filtrado = (await app.inject("/api/vencimientos?periodo=2026-10&pendientesAnteriores=true&estado=vencido,sin_informacion")).json();
      expect(filtrado.datos.map((v: { estado: string }) => v.estado)).toEqual(["vencido"]);
      expect(filtrado.resumen).toEqual({ vencido: 1, pagado: 1 }); // las tarjetas cuentan todos los estados
      expect((await app.inject("/api/vencimientos?estado=inventado")).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("el aviso de datos lista solo sociedades con obligaciones activas, también las que no tienen estados cargados", async () => {
    const otra = await prisma.sociedad.create({ data: { codigo: "ZZZ", nombreLargo: "Sociedad sin obligaciones" } });
    const sinEstados = await prisma.sociedad.create({ data: { codigo: "YYY", nombreLargo: "Sociedad con obligación y sin estados" } });
    await prisma.obligacion.create({ data: { sociedadId: sinEstados.id, categoriaId: (await prisma.categoria.findFirstOrThrow()).id, proveedor: "P", identificador: "5550001", diaEsperadoPago: 5 } });
    await prisma.movimiento.updateMany({ data: { fecha: dia(2026, 10, 1) } });
    const app = await crearApp({ reloj });
    try {
      const textos = (await app.inject("/api/vencimientos/avisos-datos")).json().datos.map((a: { texto: string }) => a.texto);
      expect(textos).toEqual(["Sociedad AAA: los estados de cuenta llegan hasta el 1 oct 2026; faltan los posteriores.", "Sociedad con obligación y sin estados: no hay estados de cuenta cargados."]);
      expect(textos.join()).not.toContain(otra.nombreLargo);
    } finally {
      await app.close();
    }
  });
});

describe("API de obligaciones: próximo pago", () => {
  it("la lista trae el próximo pago calculado", async () => {
    await actualizarVencimientos(reloj);
    const app = await crearApp({ reloj });
    try {
      const r = (await app.inject(`/api/obligaciones/${obligacionId}`)).json();
      expect(r.datos.proximoPago).toBe("2026-11-15"); // ya existe octubre; el siguiente es noviembre
    } finally {
      await app.close();
    }
  });
});

describe("próximo pago (dato calculado)", () => {
  const o = { frecuencia: "mensual", mesArranque: null, diaEsperadoPago: 15, controlDesde: null };
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  it("es el periodo siguiente al último vencimiento según la frecuencia", () => {
    expect(iso(proximoPago(o, "2026-10", dia(2026, 10, 27)))).toBe("2026-11-15");
    expect(iso(proximoPago({ ...o, frecuencia: "trimestral", mesArranque: 8 }, "2026-11", dia(2026, 11, 27)))).toBe("2027-02-15");
    expect(iso(proximoPago({ ...o, frecuencia: "anual", mesArranque: 3 }, "2026-03", dia(2026, 10, 1)))).toBe("2027-03-15");
    expect(iso(proximoPago({ ...o, diaEsperadoPago: 31 }, "2027-01", dia(2027, 1, 31)))).toBe("2027-02-28");
  });

  it("sin vencimientos parte del mes de hoy (o de «Control desde» si es futuro) y no sugiere fechas ya pasadas", () => {
    expect(iso(proximoPago(o, null, dia(2026, 10, 10)))).toBe("2026-10-15");
    expect(iso(proximoPago(o, null, dia(2026, 10, 20)))).toBe("2026-11-15");
    expect(iso(proximoPago({ ...o, controlDesde: "2027-01" }, null, dia(2026, 10, 10)))).toBe("2027-01-15");
  });

  it("es null si falta el día o el mes de arranque de una frecuencia no mensual", () => {
    expect(proximoPago({ ...o, diaEsperadoPago: null }, "2026-10", dia(2026, 10, 1))).toBeNull();
    expect(proximoPago({ ...o, frecuencia: "bimestral", mesArranque: null }, "2026-10", dia(2026, 10, 1))).toBeNull();
  });
});
