import { describe, expect, it } from "vitest";
import type { CuentaCorte } from "../src/domain/cobertura-corte.js";
import { cruzar, MOTIVOS, type EntradaCruce, type MovimientoCruce, type ObligacionCruce, type VencimientoCruce } from "../src/domain/cruce.js";
import { patronIdentificador } from "../src/domain/identificadores.js";

// Reglas del motor de cruce con datos inventados. Hoy = 2026-10-27, aviso 3 días, ventana 3 antes y 3 después.
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const HOY = dia(2026, 10, 27);

const S1 = 1;
const S2 = 2;
const oblig = (id: number, identificador: string, proveedor = "Luz Uno", sociedadId = S1): ObligacionCruce => ({ id, sociedadId, proveedor, identificador });
const venc = (id: number, obligacionId: number, fecha: Date, sociedadId = S1): VencimientoCruce => ({ id, obligacionId, sociedadId, fecha });
const mov = (id: number, fecha: Date, descripcion: string, sociedadId = S1): MovimientoCruce => ({ id, sociedadId, fecha, descripcion });
/** una cuenta que cubre octubre hasta `corte` (los meses anteriores, cerrados, completos) */
const cuenta = (cuentaId: number, corte: Date | null = dia(2026, 10, 26), meses = ["2026-09", "2026-10"]): CuentaCorte => ({
  cuentaId, meses: new Map(meses.map((m) => [m, m === "2026-10" ? corte : dia(2026, 9, 30)])),
});

function correr(parcial: Partial<EntradaCruce>) {
  return cruzar({
    obligaciones: [], vencimientos: [], movimientos: [], cuentas: new Map([[S1, [cuenta(1)]], [S2, [cuenta(2)]]]),
    diasAntes: 3, diasDespues: 3, diasAviso: 3, hoy: HOY, ...parcial,
  });
}
const estadoDe = (e: ReturnType<typeof correr>, vencimientoId: number) => e.resultados.find((r) => r.vencimientoId === vencimientoId)!;

const F = dia(2026, 10, 15);
const base = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, F)] };

describe("ventana de fechas y estados con pago", () => {
  it("pago anticipado dentro de la ventana: pagado, con la diferencia negativa", () => {
    const r = estadoDe(correr({ ...base, movimientos: [mov(100, dia(2026, 10, 12), "PAGO 12345")] }), 10);
    expect(r).toMatchObject({ estado: "pagado", movimientoId: 100, diferenciaDias: -3, motivo: MOTIVOS.pagado });
  });

  it("pago tardío dentro de la ventana: pagado y guarda cuántos días después", () => {
    const r = estadoDe(correr({ ...base, movimientos: [mov(100, dia(2026, 10, 18), "PAGO 12345")] }), 10);
    expect(r).toMatchObject({ estado: "pagado", diferenciaDias: 3 });
  });

  it("pago fuera de la ventana: no cuenta (vencido si hay cobertura)", () => {
    for (const d of [dia(2026, 10, 11), dia(2026, 10, 19)]) {
      const r = estadoDe(correr({ ...base, movimientos: [mov(100, d, "PAGO 12345")] }), 10);
      expect(r).toMatchObject({ estado: "vencido", movimientoId: null });
    }
  });

  it("la ventana usa parámetros separados y cruza de un mes a otro", () => {
    const f = dia(2026, 9, 30);
    const m = mov(100, dia(2026, 10, 4), "PAGO 12345");
    const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, f)], movimientos: [m] };
    expect(estadoDe(correr({ ...e, diasDespues: 3 }), 10).estado).toBe("vencido"); // 4 días después: fuera
    expect(estadoDe(correr({ ...e, diasDespues: 5 }), 10)).toMatchObject({ estado: "pagado", diferenciaDias: 4 });
    expect(estadoDe(correr({ ...e, diasAntes: 0, diasDespues: 5, movimientos: [mov(100, dia(2026, 9, 29), "PAGO 12345")] }), 10).estado).toBe("vencido");
  });

  it("el movimiento de un crédito o sin descripción no se usa (el motor solo recibe débitos con texto)", () => {
    const r = estadoDe(correr({ ...base, movimientos: [{ id: 100, sociedadId: S1, fecha: dia(2026, 10, 15), descripcion: null }] }), 10);
    expect(r.estado).toBe("vencido");
  });
});

