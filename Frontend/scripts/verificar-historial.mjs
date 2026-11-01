// Verifica los nombres de negocio y los valores en palabras del Historial de cambios (src/lib/formato.ts). Uso: npm run historial (Node 22.6 o superior).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as f from "../src/lib/formato.ts";

test("«Frecuencia confirmada» invierte el valor guardado: sin confirmar = No, confirmada = Sí", () => {
  assert.equal(f.rotuloDeCampo("frecuenciaPorConfirmar"), "Frecuencia confirmada");
  // lo guardado es «por confirmar»: verdadero = sin confirmar
  assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo: "frecuenciaPorConfirmar", antes: "sin confirmar", despues: "confirmada" }), { tipo: "valores", antes: "No", despues: "Sí" });
  assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo: "frecuenciaPorConfirmar", antes: "confirmada", despues: "sin confirmar" }), { tipo: "valores", antes: "Sí", despues: "No" });
  // también si el valor llegara como booleano en texto
  assert.equal(f.valorEnPalabras("frecuenciaPorConfirmar", "true"), "No");
  assert.equal(f.valorEnPalabras("frecuenciaPorConfirmar", "false"), "Sí");
});

test("nombres de negocio de «Qué cambió»", () => {
  const esperado = {
    frecuencia: "Frecuencia", mesArranque: "Mes de arranque", diaEsperadoPago: "Día de pago", activa: "Obligación activa", controlDesde: "Control desde",
    montoEsperado: "Monto esperado", moneda: "Moneda", cuentaEsperadaId: "Cuenta de pago",
  };
  for (const [campo, rotulo] of Object.entries(esperado)) assert.equal(f.rotuloDeCampo(campo), rotulo, campo);
  // un dato desconocido no muestra el nombre técnico
  assert.equal(f.rotuloDeCampo("campoRaro"), "Otro dato");
});

test("valores en palabras: Sí/No, frecuencias, meses y día", () => {
  assert.equal(f.valorEnPalabras("activa", "activa"), "Sí");
  assert.equal(f.valorEnPalabras("activa", "inactiva"), "No");
  assert.equal(f.valorEnPalabras("frecuencia", "bimestral"), "Bimestral");
  assert.equal(f.valorEnPalabras("frecuencia", "raro"), "Otro valor");
  assert.equal(f.valorEnPalabras("mesArranque", "3"), "Marzo");
  assert.equal(f.valorEnPalabras("mesArranque", null), "Sin definir");
  assert.equal(f.valorEnPalabras("diaEsperadoPago", "15"), "día 15");
  assert.equal(f.valorEnPalabras("diaEsperadoPago", null), "Sin día");
  assert.equal(f.valorEnPalabras("controlDesde", "2026-10"), "oct 2026");
  assert.equal(f.valorEnPalabras("controlDesde", null), "Sin definir");
  assert.deepEqual(f.cambioEnPalabras({ accion: "desactivar", campo: "activa", antes: "activa", despues: "inactiva" }), { tipo: "valores", antes: "Sí", despues: "No" });
});

test("monto, moneda y cuenta solo dicen «Cambió» (no hay valores); el alta es una frase sin antes ni después", () => {
  for (const campo of ["montoEsperado", "moneda", "cuentaEsperadaId"]) {
    assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo, antes: null, despues: null }), { tipo: "sin_valores" }, campo);
    // aunque llegara un valor, no se muestra
    assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo, antes: "123456789", despues: "USD" }), { tipo: "sin_valores" }, campo);
  }
  assert.deepEqual(f.cambioEnPalabras({ accion: "crear", campo: "obligacion", antes: null, despues: null }), { tipo: "alta" });
});

test("fecha y hora de Costa Rica; el año solo si no es el año en curso", () => {
  // 15:30 UTC = 09:30 en Costa Rica (UTC-6)
  assert.equal(f.fechaHoraDeCambio("2026-10-28T15:30:00.000Z", "2026"), "28 oct, 09:30");
  assert.equal(f.fechaHoraDeCambio("2025-12-31T15:30:00.000Z", "2026"), "31 dic 2025, 09:30");
  // 03:00 UTC del 1 de enero es todavía el 31 de diciembre en Costa Rica
  assert.equal(f.fechaHoraDeCambio("2026-01-01T03:00:00.000Z", "2026"), "31 dic 2025, 21:00");
  assert.equal(f.fechaHoraDeCambio("no es fecha", "2026"), null);
});
