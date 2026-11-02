import { describe, expect, it } from "vitest";
import { asociacionSinEfecto, ESTADOS_ASOCIABLES, marcasDeCoincidencia, MAXIMO_CANDIDATOS, ordenarCandidatos, rangoDeCandidatos, ventanaDeAsociacion } from "../src/domain/asociacion.js";
import type { CuentaCorte } from "../src/domain/cobertura-corte.js";
import { cruzar, MOTIVOS, type AsociacionManual, type EntradaCruce, type MovimientoCruce, type ObligacionCruce, type VencimientoCruce } from "../src/domain/cruce.js";
import { lineaDeAsociarPago, lineaDeQuitarAsociacion } from "../src/domain/historial.js";

// Motor de cruce con decisiones manuales, y reglas puras de «asociar un pago». Datos inventados. Hoy = 2026-10-27, ventana 3 y 3.
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const HOY = dia(2026, 10, 27);
const S1 = 1;
const S2 = 2;
const oblig = (id: number, identificador: string, proveedor = "Luz Uno", sociedadId = S1): ObligacionCruce => ({ id, sociedadId, proveedor, identificador });
const venc = (id: number, obligacionId: number, fecha: Date, sociedadId = S1): VencimientoCruce => ({ id, obligacionId, sociedadId, fecha, periodo: fecha.toISOString().slice(0, 7) });
const mov = (id: number, fecha: Date, descripcion: string, sociedadId = S1): MovimientoCruce => ({ id, sociedadId, fecha, descripcion, clave: `huella-${id}` });
const cuenta = (cuentaId: number): CuentaCorte => ({ cuentaId, meses: new Map([["2026-09", dia(2026, 9, 30)], ["2026-10", dia(2026, 10, 26)]]) });
const manual = (obligacionId: number, periodo: string, id: number): AsociacionManual => ({ obligacionId, periodo, claveMovimiento: `huella-${id}` });

function correr(parcial: Partial<EntradaCruce>) {
  return cruzar({
    obligaciones: [], vencimientos: [], movimientos: [], cuentas: new Map([[S1, [cuenta(1)]], [S2, [cuenta(2)]]]),
    diasAntes: 3, diasDespues: 3, diasAviso: 3, hoy: HOY, ...parcial,
  });
}
const de = (r: ReturnType<typeof correr>, id: number) => r.resultados.find((x) => x.vencimientoId === id)!;
const F = dia(2026, 10, 15);

