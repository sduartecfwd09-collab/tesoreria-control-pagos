import { describe, expect, it } from "vitest";
import { calidadCatalogo, estadoDeObligacion, etiquetasDe, identificadoresRepetidos, type ObligacionCalidad } from "../src/domain/obligaciones.js";
import { claveUnicaRevision, datosDeHuella, huellaActual, huellaDeRevision, revisionConEfecto, revisionesConEfecto } from "../src/domain/revision.js";
import { claveObligacionPeriodo } from "../src/domain/asociacion.js";
import { claveUnicaJustificacionArchivo, claveUnicaJustificacionVencimiento } from "../src/domain/justificacion.js";
import { lineaDeMarcarRevisada, lineaDeQuitarRevision } from "../src/domain/historial.js";

// «Revisada»: huella, efecto, estado y conteos. Reglas puras con datos inventados.
const ob = (id: number, parcial: Partial<ObligacionCalidad> = {}): ObligacionCalidad => ({
  id, sociedad: "Sociedad AAA", proveedor: `Prov${id}`, identificador: `100000${id}`, activa: true, frecuencia: "mensual", frecuenciaPorConfirmar: false, mesArranque: null,
  diaEsperadoPago: 10, montoEsperado: null, monedaPorConfirmar: false, cuentaEsperadaId: null, responsable: null, ...parcial,
});
const repetidosDe = (obs: ObligacionCalidad[]) => identificadoresRepetidos(obs);
const huella = (o: ObligacionCalidad, obs: ObligacionCalidad[] = [o]) => huellaActual(o, repetidosDe(obs));

