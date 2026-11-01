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

test("monto, moneda y cuenta solo dicen «Cambió» (no hay valores); el alta no tiene antes ni después (celda vacía)", () => {
  for (const campo of ["montoEsperado", "moneda", "cuentaEsperadaId"]) {
    assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo, antes: null, despues: null }), { tipo: "sin_valores" }, campo);
    // aunque llegara un valor, no se muestra
    assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo, antes: "123456789", despues: "USD" }), { tipo: "sin_valores" }, campo);
  }
  assert.deepEqual(f.cambioEnPalabras({ accion: "crear", campo: "obligacion", antes: null, despues: null }), { tipo: "vacio" });
  assert.equal(f.rotuloDeFila({ accion: "crear", campo: "obligacion" }), "Obligación nueva");
});

test("fecha y hora de Costa Rica; el año solo si no es el año en curso", () => {
  // 15:30 UTC = 09:30 en Costa Rica (UTC-6)
  assert.equal(f.fechaHoraDeCambio("2026-10-28T15:30:00.000Z", "2026"), "28 oct, 09:30");
  assert.equal(f.fechaHoraDeCambio("2025-12-31T15:30:00.000Z", "2026"), "31 dic 2025, 09:30");
  // 03:00 UTC del 1 de enero es todavía el 31 de diciembre en Costa Rica
  assert.equal(f.fechaHoraDeCambio("2026-01-01T03:00:00.000Z", "2026"), "31 dic 2025, 21:00");
  assert.equal(f.fechaHoraDeCambio("no es fecha", "2026"), null);
});

test("asociar y quitar un pago a mano: cada dato en su columna, sin flecha ni antes y después", () => {
  assert.equal(f.rotuloDeCampo("pago_asociado"), "Pago asociado a mano");
  assert.equal(f.rotuloDeFila({ accion: "asociar_pago", campo: "pago_asociado" }), "Pago asociado a mano");
  assert.deepEqual(f.cambioEnPalabras({ accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: "2026-10" }), { tipo: "texto", texto: "Vencimiento de oct 2026" });
  assert.equal(f.rotuloDeFila({ accion: "quitar_asociacion", campo: "pago_asociado" }), "Asociación quitada");
  assert.deepEqual(f.cambioEnPalabras({ accion: "quitar_asociacion", campo: "pago_asociado", antes: "2026-10", despues: null }), { tipo: "texto", texto: "Vencimiento de oct 2026" });
  // el rótulo de las demás filas sigue siendo el del dato
  assert.equal(f.rotuloDeFila({ accion: "editar", campo: "frecuencia" }), "Frecuencia");
  // sin periodo legible no se inventa uno
  assert.deepEqual(f.cambioEnPalabras({ accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: null }), { tipo: "vacio" });
  assert.deepEqual(f.cambioEnPalabras({ accion: "quitar_asociacion", campo: "pago_asociado", antes: "raro", despues: null }), { tipo: "vacio" });
});

test("frase del detalle: «Asociado a mano por {nombre} el {fecha}. Motivo: {motivo}.»", () => {
  // 15:30 UTC del 28 de octubre es el 28 en Costa Rica; 03:00 UTC del 1 de noviembre todavía es el 31 de octubre
  const a = { quien: "Ana Uno", cuando: "2026-10-28T15:30:00.000Z", motivo: "Se pagó con otra referencia" };
  assert.equal(f.fraseAsociadoAMano(a, "2026"), "Asociado a mano por Ana Uno el 28 oct. Motivo: Se pagó con otra referencia.");
  assert.equal(f.fraseAsociadoAMano({ ...a, cuando: "2026-11-01T03:00:00.000Z" }, "2026"), "Asociado a mano por Ana Uno el 31 oct. Motivo: Se pagó con otra referencia.");
  // el año solo si no es el año en curso
  assert.equal(f.fraseAsociadoAMano({ ...a, cuando: "2025-12-31T15:30:00.000Z" }, "2026"), "Asociado a mano por Ana Uno el 31 dic 2025. Motivo: Se pagó con otra referencia.");
  // sin punto doble si el motivo ya termina en punto
  assert.equal(f.fraseAsociadoAMano({ ...a, motivo: "Ya estaba pagado. " }, "2026"), "Asociado a mano por Ana Uno el 28 oct. Motivo: Ya estaba pagado.");
  // una fecha ilegible no rompe la frase
  assert.equal(f.fraseAsociadoAMano({ ...a, cuando: "no es fecha" }, "2026"), "Asociado a mano por Ana Uno. Motivo: Se pagó con otra referencia.");
});

test("estados que ofrecen asociar un pago", () => {
  assert.deepEqual([...f.ESTADOS_ASOCIABLES].sort(), ["por_revisar", "sin_informacion", "vencido"]);
});

test("etiquetas de un pago candidato: «Trae el número» y/o «Trae el proveedor»", () => {
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: true, traeProveedor: true }), ["Trae el número", "Trae el proveedor"]);
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: true, traeProveedor: false }), ["Trae el número"]);
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: false, traeProveedor: true }), ["Trae el proveedor"]);
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: false, traeProveedor: false }), []);
});
