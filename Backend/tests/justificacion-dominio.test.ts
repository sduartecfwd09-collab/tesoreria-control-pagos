import { describe, expect, it } from "vitest";
import type { CuentaCorte } from "../src/domain/cobertura-corte.js";
import { cruzar, MOTIVOS, type EntradaCruce, type MovimientoCruce, type ObligacionCruce, type VencimientoCruce } from "../src/domain/cruce.js";
import {
  claveUnicaJustificacionArchivo, claveUnicaJustificacionVencimiento, datosDeJustificacion, ESTADOS_JUSTIFICABLES, justificacionDaCobertura, justificacionDeArchivoTieneEfecto,
  MOTIVOS_POR_PROBLEMA, MOTIVOS_VENCIMIENTO, motivoParaHistorial, motivosDeProblema, problemaDeArchivo, validarMotivoYNota, type ProblemaArchivo,
} from "../src/domain/justificacion.js";
import { claveObligacionPeriodo } from "../src/domain/asociacion.js";
import { MOTIVO_CARPETA_SIN_SOCIEDAD, MOTIVO_NOMBRE_NO_COINCIDE } from "../src/domain/estado-archivo.js";
import { lineaDeJustificarArchivo, lineaDeJustificarVencimiento, lineaDeQuitarJustificacionArchivo, lineaDeQuitarJustificacionVencimiento } from "../src/domain/historial.js";

// Justificaciones: reglas puras (motivos, notas, problema de un archivo, efecto) y el motor de cruce. Datos inventados. Hoy = 2026-10-27, ventana 3 y 3.
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const HOY = dia(2026, 10, 27);
const S1 = 1;
const oblig = (id: number, identificador: string): ObligacionCruce => ({ id, sociedadId: S1, proveedor: "Luz Uno", identificador });
const venc = (id: number, obligacionId: number, fecha: Date): VencimientoCruce => ({ id, obligacionId, sociedadId: S1, fecha, periodo: fecha.toISOString().slice(0, 7) });
const mov = (id: number, fecha: Date, descripcion: string): MovimientoCruce => ({ id, sociedadId: S1, fecha, descripcion, clave: `huella-${id}` });
const cuenta = (corte: Date | null = dia(2026, 10, 26)): CuentaCorte => ({ cuentaId: 1, meses: new Map([["2026-09", dia(2026, 9, 30)], ["2026-10", corte]]) });
function correr(parcial: Partial<EntradaCruce>) {
  return cruzar({ obligaciones: [], vencimientos: [], movimientos: [], cuentas: new Map([[S1, [cuenta()]]]), diasAntes: 3, diasDespues: 3, diasAviso: 3, hoy: HOY, ...parcial });
}
const de = (r: ReturnType<typeof correr>, id: number) => r.resultados.find((x) => x.vencimientoId === id)!;
const F = dia(2026, 10, 15);