describe("la huella de una revisión", () => {
  it("una obligación sin causas no tiene huella; con causas, un SHA-256 de 64 caracteres", () => {
    expect(huella(ob(1))).toBeNull();
    expect(huella(ob(1, { activa: false, diaEsperadoPago: null }))).toBeNull(); // inactiva: no está en revisión
    const h = huella(ob(1, { diaEsperadoPago: null }))!;
    expect(h.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(h.causas.map((c) => c.codigo)).toEqual(["falta_dia"]);
  });

  it("cambia si cambian los datos relevantes o la causa", () => {
    const base = ob(1, { diaEsperadoPago: null });
    const h0 = huella(base)!.huella;
    expect(huella({ ...base })!.huella).toBe(h0); // lo mismo, igual
    // cambia la causa (aparece otra)
    expect(huella({ ...base, identificador: "CR05015202001026284066" })!.huella).not.toBe(h0);
    // cambian el día, la frecuencia o el mes de arranque (cuando la causa sigue)
    const conMes = ob(2, { frecuencia: "anual", mesArranque: null, diaEsperadoPago: 5 });
    const h1 = huella(conMes)!.huella;
    expect(huella({ ...conMes, diaEsperadoPago: 6 })!.huella).not.toBe(h1);
    expect(huella({ ...conMes, frecuencia: "semestral" })!.huella).not.toBe(h1);
    // cambia el identificador o el proveedor
    expect(huella({ ...base, proveedor: "Otro proveedor" })!.huella).not.toBe(h0);
    expect(huella({ ...base, identificador: "9999999" })!.huella).not.toBe(h0);
  });

  it("no cambia por lo que no es relevante: monto, cuenta, moneda, «Control desde», activa, mayúsculas del proveedor y ceros del identificador", () => {
    const base = ob(1, { diaEsperadoPago: null });
    const h0 = huella(base)!.huella;
    for (const cambio of [{ montoEsperado: 12345 }, { cuentaEsperadaId: 7 }, { monedaPorConfirmar: true }, { frecuenciaPorConfirmar: true }, { proveedor: "PROV1" }, { identificador: "0001000001" }, { responsable: "Ana" }]) {
      expect(huella({ ...base, ...cambio })?.huella, JSON.stringify(cambio)).toBe(h0);
    }
  });

  it("identificador repetido: la huella incluye a los otros proveedores del grupo (si aparece uno nuevo, cambia)", () => {
    const a = ob(1, { identificador: "555", proveedor: "Luz" });
    const b = ob(2, { identificador: "555", proveedor: "Agua" });
    const h2 = huella(a, [a, b])!;
    expect(h2.causas.map((c) => c.codigo)).toEqual(["id_repetido"]);
    const c3 = ob(3, { identificador: "555", proveedor: "Gas" });
    expect(huella(a, [a, b, c3])!.huella).not.toBe(h2.huella);
    // el orden de llegada no importa
    expect(huella(a, [b, a])!.huella).toBe(h2.huella);
    expect(datosDeHuella(a, h2.causas, repetidosDe([a, b])).otrosProveedores).toEqual(["agua"]);
  });

  it("huellaDeRevision depende del contenido y no del orden de las causas", () => {
    const d = { causas: ["falta_dia", "formato_iban"], dia: null, frecuencia: "mensual", mesArranque: null, identificador: "X", proveedor: "p", otrosProveedores: [] };
    expect(huellaDeRevision(d)).toBe(huellaDeRevision({ ...d }));
    expect(huellaDeRevision(d)).not.toBe(huellaDeRevision({ ...d, dia: 5 }));
  });
});

describe("estado «Revisada» y sus conteos", () => {
  it("revisada solo si hay observaciones Y la revisión tiene efecto; sin la marca, el estado de siempre", () => {
    const causas = etiquetasDe(ob(1, { diaEsperadoPago: null }), []);
    expect(estadoDeObligacion(true, causas)).toBe("en_revision");
    expect(estadoDeObligacion(true, causas, false)).toBe("en_revision");
    expect(estadoDeObligacion(true, causas, true)).toBe("revisada");
    expect(estadoDeObligacion(true, [], true)).toBe("activa"); // sin causas no hay nada que revisar
    expect(estadoDeObligacion(false, causas, true)).toBe("inactiva");
    expect(estadoDeObligacion(true, [])).toBe("activa");
  });

  it("revisionConEfecto compara la huella; sin decisión o sin causas no tiene efecto", () => {
    expect(revisionConEfecto({ huella: "a" }, { huella: "a" })).toBe(true);
    expect(revisionConEfecto({ huella: "a" }, { huella: "b" })).toBe(false);
    expect(revisionConEfecto({ huella: "a" }, null)).toBe(false);
    expect(revisionConEfecto(null, { huella: "a" })).toBe(false);
    expect(revisionConEfecto({ huella: null }, { huella: "a" })).toBe(false);
  });

  const sociedades = [{ nombre: "Sociedad AAA", conEstados: true }];
  const catalogo = [
    ob(1, { diaEsperadoPago: null }),
    ob(2, { diaEsperadoPago: null }),
    ob(3, { frecuencia: "anual", mesArranque: null }),
    ob(4, { identificador: "CR05015202001026284066" }),
    ob(5, { identificador: "777", proveedor: "Luz" }),
    ob(6, { identificador: "777", proveedor: "Agua" }),
    ob(7),
  ];
  const decisiones = (ids: number[]) => new Map(ids.map((id) => [id, { huella: huellaActual(catalogo.find((o) => o.id === id)!, repetidosDe(catalogo))!.huella }]));

  it("«Falta día» y «Falta mes de arranque» SIGUEN contando el dato faltante aunque esté revisada; se informan aparte las revisadas", () => {
    const revisadas = revisionesConEfecto(catalogo, repetidosDe(catalogo), decisiones([1, 3]));
    expect([...revisadas].sort()).toEqual([1, 3]);
    const c = calidadCatalogo(catalogo, sociedades, revisadas);
    expect(c.sinDia).toBe(2);
    expect(c.sinDiaRevisadas).toBe(1);
    expect(c.sinMesArranque).toBe(1);
    expect(c.sinMesArranqueRevisadas).toBe(1);
  });

  it("«Identificador repetido» y «Formato de IBAN» sí dejan de contar a las revisadas; un grupo desaparece solo si todas sus obligaciones lo están", () => {
    const r = (ids: number[]) => calidadCatalogo(catalogo, sociedades, revisionesConEfecto(catalogo, repetidosDe(catalogo), decisiones(ids)));
    expect(r([]).formatoIban.map((x) => x.id)).toEqual([4]);
    expect(r([4]).formatoIban).toEqual([]);
    expect(r([]).identificadoresRepetidos).toHaveLength(1);
    expect(r([5]).identificadoresRepetidos).toHaveLength(1); // falta la otra
    expect(r([5, 6]).identificadoresRepetidos).toHaveLength(0);
  });

  it("SIN revisiones el resultado es idéntico al de siempre (sin el tercer argumento, con un conjunto vacío)", () => {
    const sin = calidadCatalogo(catalogo, sociedades);
    expect(calidadCatalogo(catalogo, sociedades, new Set())).toEqual(sin);
    const { sinDiaRevisadas, sinMesArranqueRevisadas, ...antiguo } = sin;
    expect([sinDiaRevisadas, sinMesArranqueRevisadas]).toEqual([0, 0]);
    expect(antiguo).toMatchObject({ activas: 7, sinDia: 2, sinMesArranque: 1 });
    expect(antiguo.formatoIban).toHaveLength(1);
    expect(antiguo.identificadoresRepetidos).toHaveLength(1);
  });
});

describe("claves y líneas", () => {
  it("la clave única de la revisión («r|») no choca con las de justificaciones ni asociaciones", () => {
    expect(claveUnicaRevision(7)).toBe("r|7");
    const otras = [claveUnicaJustificacionVencimiento(7, "2026-10"), claveUnicaJustificacionArchivo(7), claveObligacionPeriodo(7, "2026-10")];
    for (const o of otras) expect(o).not.toBe("r|7");
    expect(claveUnicaRevision(2_000_000_000).length).toBeLessThanOrEqual(60);
  });

  it("líneas del historial: solo el estado, nunca datos de la obligación", () => {
    expect(lineaDeMarcarRevisada()).toEqual({ accion: "marcar_revisada", campo: "revision_obligacion", antes: "en_revision", despues: "revisada" });
    expect(lineaDeQuitarRevision()).toEqual({ accion: "quitar_revision", campo: "revision_obligacion", antes: "revisada", despues: "en_revision" });
  });
});
