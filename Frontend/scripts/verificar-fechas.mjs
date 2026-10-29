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