describe("motor: decisiones manuales", () => {
  it("una asociación deja el vencimiento Pagado con ese pago, aunque esté vencido; la diferencia se calcula contra la fecha vigente", () => {
    const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, F)], movimientos: [mov(100, dia(2026, 10, 22), "TRANSFERENCIA SIN NUMERO")] };
    expect(de(correr(e), 10).estado).toBe("vencido");
    const r = de(correr({ ...e, asociaciones: [manual(1, "2026-10", 100)] }), 10);
    expect(r).toMatchObject({ estado: "pagado", movimientoId: 100, motivo: MOTIVOS.asociadoAMano, diferenciaDias: 7, sinInfoHasta: null });
    // con la fecha movida «solo este mes» se cuenta contra la fecha vigente
    const movida = { ...e, vencimientos: [venc(10, 1, dia(2026, 10, 24))] };
    expect(de(correr({ ...movida, asociaciones: [manual(1, "2026-10", 100)] }), 10)).toMatchObject({ estado: "pagado", diferenciaDias: -2 });
  });

  it("gana a lo automático: el pago elegido manda aunque el motor hubiera encontrado otro", () => {
    const e = {
      obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, F)],
      movimientos: [mov(100, dia(2026, 10, 15), "PAGO 12345"), mov(101, dia(2026, 10, 20), "OTRA COSA")],
    };
    expect(de(correr(e), 10)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    expect(de(correr({ ...e, asociaciones: [manual(1, "2026-10", 101)] }), 10)).toMatchObject({ estado: "pagado", movimientoId: 101, motivo: MOTIVOS.asociadoAMano });
  });

  it("gana a Por revisar y saca el pago de los demás vencimientos del grupo (esos se recalculan solos)", () => {
    // el mismo número de servicio en dos obligaciones de la misma sociedad: un pago sin nombre del proveedor deja a las dos en revisión
    const e = {
      obligaciones: [oblig(1, "55555", "Luz Uno"), oblig(2, "55555", "Luz Dos")],
      vencimientos: [venc(10, 1, F), venc(20, 2, F)],
      movimientos: [mov(100, dia(2026, 10, 15), "PAGO 55555")],
    };
    const solo = correr(e);
    expect(de(solo, 10).estado).toBe("por_revisar");
    expect(de(solo, 20).estado).toBe("por_revisar");
    const con = correr({ ...e, asociaciones: [manual(1, "2026-10", 100)] });
    expect(de(con, 10)).toMatchObject({ estado: "pagado", movimientoId: 100, motivo: MOTIVOS.asociadoAMano });
    // la otra ya no tiene ese pago a la vista: se calcula sola (sin pago, hay cobertura: vencido)
    expect(de(con, 20)).toMatchObject({ estado: "vencido", movimientoId: null });
  });

  it("el pago asociado sale también de los candidatos de otra obligación (no respalda dos vencimientos)", () => {
    const e = {
      obligaciones: [oblig(1, "11111"), oblig(2, "22222", "Agua")],
      vencimientos: [venc(10, 1, F), venc(20, 2, F)],
      movimientos: [mov(100, dia(2026, 10, 15), "PAGO 22222")], // este pago es automáticamente del vencimiento 20
    };
    expect(de(correr(e), 20)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    const con = correr({ ...e, asociaciones: [manual(1, "2026-10", 100)] });
    expect(de(con, 10)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    expect(de(con, 20)).toMatchObject({ estado: "vencido", movimientoId: null });
  });

  it("sin efecto: si el movimiento ya no se encuentra, la decisión no cambia nada y el vencimiento vuelve a su estado calculado", () => {
    const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, F)], movimientos: [mov(100, dia(2026, 10, 20), "OTRA COSA")] };
    const base = correr(e);
    expect(correr({ ...e, asociaciones: [manual(1, "2026-10", 999)] })).toEqual(base); // huella que no existe
    expect(correr({ ...e, asociaciones: [manual(1, "2026-11", 100)] })).toEqual(base); // periodo sin vencimiento
    expect(de(base, 10).estado).toBe("vencido");
  });

  it("el pago de otra sociedad no se usa (las asociaciones entre sociedades no existen todavía)", () => {
    const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, F)], movimientos: [mov(100, dia(2026, 10, 15), "OTRA COSA", S2)] };
    expect(correr({ ...e, asociaciones: [manual(1, "2026-10", 100)] })).toEqual(correr(e));
  });

  it("un pago no respalda dos vencimientos aunque haya dos decisiones sobre él: vale la primera", () => {
    const e = { obligaciones: [oblig(1, "11111"), oblig(2, "22222", "Agua")], vencimientos: [venc(10, 1, F), venc(20, 2, F)], movimientos: [mov(100, dia(2026, 10, 15), "X")] };
    const r = correr({ ...e, asociaciones: [manual(1, "2026-10", 100), manual(2, "2026-10", 100)] });
    expect(de(r, 10)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    expect(de(r, 20).movimientoId).toBeNull();
  });

  it("SIN decisiones vigentes los resultados son IDÉNTICOS a los de siempre (sin la lista, con la lista vacía y con huellas en los movimientos)", () => {
    const e: Partial<EntradaCruce> = {
      obligaciones: [oblig(1, "12345"), oblig(2, "55555", "Luz Uno"), oblig(3, "55555", "Luz Dos"), oblig(4, "77777", "Agua", S2), oblig(5, "88888", "Gas")],
      vencimientos: [venc(10, 1, F), venc(20, 2, F), venc(30, 3, F), venc(40, 4, dia(2026, 10, 12), S2), venc(50, 5, dia(2026, 10, 30)), venc(51, 5, dia(2026, 9, 15))],
      movimientos: [
        mov(100, dia(2026, 10, 15), "PAGO 12345"), mov(101, dia(2026, 10, 15), "PAGO 55555"), mov(102, dia(2026, 10, 12), "PAGO 77777", S2),
        mov(103, dia(2026, 10, 13), "PAGO 77777", S2), mov(104, dia(2026, 10, 1), "COMISION"), mov(105, dia(2026, 9, 15), "PAGO 88888"),
      ],
    };
    const sinHuellas = { ...e, movimientos: e.movimientos!.map(({ clave: _c, ...m }) => m) };
    const base = correr(sinHuellas); // el motor tal como era: sin huellas ni lista de asociaciones
    expect(correr(e)).toEqual(base);
    expect(correr({ ...e, asociaciones: [] })).toEqual(base);
    expect(new Set(base.resultados.map((r) => r.estado)).size).toBeGreaterThan(3); // el escenario cubre varios estados
  });
});