describe("identificador en la descripción", () => {
  it("acepta ceros a la izquierda en cualquiera de los dos lados y exige delimitación numérica", () => {
    const casos: [string, string, boolean][] = [
      ["12345", "PAGO:JASEC 0000012345", true],
      ["00012345", "PAGO 12345 FIN", true],
      ["12345", "PAGO 123456", false],
      ["12345", "PAGO 912345", false],
      ["12345", "REF-12345-X", true],
      ["12345", "PAGO 1234", false],
      ["CR12ABC", "TRANSF CR12ABC OK", true],
      ["CR12ABC", "TRANSF XCR12ABC", false],
    ];
    for (const [id, texto, espera] of casos) expect(patronIdentificador(id)!.test(texto.toUpperCase()), `${id} en ${texto}`).toBe(espera);
  });
});

describe("identificador compartido", () => {
  const compartidas = [oblig(1, "99999", "Cabletica"), oblig(2, "99999", "Movistar")];
  const vs = [venc(10, 1, F), venc(20, 2, F)];

  it("si la descripción trae el nombre de un solo proveedor (sin importar mayúsculas, tildes ni espacios), se asigna a esa obligación", () => {
    const r = correr({ obligaciones: compartidas, vencimientos: vs, movimientos: [mov(100, F, "Pago cable tica 99999")] });
    expect(estadoDe(r, 10)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    expect(estadoDe(r, 20)).toMatchObject({ estado: "vencido", movimientoId: null });
    expect(r.estadisticas.desempatadosPorProveedor).toBe(1);
  });

  it("sin nombre de proveedor no se asigna a nadie: ambas quedan por revisar", () => {
    const r = correr({ obligaciones: compartidas, vencimientos: vs, movimientos: [mov(100, F, "PAGO SERVICIO 99999")] });
    expect(estadoDe(r, 10)).toMatchObject({ estado: "por_revisar", movimientoId: null, motivo: MOTIVOS.compartido });
    expect(estadoDe(r, 20)).toMatchObject({ estado: "por_revisar", movimientoId: null });
    expect(r.estadisticas.compartidosSinResolver).toBe(1);
  });

  it("con los dos nombres en la descripción tampoco se decide", () => {
    const r = correr({ obligaciones: compartidas, vencimientos: vs, movimientos: [mov(100, F, "CABLETICA MOVISTAR 99999")] });
    expect(estadoDe(r, 10).estado).toBe("por_revisar");
  });

  it("una obligación inactiva no compite (el motor solo recibe las activas)", () => {
    const r = correr({ obligaciones: [compartidas[0]!], vencimientos: [vs[0]!], movimientos: [mov(100, F, "PAGO 99999")] });
    expect(estadoDe(r, 10).estado).toBe("pagado");
  });
});

describe("sociedades y pagos repetidos", () => {
  it("candidato solo en la cuenta de otra sociedad: pagado con inconsistencia", () => {
    const r = correr({ ...base, movimientos: [mov(100, F, "PAGO 12345", S2)] });
    expect(estadoDe(r, 10)).toMatchObject({ estado: "pagado_con_inconsistencia", motivo: MOTIVOS.otraSociedad, movimientoId: 100 });
    expect(r.estadisticas.deOtraSociedadPorSociedad.get(S2)).toBe(1);
  });

  it("si la otra sociedad tiene su propia obligación con ese identificador, el pago es de ella y no de la primera", () => {
    const r = correr({
      obligaciones: [oblig(1, "12345"), oblig(2, "12345", "Luz Uno", S2)],
      vencimientos: [venc(10, 1, F), venc(20, 2, F, S2)],
      movimientos: [mov(100, F, "PAGO 12345", S2)],
    });
    expect(estadoDe(r, 20).estado).toBe("pagado");
    expect(estadoDe(r, 10).estado).toBe("vencido");
  });

  it("dos movimientos distintos en la ventana: pagado con inconsistencia por pago repetido", () => {
    const r = correr({ ...base, movimientos: [mov(100, dia(2026, 10, 14), "PAGO 12345"), mov(101, dia(2026, 10, 16), "PAGO 12345")] });
    expect(estadoDe(r, 10)).toMatchObject({ estado: "pagado_con_inconsistencia", motivo: MOTIVOS.repetido });
  });

  it("un movimiento no se usa en dos vencimientos de la misma obligación: va al más cercano", () => {
    const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, dia(2026, 10, 10)), venc(11, 1, dia(2026, 10, 17))] };
    const r = correr({ ...e, movimientos: [mov(100, dia(2026, 10, 14), "PAGO 12345")] }); // a 4 de la primera (fuera) y 3 de la segunda
    expect(estadoDe(r, 11)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    expect(estadoDe(r, 10).movimientoId).toBeNull();
  });

  it("empate de cercanía entre dos vencimientos: ambos por revisar", () => {
    const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, dia(2026, 10, 10)), venc(11, 1, dia(2026, 10, 16))] };
    const r = correr({ ...e, movimientos: [mov(100, dia(2026, 10, 13), "PAGO 12345")] });
    expect(estadoDe(r, 10)).toMatchObject({ estado: "por_revisar", motivo: MOTIVOS.empate });
    expect(estadoDe(r, 11).estado).toBe("por_revisar");
    expect(r.estadisticas.empates).toBe(1);
  });
});

