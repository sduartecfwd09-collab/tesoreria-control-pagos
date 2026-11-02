// Verifica la lógica pura del selector de fechas (src/lib/fechas.ts). Uso: npm run fechas (requiere Node 22.6 o superior).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as f from "../src/lib/fechas.ts";

test("formato día/mes/año: ida y vuelta, separadores y fechas inexistentes", () => {
  assert.equal(f.aTextoDMA("2026-10-05"), "05/10/2026");
  assert.equal(f.deTextoDMA("05/10/2026"), "2026-10-05");
  assert.equal(f.deTextoDMA("5-1-2026"), "2026-01-05");
  assert.equal(f.deTextoDMA(" 31.12.2026 "), "2026-12-31");
  assert.equal(f.deTextoDMA("30/02/2026"), null);
  assert.equal(f.deTextoDMA("29/02/2028"), "2028-02-29");
  assert.equal(f.deTextoDMA("29/02/2026"), null);
  assert.equal(f.deTextoDMA("2026-10-05"), null);
  assert.equal(f.deTextoDMA("5/10/26"), null);
});

test("meses: saltos a través del año y último día", () => {
  assert.equal(f.sumarMeses("2026-12", 1), "2027-01");
  assert.equal(f.sumarMeses("2026-01", -1), "2025-12");
  assert.equal(f.sumarMeses("2026-10", -22), "2024-12");
  assert.equal(f.ultimoDia("2026-02"), "2026-02-28");
  assert.equal(f.ultimoDia("2028-02"), "2028-02-29");
  assert.equal(f.ultimoDia("2026-12"), "2026-12-31");
  assert.equal(f.nombreDelPeriodo("2026-10"), "octubre 2026");
});

test("semana de lunes a domingo, también en cambio de mes y de año", () => {
  assert.deepEqual(f.semanaDe("2026-10-29"), { desde: "2026-10-26", hasta: "2026-11-01" }); // jueves
  assert.deepEqual(f.semanaDe("2026-10-26"), { desde: "2026-10-26", hasta: "2026-11-01" }); // lunes
  assert.deepEqual(f.semanaDe("2026-11-01"), { desde: "2026-10-26", hasta: "2026-11-01" }); // domingo
  assert.deepEqual(f.semanaDe("2027-01-01"), { desde: "2026-12-28", hasta: "2027-01-03" });
});