describe("reglas puras de asociar un pago", () => {
  it("estados que lo admiten: por revisar, vencido y sin información", () => {
    expect([...ESTADOS_ASOCIABLES].sort()).toEqual(["justificado", "por_revisar", "sin_informacion", "vencido"]); // «justificado» viene de un vencido o sin información: la asociación gana
  });

  it("la ventana sale del parámetro, con respaldo de 30 días si falta o no vale", () => {
    expect(ventanaDeAsociacion("10")).toBe(10);
    for (const t of [null, "", "abc", "0", "-3", "2.5", "500"]) expect(ventanaDeAsociacion(t), String(t)).toBe(30);
  });

  it("rango: N días a cada lado, ambos incluidos", () => {
    const r = rangoDeCandidatos(dia(2026, 10, 15), 30);
    expect(r.desde.toISOString().slice(0, 10)).toBe("2026-09-15");
    expect(r.hastaExclusivo.toISOString().slice(0, 10)).toBe("2026-11-15");
  });

  it("orden: más cercano a la fecha vigente, luego el más antiguo, luego el id; con tope de 50", () => {
    const f = dia(2026, 10, 15);
    const c = [
      { id: 1, fecha: dia(2026, 10, 18) }, { id: 2, fecha: dia(2026, 10, 12) }, { id: 3, fecha: dia(2026, 10, 15) },
      { id: 4, fecha: dia(2026, 10, 12) }, { id: 5, fecha: dia(2026, 10, 14) },
    ];
    expect(ordenarCandidatos(c, f).map((x) => x.id)).toEqual([3, 5, 2, 4, 1]);
    const muchos = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, fecha: dia(2026, 10, 1 + (i % 28)) }));
    expect(ordenarCandidatos(muchos, f)).toHaveLength(MAXIMO_CANDIDATOS);
    expect(MAXIMO_CANDIDATOS).toBe(50);
  });

  it("sin efecto: solo si el vencimiento no está Pagado con el pago elegido", () => {
    expect(asociacionSinEfecto("pagado", "h1", "h1")).toBe(false);
    expect(asociacionSinEfecto("pagado", "h2", "h1")).toBe(true);
    expect(asociacionSinEfecto("vencido", null, "h1")).toBe(true);
    expect(asociacionSinEfecto("pagado", null, "h1")).toBe(true);
  });

  it("líneas del historial: solo el periodo, nunca montos, cuentas ni identificadores", () => {
    expect(lineaDeAsociarPago("2026-10")).toEqual({ accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: "2026-10" });
    expect(lineaDeQuitarAsociacion("2026-10")).toEqual({ accion: "quitar_asociacion", campo: "pago_asociado", antes: "2026-10", despues: null });
  });
});