describe("motor: justificar un vencimiento", () => {
  const e = { obligaciones: [oblig(1, "12345")], vencimientos: [venc(10, 1, F)] };
  const j = [{ obligacionId: 1, periodo: "2026-10" }];

  it("un Vencido pasa a Justificado (no cuenta como pagado: sin pago ni diferencia de días)", () => {
    expect(de(correr(e), 10).estado).toBe("vencido");
    expect(de(correr({ ...e, justificaciones: j }), 10)).toEqual({ vencimientoId: 10, estado: "justificado", movimientoId: null, motivo: MOTIVOS.justificado, diferenciaDias: null, sinInfoHasta: null });
  });

  it("un Sin información también (cobertura que no alcanza)", () => {
    const corto = { ...e, cuentas: new Map([[S1, [cuenta(dia(2026, 10, 16))]]]) };
    expect(de(correr(corto), 10).estado).toBe("sin_informacion");
    expect(de(correr({ ...corto, justificaciones: j }), 10)).toMatchObject({ estado: "justificado", sinInfoHasta: null });
  });

  it("solo aplica a Vencido y Sin información: Por vencer, Programado, Pagado y Por revisar siguen igual", () => {
    const base = correr(e);
    const antes = (hoy: Date) => correr({ ...e, hoy, justificaciones: j });
    expect(de(antes(dia(2026, 10, 14)), 10).estado).toBe("por_vencer");
    expect(de(antes(dia(2026, 10, 1)), 10).estado).toBe("proyectado");
    const pagado = { ...e, movimientos: [mov(100, dia(2026, 10, 15), "PAGO 12345")] };
    expect(de(correr({ ...pagado, justificaciones: j }), 10)).toMatchObject({ estado: "pagado", movimientoId: 100 });
    const compartido = {
      obligaciones: [oblig(1, "55555"), { ...oblig(2, "55555"), proveedor: "Luz Dos" }],
      vencimientos: [venc(10, 1, F), venc(20, 2, F)],
      movimientos: [mov(100, dia(2026, 10, 15), "PAGO 55555")],
    };
    expect(de(correr({ ...compartido, justificaciones: j }), 10).estado).toBe("por_revisar");
    expect(base).toEqual(correr({ ...e, justificaciones: [] }));
  });

  it("el pago manda: con una asociación manual queda Pagado aunque esté justificado", () => {
    const r = correr({ ...e, movimientos: [mov(100, dia(2026, 10, 24), "TRANSFERENCIA")], justificaciones: j, asociaciones: [{ obligacionId: 1, periodo: "2026-10", claveMovimiento: "huella-100" }] });
    expect(de(r, 10)).toMatchObject({ estado: "pagado", movimientoId: 100, motivo: MOTIVOS.asociadoAMano });
  });

  it("otro mes o otra obligación no se justifican por error", () => {
    expect(de(correr({ ...e, justificaciones: [{ obligacionId: 1, periodo: "2026-11" }, { obligacionId: 2, periodo: "2026-10" }] }), 10).estado).toBe("vencido");
  });

  it("SIN justificaciones los resultados son IDÉNTICOS a los de siempre (sin la lista, con la lista vacía y con justificaciones que no aplican)", () => {
    const rico: Partial<EntradaCruce> = {
      obligaciones: [oblig(1, "12345"), oblig(2, "55555"), { ...oblig(3, "55555"), proveedor: "Luz Dos" }, oblig(5, "88888")],
      vencimientos: [venc(10, 1, F), venc(20, 2, F), venc(30, 3, F), venc(50, 5, dia(2026, 10, 30)), venc(51, 5, dia(2026, 9, 15))],
      movimientos: [mov(100, dia(2026, 10, 15), "PAGO 12345"), mov(101, dia(2026, 10, 15), "PAGO 55555"), mov(104, dia(2026, 10, 1), "COMISION")],
    };
    const base = correr(rico);
    expect(correr({ ...rico, justificaciones: [] })).toEqual(base);
    expect(correr({ ...rico, justificaciones: [{ obligacionId: 9, periodo: "2026-10" }] })).toEqual(base);
    expect(new Set(base.resultados.map((r) => r.estado)).size).toBeGreaterThan(3);
  });
});

