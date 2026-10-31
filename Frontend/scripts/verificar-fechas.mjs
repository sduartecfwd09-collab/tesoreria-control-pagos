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
  assert.equal(f.tipoDeVacio({ desde: "2026-12-01", hasta: "2026-12-31" }, hoy, cobertura), "futuro");
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