describe("marcas «trae el número» y «trae el proveedor»", () => {
  const luz = { identificador: "12345", proveedor: "Luz Uno" };
  const m = (descripcion: string | null, referencia: string | null = null) => marcasDeCoincidencia({ descripcion, referencia }, luz);

  it("número: la misma extracción del cruce (ceros a la izquierda, delimitación numérica) en la descripción o en la referencia", () => {
    expect(m("PAGO 12345").traeNumero).toBe(true);
    expect(m("PAGO 0000012345 FIN").traeNumero).toBe(true);
    expect(m("pago 12345").traeNumero).toBe(true); // sin importar mayúsculas
    expect(m("PAGO 123456").traeNumero).toBe(false);
    expect(m("PAGO 912345").traeNumero).toBe(false);
    expect(m("SIN NUMERO", "12345").traeNumero).toBe(true); // en la referencia
    expect(m("SIN NUMERO", "123456").traeNumero).toBe(false);
    expect(m(null, null).traeNumero).toBe(false);
    expect(marcasDeCoincidencia({ descripcion: "PAGO 12345" }, { identificador: "", proveedor: "X" }).traeNumero).toBe(false); // identificador vacío
  });

  it("proveedor: nombre sin importar mayúsculas, tildes ni espacios; alias conocidos y rótulos del banco", () => {
    expect(m("PAGO LUZ UNO").traeProveedor).toBe(true);
    expect(m("pago LUZUNO").traeProveedor).toBe(true);
    expect(m("COBRO LUZ DOS").traeProveedor).toBe(false);
    expect(m("PAGO 12345", "LUZ UNO").traeProveedor).toBe(false); // el proveedor se busca en la descripción
    expect(marcasDeCoincidencia({ descripcion: "ICETEL 55555" }, { identificador: "99", proveedor: "ICE" }).traeProveedor).toBe(true); // rótulo del banco
    expect(marcasDeCoincidencia({ descripcion: "PAGO MOVIS" }, { identificador: "99", proveedor: "Movistar" }).traeProveedor).toBe(true);
    expect(marcasDeCoincidencia({ descripcion: "PAGO ICE TELEFONO" }, { identificador: "99", proveedor: "ICE Telefono" }).traeProveedor).toBe(true); // alias de la unión de proveedores
    expect(marcasDeCoincidencia({ descripcion: "PAGO JASEC" }, { identificador: "99", proveedor: "JASEC Internet" }).traeProveedor).toBe(true); // el canónico de un alias
  });

  it("las cuatro combinaciones", () => {
    expect(m("PAGO LUZ UNO 12345")).toEqual({ traeNumero: true, traeProveedor: true });
    expect(m("PAGO 12345")).toEqual({ traeNumero: true, traeProveedor: false });
    expect(m("PAGO LUZ UNO")).toEqual({ traeNumero: false, traeProveedor: true });
    expect(m("COBRO BETA")).toEqual({ traeNumero: false, traeProveedor: false });
  });
});

describe("orden de los pagos candidatos por marcas", () => {
  const f = dia(2026, 10, 15);
  const c = (id: number, d: number, traeNumero = false, traeProveedor = false) => ({ id, fecha: dia(2026, 10, d), traeNumero, traeProveedor });

  it("primero número y proveedor, luego solo número, luego solo proveedor, luego el resto; dentro de cada grupo, cercanía, fecha e id", () => {
    const lista = [
      c(1, 15), // ninguno, el más cercano
      c(2, 25, false, true), // solo proveedor, lejos
      c(3, 24, true, false), // solo número, lejos
      c(4, 28, true, true), // ambos, el más lejos de todos
      c(5, 16, true, false), // solo número, cerca
      c(6, 14, false, true), // solo proveedor, cerca
      c(7, 14, false, false), // ninguno, a 1 día, antes que el siguiente
      c(8, 16, false, false), // ninguno, a 1 día, después
    ];
    expect(ordenarCandidatos(lista, f).map((x) => x.id)).toEqual([4, 5, 3, 6, 2, 1, 7, 8]);
  });

  it("el tope se aplica DESPUÉS de ordenar: uno con marca lejano entra y uno sin marca cercano queda fuera", () => {
    const sinMarca = Array.from({ length: 60 }, (_, i) => c(i + 1, 10 + (i % 11))); // 60 pagos sin marca, todos cerca
    const lejanoConMarca = c(100, 28, true, true); // a 13 días
    const r = ordenarCandidatos([...sinMarca, lejanoConMarca], f);
    expect(r).toHaveLength(MAXIMO_CANDIDATOS);
    expect(r[0]!.id).toBe(100); // el que trae número y proveedor va primero aunque esté lejos
    // de los sin marca quedan los 49 más cercanos: se pierde el más lejano de todos
    const cercanos = ordenarCandidatos(sinMarca, f);
    expect(r.slice(1).map((x) => x.id)).toEqual(cercanos.slice(0, 49).map((x) => x.id));
    expect(r.map((x) => x.id)).not.toContain(cercanos[49]!.id);
  });
});