describe("motivos y notas", () => {
  it("vencimientos: tres motivos fijos; solo «Otro» exige nota", () => {
    expect(MOTIVOS_VENCIMIENTO.map((m) => [m.clave, m.texto, m.notaObligatoria])).toEqual([
      ["no_se_paga", "No se paga este mes", false],
      ["otro_medio", "Se pagó por otro medio", false],
      ["otro", "Otro (explicar)", true],
    ]);
    expect(ESTADOS_JUSTIFICABLES).toEqual(["vencido", "sin_informacion"]);
  });

  it("archivos: UN solo mapa problema -> motivos, con «El banco confirma…» solo en la imagen no legible", () => {
    const claves = (p: ProblemaArchivo) => motivosDeProblema(p).map((m) => m.clave);
    expect(claves("imagen_no_legible")).toEqual(["banco_confirma_sin_movimientos", "pedido_al_banco", "otro"]);
    expect(claves("saldo_no_cuadra")).toEqual(["saldo_difiere", "solo_ese_movimiento", "pedido_al_banco", "otro"]);
    expect(claves("con_error")).toEqual(["pedido_al_banco", "otro"]);
    expect(claves("sin_sociedad")).toEqual(["pedido_al_banco", "otro"]);
    expect(claves("nombre_distinto")).toEqual(["pedido_al_banco", "otro"]);
    for (const p of Object.keys(MOTIVOS_POR_PROBLEMA) as ProblemaArchivo[]) {
      expect(claves(p).includes("banco_confirma_sin_movimientos"), p).toBe(p === "imagen_no_legible");
      expect(claves(p).at(-1), p).toBe("otro");
      expect(claves(p), p).toContain("pedido_al_banco");
    }
    // los que dicen «(explicar)» y «Otro» exigen nota; los demás la admiten opcional
    const obligatoria = (p: ProblemaArchivo) => motivosDeProblema(p).filter((m) => m.notaObligatoria).map((m) => m.clave);
    expect(obligatoria("saldo_no_cuadra")).toEqual(["saldo_difiere", "otro"]);
    expect(obligatoria("imagen_no_legible")).toEqual(["otro"]);
    for (const m of motivosDeProblema("saldo_no_cuadra")) expect(m.notaObligatoria).toBe(m.texto.includes("(explicar)"));
  });

  it("validación: el motivo debe estar entre los permitidos; la nota es opcional (hasta 300) u obligatoria (3 a 300) y se normaliza", () => {
    const v = (clave: unknown, nota?: unknown) => validarMotivoYNota(MOTIVOS_VENCIMIENTO, clave, nota);
    expect(v("no_se_paga")).toMatchObject({ ok: true, nota: null });
    expect(v("no_se_paga", "  la   tienda cerró ")).toMatchObject({ ok: true, nota: "la tienda cerró" });
    expect(v("no_se_paga", "   ")).toMatchObject({ ok: true, nota: null });
    expect(v("no_se_paga", "x".repeat(300))).toMatchObject({ ok: true });
    expect(v("no_se_paga", "x".repeat(301))).toMatchObject({ ok: false, campo: "nota" });
    expect(v("otro")).toMatchObject({ ok: false, campo: "nota" });
    expect(v("otro", "ab")).toMatchObject({ ok: false, campo: "nota" });
    expect(v("otro", "abc")).toMatchObject({ ok: true, nota: "abc" });
    expect(v("otro", "x".repeat(301))).toMatchObject({ ok: false, campo: "nota" });
    for (const malo of [undefined, null, "", "inexistente", 3, {}]) expect(v(malo), String(malo)).toMatchObject({ ok: false, campo: "motivo" });
    expect(v("no_se_paga", 5)).toMatchObject({ ok: false, campo: "nota" });
    // un motivo de archivo no vale para otro problema
    expect(validarMotivoYNota(motivosDeProblema("saldo_no_cuadra"), "banco_confirma_sin_movimientos")).toMatchObject({ ok: false, campo: "motivo" });
  });

  it("el motivo del historial junta el motivo y la nota, con tope de 300", () => {
    expect(motivoParaHistorial("No se paga este mes", null)).toBe("No se paga este mes");
    expect(motivoParaHistorial("Otro (explicar)", "cerró")).toBe("Otro (explicar): cerró");
    expect(motivoParaHistorial("Otro (explicar)", "x".repeat(300))).toHaveLength(300);
  });

  it("las claves únicas de justificaciones no chocan con las de las asociaciones de pago", () => {
    expect(claveUnicaJustificacionVencimiento(7, "2026-10")).toBe("j|7|2026-10");
    expect(claveUnicaJustificacionVencimiento(7, "2026-10")).not.toBe(claveObligacionPeriodo(7, "2026-10"));
    expect(claveUnicaJustificacionVencimiento(123456789, "2026-10").length).toBeLessThanOrEqual(60);
    expect(claveUnicaJustificacionArchivo(12)).toBe("a|12");
    expect(claveUnicaJustificacionArchivo(2_000_000_000).length).toBeLessThanOrEqual(40);
    expect(claveUnicaJustificacionArchivo(12)).not.toMatch(/^[0-9a-f]{40}$/); // las huellas de pagos son 40 hexadecimales
  });
});