describe("sin pago: tiempo y cobertura", () => {
  const estado = (fecha: Date, extra: Partial<EntradaCruce> = {}) => estadoDe(correr({ obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, fecha)], ...extra }), 10);

  it("proyectado, por vencer y vencido según los días de aviso", () => {
    expect(estado(dia(2026, 11, 20)).estado).toBe("proyectado");
    expect(estado(dia(2026, 10, 31)).estado).toBe("proyectado"); // faltan 4 días: aún fuera del aviso
    expect(estado(dia(2026, 10, 30)).estado).toBe("por_vencer"); // faltan 3
    expect(estado(dia(2026, 10, 27)).estado).toBe("por_vencer"); // vence hoy
    expect(estado(dia(2026, 10, 20))).toMatchObject({ estado: "vencido", motivo: MOTIVOS.vencido });
  });

  it("cobertura insuficiente: sin información con la fecha hasta la que hay datos, nunca vencido", () => {
    const corto = new Map([[S1, [cuenta(1, dia(2026, 10, 16))]]]);
    expect(estado(F, { cuentas: corto })).toMatchObject({ estado: "sin_informacion", sinInfoHasta: dia(2026, 10, 16), motivo: MOTIVOS.sinInformacion });
  });

  it("una cuenta sin archivo del periodo no cubre: la menor cobertura de la sociedad manda", () => {
    const dos = new Map([[S1, [cuenta(1), cuenta(2, null, ["2026-09"])]]]);
    expect(estado(F, { cuentas: dos })).toMatchObject({ estado: "sin_informacion", sinInfoHasta: null });
    const dosCompletas = new Map([[S1, [cuenta(1), cuenta(2, dia(2026, 10, 18))]]]);
    expect(estado(F, { cuentas: dosCompletas }).estado).toBe("vencido"); // justo cubre hasta F + 3
    const unaCorta = new Map([[S1, [cuenta(1), cuenta(2, dia(2026, 10, 17))]]]);
    expect(estado(F, { cuentas: unaCorta })).toMatchObject({ estado: "sin_informacion", sinInfoHasta: dia(2026, 10, 17) });
  });

  it("sin cuentas conocidas o con el mes en curso sin movimientos: sin información", () => {
    expect(estado(F, { cuentas: new Map() }).estado).toBe("sin_informacion");
    expect(estado(F, { cuentas: new Map([[S1, [cuenta(1, null)]]]) }).estado).toBe("sin_informacion");
  });

  it("un mes cerrado con archivo cubre hasta su fin; sin archivo de ese mes, no", () => {
    const sep = dia(2026, 9, 28); // la ventana llega al 1 de octubre
    expect(estado(sep).estado).toBe("vencido");
    const soloSep = new Map([[S1, [cuenta(1, null, ["2026-09"])]]]);
    expect(estado(sep, { cuentas: soloSep })).toMatchObject({ estado: "sin_informacion", sinInfoHasta: dia(2026, 9, 30) });
  });

  it("un pago encontrado gana sobre la cobertura: pagado aunque falten estados posteriores", () => {
    const corto = new Map([[S1, [cuenta(1, dia(2026, 10, 15))]]]);
    expect(estado(F, { cuentas: corto, movimientos: [mov(100, F, "PAGO 12345")] }).estado).toBe("pagado");
  });
});

describe("determinismo", () => {
  it("repetir el cálculo con los mismos datos da el mismo resultado", () => {
    const entrada = { ...base, movimientos: [mov(100, dia(2026, 10, 14), "PAGO 12345"), mov(101, dia(2026, 10, 16), "PAGO 12345")] };
    expect(correr(entrada).resultados).toEqual(correr(entrada).resultados);
    expect(correr({ ...entrada, movimientos: [...entrada.movimientos].reverse() }).resultados).toEqual(correr(entrada).resultados);
  });
});