test("atajos", () => {
  const hoy = "2026-10-29";
  assert.deepEqual(f.rangoDeAtajo("hoy", hoy), { desde: hoy, hasta: hoy });
  assert.deepEqual(f.rangoDeAtajo("mes", hoy), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(f.rangoDeAtajo("mes_anterior", hoy), { desde: "2026-09-01", hasta: "2026-09-30" });
  assert.deepEqual(f.rangoDeAtajo("mes_anterior", "2026-01-15"), { desde: "2025-12-01", hasta: "2025-12-31" });
  assert.deepEqual(f.rangoDeAtajo("ultimos_3_meses", hoy), { desde: "2026-08-01", hasta: "2026-10-31" });
  assert.deepEqual(f.rangoDeAtajo("ultimos_3_meses", "2026-02-10"), { desde: "2025-12-01", hasta: "2026-02-28" });
  assert.deepEqual(f.rangoDeAtajo("ultimos_12_meses", hoy), { desde: "2025-11-01", hasta: hoy });
  assert.deepEqual(f.rangoDeAtajo("ultimos_12_meses", "2026-01-15"), { desde: "2025-02-01", hasta: "2026-01-15" });
  assert.deepEqual(f.recortarRango(f.rangoDeAtajo("mes", hoy), { limites: { primera: "2021-10-01", ultima: hoy } }), { desde: "2026-10-01", hasta: hoy }); // el pasado se recorta a hoy
  assert.deepEqual(f.rangoDeAtajo("anio", hoy), { desde: "2026-01-01", hasta: "2026-12-31" });
});

test("recortar: al mes (la semana que cruza de mes se recorta) y a los límites", () => {
  const semana = f.semanaDe("2026-10-29");
  assert.deepEqual(f.recortarRango(semana, { mes: "2026-10" }), { desde: "2026-10-26", hasta: "2026-10-31" });
  assert.deepEqual(f.recortarRango(semana, { mes: "2026-11" }), { desde: "2026-11-01", hasta: "2026-11-01" });
  assert.equal(f.recortarRango(semana, { mes: "2026-09" }), null);
  const limites = { primera: "2026-03-10", ultima: "2026-10-15" };
  assert.deepEqual(f.recortarRango({ desde: "2026-01-01", hasta: "2026-12-31" }, { limites }), { desde: "2026-03-10", hasta: "2026-10-15" });
  assert.equal(f.recortarRango({ desde: "2027-01-01", hasta: "2027-02-01" }, { limites }), null);
});

test("validar: desde <= hasta, dentro de los límites y del mes", () => {
  const limites = { primera: "2026-03-10", ultima: "2026-10-31" };
  assert.equal(f.validarRango({ desde: "2026-10-01", hasta: "2026-10-31" }, { limites, mes: "2026-10" }), null);
  assert.equal(f.validarRango({ desde: "2026-10-01", hasta: "2026-10-01" }, { limites }), null);
  assert.match(f.validarRango({ desde: "2026-10-10", hasta: "2026-10-09" }), /no puede ser posterior/);
  assert.match(f.validarRango({ desde: "2026-09-30", hasta: "2026-10-05" }, { mes: "2026-10" }), /dentro de octubre 2026/);
  assert.match(f.validarRango({ desde: "2026-02-01", hasta: "2026-05-01" }, { limites }), /10\/03\/2026 y 31\/10\/2026/);
  assert.match(f.validarRango({ desde: "", hasta: "2026-05-01" }), /día\/mes\/año/);
});

test("meses dentro de los límites", () => {
  const limites = { primera: "2026-03-10", ultima: "2026-10-15" };
  assert.equal(f.mesDentroDeLimites("2026-03", limites), true);
  assert.equal(f.mesDentroDeLimites("2026-02", limites), false);
  assert.equal(f.mesDentroDeLimites("2026-10", limites), true);
  assert.equal(f.mesDentroDeLimites("2026-11", limites), false);
  assert.equal(f.mesDentroDeLimites("2030-01", null), true);
});

test("texto «entre … y …»", () => {
  assert.equal(f.textoEntre({ desde: "2026-10-01", hasta: "2026-10-31" }), "01/10/2026 y 31/10/2026");
});

test("qué decir cuando un período no tiene filas", () => {
  const cobertura = { primera: "2026-03-10", ultima: "2026-09-30" };
  const hoy = "2026-10-29";
  assert.equal(f.tipoDeVacio({ desde: "2026-12-01", hasta: "2026-12-31" }, hoy, cobertura), "normal"); // un mes futuro sin filas no es «sin información»
  assert.equal(f.tipoDeVacio({ desde: "2025-01-01", hasta: "2025-01-31" }, hoy, cobertura), "sin_informacion");
  assert.equal(f.tipoDeVacio({ desde: "2026-10-01", hasta: "2026-10-31" }, hoy, cobertura), "sin_informacion"); // octubre: aún sin estados
  assert.equal(f.tipoDeVacio({ desde: "2026-05-01", hasta: "2026-05-31" }, hoy, cobertura), "normal");
  assert.equal(f.tipoDeVacio({ desde: "2026-05-01", hasta: "2026-05-31" }, hoy, null), "sin_informacion");
  assert.equal(f.tipoDeVacio({ desde: hoy, hasta: "2026-11-30" }, hoy, cobertura), "sin_informacion"); // empieza hoy: no es futuro
});

test("frases de Mi configuración", () => {
  const pago = "2026-10-20";
  assert.equal(f.fraseDeAviso(3, pago), "Con 3 días de aviso, un pago que vence el 20 aparece en Avisos desde el 17.");
  assert.equal(f.fraseDeAviso(1, pago), "Con 1 día de aviso, un pago que vence el 20 aparece en Avisos desde el 19.");
  assert.equal(f.fraseDeAviso(0, pago), "Con 0 días de aviso, un pago que vence el 20 aparece en Avisos desde el 20.");
  assert.equal(f.fraseDeAviso(60, pago), "Con 60 días de aviso, un pago que vence el 20 aparece en Avisos desde el 21 de agosto.");
  assert.equal(f.fraseDeEspera(3, pago), "Si el pago del 20 no aparece en el banco, se espera hasta el 23 y desde el 24 se marca Vencido.");
  assert.equal(f.fraseDeEspera(0, pago), "Si el pago del 20 no aparece en el banco, desde el 21 se marca Vencido.");
  assert.equal(f.fraseDeEspera(15, pago), "Si el pago del 20 no aparece en el banco, se espera hasta el 4 de noviembre y desde el 5 de noviembre se marca Vencido.");
  assert.equal(f.fraseDeEspera(11, "2026-12-20"), "Si el pago del 20 no aparece en el banco, se espera hasta el 31 y desde el 1 de enero se marca Vencido.");
});

test("opciones del período: solo las válidas, recortadas a lo que se puede elegir", () => {
  const ids = ["ultimos_12_meses", "mes", "mes_anterior", "ultimos_3_meses", "anio"];
  const textos = (l) => l.map((o) => o.texto);
  // Histórico: el tope es hoy, así que «Este mes» y «Este año» terminan hoy
  const historico = f.opcionesDePeriodo(ids, "2026-10-27", { primera: "2021-10-01", ultima: "2026-10-27" });
  assert.deepEqual(textos(historico), ["Últimos 12 meses", "Este mes", "Mes anterior", "Últimos 3 meses", "Este año", "Elegir fechas"]);
  assert.deepEqual(historico[1].rango, { desde: "2026-10-01", hasta: "2026-10-27" });
  assert.deepEqual(historico[0].rango, { desde: "2025-11-01", hasta: "2026-10-27" });
  // con una ventana que no llega al mes anterior, esa opción no se ofrece (nunca queda una opción que dé error)
  const corta = f.opcionesDePeriodo(ids, "2026-10-27", { primera: "2026-10-01", ultima: "2026-10-27" });
  assert.equal(textos(corta).includes("Mes anterior"), false);
  assert.ok(corta.every((o) => o.id === "elegir" || o.rango));
  // «Todas las fechas» solo si se pide y va primero, sin rango
  const conTodo = f.opcionesDePeriodo(ids, "2026-10-27", null, true);
  assert.deepEqual(conTodo[0], { id: "todo", texto: "Todas las fechas", rango: null });
});

test("opciones de Pagos del mes: Hoy y Esta semana solo en el mes actual", () => {
  const actual = f.opcionesDelMes("2026-10", "2026-10-31");
  assert.deepEqual(actual.map((o) => o.texto), ["Todo el mes", "Hoy", "Esta semana", "Elegir fechas"]);
  assert.deepEqual(actual[2].rango, { desde: "2026-10-26", hasta: "2026-10-31" }); // la semana llega al 1 de nov: se recorta al mes
  assert.deepEqual(f.opcionesDelMes("2026-09", "2026-10-31").map((o) => o.texto), ["Todo el mes", "Elegir fechas"]);
  assert.deepEqual(f.opcionesDelMes("2026-11", "2026-10-31").map((o) => o.texto), ["Todo el mes", "Elegir fechas"]);
});

test("límites de navegación: la ventana del servidor, y el Histórico cerrado en hoy", () => {
  const r = { hoy: "2026-10-27", ventana: { primera: "2021-10-01", ultima: "2027-10-31" } };
  assert.deepEqual(f.limitesDeNavegacion(r), { primera: "2021-10-01", ultima: "2027-10-31" });
  assert.deepEqual(f.limitesDeNavegacion(r, true), { primera: "2021-10-01", ultima: "2026-10-27" });
});

test("columnas de fecha: el año solo si no es del año en curso", async () => {
  const fmt = await import("../src/lib/formato.ts");
  fmt.fijarAnioEnCurso("2026-10-31");
  assert.equal(fmt.nombreFecha("2026-10-20"), "20 oct");
  assert.equal(fmt.nombreFecha("2025-10-20"), "20 oct 2025");
  assert.equal(fmt.nombreFecha("2027-01-05"), "5 ene 2027");
  fmt.fijarAnioEnCurso("2027-01-02");
  assert.equal(fmt.nombreFecha("2026-10-20"), "20 oct 2026");
  assert.equal(fmt.nombreFecha("2027-01-05"), "5 ene");
});

// --- Fechas escritas a mano en «Elegir fechas» ---
const LIM = { primera: "2021-11-01", ultima: "2026-11-01" }; // Historial: el máximo es hoy (el día de Costa Rica que informa el servidor)

test("fechas escritas: se aplican en cuanto las dos están completas y válidas, sin Enter", () => {
  const e = (d, h) => f.evaluarFechasEscritas(d, h, { limites: LIM });
  // mientras se escribe el año de «Hasta» no es una fecha: no se aplica
  for (const h of ["", "1", "15/1", "15/10/", "15/10/20", "15/10/202"]) assert.notEqual(e("01/10/2026", h).estado, "valido", h);
  // al completar el año, ya es válido
  assert.deepEqual(e("01/10/2026", "15/10/2026"), { estado: "valido", rango: { desde: "2026-10-01", hasta: "2026-10-15" } });
  // día y mes de uno o dos dígitos
  assert.equal(e("1/10/2026", "5/10/2026").estado, "valido");
});

test("fechas escritas: vacío, incompleto y los mensajes de siempre", () => {
  const e = (d, h) => f.evaluarFechasEscritas(d, h, { limites: LIM });
  assert.deepEqual(e("", ""), { estado: "vacio" });
  assert.deepEqual(e("01/10/2026", ""), { estado: "incompleto", mensaje: "Complete «Desde» y «Hasta»." });
  assert.deepEqual(e("", "01/10/2026"), { estado: "incompleto", mensaje: "Complete «Desde» y «Hasta»." });
  assert.equal(e("30/02/2026", "01/10/2026").mensaje, "Escriba las fechas como día/mes/año, por ejemplo 15/10/2026.");
  assert.equal(e("20/10/2026", "01/10/2026").mensaje, "«Desde» no puede ser posterior a «Hasta».");
});

test("fechas escritas: lo escrito a mano se valida contra los mismos límites que el calendario (hoy como máximo)", () => {
  const e = (d, h) => f.evaluarFechasEscritas(d, h, { limites: LIM });
  const fuera = "Elija fechas entre 01/11/2021 y 01/11/2026.";
  // hoy es 01/11/2026: mañana (02/11) se rechaza, también cuando falta la otra fecha
  assert.deepEqual(e("02/11/2026", "02/11/2026"), { estado: "invalido", mensaje: fuera });
  assert.deepEqual(e("02/11/2026", ""), { estado: "invalido", mensaje: fuera });
  assert.deepEqual(e("", "02/11/2026"), { estado: "invalido", mensaje: fuera });
  assert.equal(e("01/10/2026", "02/11/2026").mensaje, fuera);
  // hoy sí; el mínimo también
  assert.equal(e("01/11/2026", "01/11/2026").estado, "valido");
  assert.equal(e("31/10/2021", "01/11/2026").mensaje, fuera);
  assert.equal(e("01/11/2021", "01/11/2021").estado, "valido");
  // sin límites (no se conoce la ventana) solo cuenta que sean fechas reales
  assert.equal(f.evaluarFechasEscritas("02/11/2099", "03/11/2099").estado, "valido");
  // dentro de un mes (Pagos del mes) las fechas deben ser de ese mes
  assert.equal(f.evaluarFechasEscritas("01/10/2026", "05/11/2026", { mes: "2026-10" }).mensaje, "Las fechas deben estar dentro de octubre 2026.");
});

test("el mensaje solo se muestra después de salir del campo o de intentar aplicar, nunca mientras se escribe", () => {
  const incompleto = f.evaluarFechasEscritas("01/10/2026", "", { limites: LIM });
  assert.equal(f.mensajeDeFechas(incompleto, false), null);
  assert.equal(f.mensajeDeFechas(incompleto, true), "Complete «Desde» y «Hasta».");
  const valido = f.evaluarFechasEscritas("01/10/2026", "02/10/2026", { limites: LIM });
  assert.equal(f.mensajeDeFechas(valido, true), null);
  assert.equal(f.mensajeDeFechas(f.evaluarFechasEscritas("", ""), true), null);
});

test("límites del Historial: la ventana cerrada en hoy; sin cortar, la ventana completa", () => {
  const r = { hoy: "2026-11-01", ventana: { primera: "2021-11-01", ultima: "2027-11-30" } };
  assert.deepEqual(f.limitesDeNavegacion(r, true), { primera: "2021-11-01", ultima: "2026-11-01" });
  assert.deepEqual(f.limitesDeNavegacion(r), { primera: "2021-11-01", ultima: "2027-11-30" });
});

test("una sola fecha escrita («Nueva fecha»): vacía, mal escrita, fuera del rango y válida; los extremos se incluyen", () => {
  const rango = { minimo: "2026-08-16", maximo: "2026-12-14" };
  assert.equal(f.evaluarFechaEscrita("", rango).estado, "vacio");
  assert.equal(f.evaluarFechaEscrita("   ", rango).estado, "vacio");
  for (const t of ["2026-10-15", "30/02/2026", "5/10/26", "abc"]) {
    const r = f.evaluarFechaEscrita(t, rango);
    assert.equal(r.estado, "invalido", t);
    assert.equal(r.mensaje, "Escriba la fecha como día/mes/año, por ejemplo 15/10/2026.", t);
  }
  assert.deepEqual(f.evaluarFechaEscrita("22/10/2026", rango), { estado: "valido", fecha: "2026-10-22" });
  assert.deepEqual(f.evaluarFechaEscrita("16/08/2026", rango), { estado: "valido", fecha: "2026-08-16" });
  assert.deepEqual(f.evaluarFechaEscrita("14/12/2026", rango), { estado: "valido", fecha: "2026-12-14" });
  for (const t of ["15/08/2026", "15/12/2026"]) {
    const r = f.evaluarFechaEscrita(t, rango);
    assert.equal(r.estado, "invalido", t);
    assert.equal(r.mensaje, "Elija una fecha entre el 16/08/2026 y el 14/12/2026.", t);
  }
  // sin límites cualquier fecha real vale
  assert.deepEqual(f.evaluarFechaEscrita("1/1/2030"), { estado: "valido", fecha: "2030-01-01" });
});