describe("problema de un archivo y efecto de su justificación", () => {
  const leido = (detalle: unknown) => ({ estado: "leido", motivo: null, error: null, retiradoEn: null, detalle });
  const imagen = { continuidad: { estado: "no_verificable", razon: "imagen_no_legible" } };
  const sinMov = { continuidad: { estado: "no_verificable", razon: "sin_movimientos" } };
  const noCuadra = { continuidad: { estado: "no_cuadra", verificados: 10, fallos: 2 } };
  const cuadra = { continuidad: { estado: "cuadra" } };
  const noVerificable = { continuidad: { estado: "no_verificable", razon: "un_solo_saldo", movimientos: 1 } };

  it("cada problema que muestra «requieren atención»; lo demás no es un problema", () => {
    expect(problemaDeArchivo({ estado: "error", motivo: null, error: "no se pudo leer", retiradoEn: null, detalle: null })).toBe("con_error");
    expect(problemaDeArchivo({ estado: "en_revision", motivo: MOTIVO_NOMBRE_NO_COINCIDE, error: null, retiradoEn: null, detalle: null })).toBe("con_error");
    expect(problemaDeArchivo({ estado: "en_revision", motivo: MOTIVO_CARPETA_SIN_SOCIEDAD, error: null, retiradoEn: null, detalle: null })).toBe("sin_sociedad");
    expect(problemaDeArchivo(leido(imagen))).toBe("imagen_no_legible");
    expect(problemaDeArchivo(leido(noCuadra))).toBe("saldo_no_cuadra");
    expect(problemaDeArchivo(leido({ ...cuadra, discrepancias: [{ tipo: "mes", mensaje: "x" }] }))).toBe("nombre_distinto");
    // no son problemas: cuadra, no verificable, sin movimientos (ya cubre), retirado
    expect(problemaDeArchivo(leido(cuadra))).toBeNull();
    expect(problemaDeArchivo(leido(noVerificable))).toBeNull();
    expect(problemaDeArchivo(leido(sinMov))).toBeNull();
    expect(problemaDeArchivo({ ...leido(imagen), retiradoEn: new Date() })).toBeNull();
    expect(problemaDeArchivo(leido(null))).toBeNull();
  });

  it("con varios problemas manda el principal: imagen, luego saldo, luego nombre", () => {
    expect(problemaDeArchivo(leido({ ...noCuadra, discrepancias: [{ tipo: "mes", mensaje: "x" }] }))).toBe("saldo_no_cuadra");
    expect(problemaDeArchivo(leido({ ...imagen, discrepancias: [{ tipo: "mes", mensaje: "x" }] }))).toBe("imagen_no_legible");
  });

  const decision = (problema: ProblemaArchivo, clave: string, huella: string | null = "hash-1") => ({ huella, datos: datosDeJustificacion({ clave, nota: null, problema }) });
  it("tiene efecto solo con la misma huella (hash) y el mismo problema", () => {
    const d = decision("saldo_no_cuadra", "saldo_difiere");
    expect(justificacionDeArchivoTieneEfecto(d, { hash: "hash-1", problema: "saldo_no_cuadra" })).toBe(true);
    expect(justificacionDeArchivoTieneEfecto(d, { hash: "hash-2", problema: "saldo_no_cuadra" })).toBe(false); // se volvió a importar con otro contenido
    expect(justificacionDeArchivoTieneEfecto(d, { hash: "hash-1", problema: "imagen_no_legible" })).toBe(false); // apareció otro tipo de problema
    expect(justificacionDeArchivoTieneEfecto(d, { hash: "hash-1", problema: null })).toBe(false); // ya no hay problema
    // un archivo sin leer (hash vacío) vale mientras siga sin leerse
    expect(justificacionDeArchivoTieneEfecto(decision("sin_sociedad", "otro", ""), { hash: "", problema: "sin_sociedad" })).toBe(true);
    expect(justificacionDeArchivoTieneEfecto(decision("sin_sociedad", "otro", null), { hash: "", problema: "sin_sociedad" })).toBe(true);
    expect(justificacionDeArchivoTieneEfecto(decision("sin_sociedad", "otro", ""), { hash: "abc", problema: "con_error" })).toBe(false);
    expect(justificacionDeArchivoTieneEfecto({ huella: "hash-1", datos: "no es json" }, { hash: "hash-1", problema: "saldo_no_cuadra" })).toBe(false);
  });

  it("solo «El banco confirma que no hubo movimientos», con efecto y en una imagen no legible, da cobertura", () => {
    const actual = { hash: "hash-1", problema: "imagen_no_legible" as ProblemaArchivo };
    expect(justificacionDaCobertura(decision("imagen_no_legible", "banco_confirma_sin_movimientos"), actual)).toBe(true);
    for (const otro of ["pedido_al_banco", "otro"]) expect(justificacionDaCobertura(decision("imagen_no_legible", otro), actual), otro).toBe(false);
    expect(justificacionDaCobertura(decision("imagen_no_legible", "banco_confirma_sin_movimientos"), { hash: "otro", problema: "imagen_no_legible" })).toBe(false);
    expect(justificacionDaCobertura(decision("imagen_no_legible", "banco_confirma_sin_movimientos"), { hash: "hash-1", problema: "saldo_no_cuadra" })).toBe(false);
    // ese motivo ni siquiera se ofrece en los demás problemas
    expect(justificacionDaCobertura(decision("saldo_no_cuadra", "banco_confirma_sin_movimientos"), { hash: "hash-1", problema: "saldo_no_cuadra" })).toBe(false);
  });
});

describe("líneas del historial: solo el periodo o el mes, nunca rutas ni cuentas", () => {
  it("vencimientos y archivos", () => {
    expect(lineaDeJustificarVencimiento("2026-10")).toEqual({ accion: "justificar", campo: "justificacion_vencimiento", antes: null, despues: "2026-10" });
    expect(lineaDeQuitarJustificacionVencimiento("2026-10")).toEqual({ accion: "quitar_justificacion", campo: "justificacion_vencimiento", antes: "2026-10", despues: null });
    expect(lineaDeJustificarArchivo("2026-10")).toEqual({ accion: "justificar", campo: "justificacion_archivo", antes: null, despues: "2026-10" });
    expect(lineaDeQuitarJustificacionArchivo("2026-10")).toEqual({ accion: "quitar_justificacion", campo: "justificacion_archivo", antes: "2026-10", despues: null });
    expect(lineaDeJustificarArchivo(null).despues).toBeNull(); // un archivo sin mes conocido
  });
});
