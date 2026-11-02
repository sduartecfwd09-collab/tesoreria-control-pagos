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

test("asociar y quitar un pago a mano: el vencimiento va en «Qué cambió» y «Antes → Después» es Sin asociar / Asociado a mano", () => {
  const asociar = { accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: "2026-10" };
  const quitar = { accion: "quitar_asociacion", campo: "pago_asociado", antes: "2026-10", despues: null };
  assert.equal(f.rotuloDeFila(asociar), "Pago del vencimiento de oct 2026"); // el mes sale de «después»
  assert.deepEqual(f.cambioEnPalabras(asociar), { tipo: "valores", antes: "Sin asociar", despues: "Asociado a mano" });
  assert.equal(f.rotuloDeFila(quitar), "Pago del vencimiento de oct 2026"); // el mes sale de «antes»
  assert.deepEqual(f.cambioEnPalabras(quitar), { tipo: "valores", antes: "Asociado a mano", despues: "Sin asociar" });
  // el rótulo de las demás filas sigue siendo el del dato
  assert.equal(f.rotuloDeFila({ accion: "editar", campo: "frecuencia", antes: "mensual", despues: "anual" }), "Frecuencia");
  assert.equal(f.rotuloDeFila({ accion: "crear", campo: "obligacion", antes: null, despues: null }), "Obligación nueva");
});

test("período ilegible: «Pago del vencimiento» sin mes, nunca una celda rota; la flecha solo con dos valores", () => {
  for (const periodo of [null, "", "raro", "2026-1", "2026-10-01"]) {
    assert.equal(f.rotuloDeFila({ accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: periodo }), "Pago del vencimiento", String(periodo));
    assert.equal(f.rotuloDeFila({ accion: "quitar_asociacion", campo: "pago_asociado", antes: periodo, despues: null }), "Pago del vencimiento", String(periodo));
  }
  // aun así hay dos valores (el antes y el después de la asociación): la flecha nunca queda sola
  assert.equal(f.cambioEnPalabras({ accion: "asociar_pago", campo: "pago_asociado", antes: null, despues: null }).tipo, "valores");
  // los tipos que no tienen dos valores no dibujan flecha: el alta queda vacía y monto/moneda/cuenta dicen «Cambió»
  assert.deepEqual(f.cambioEnPalabras({ accion: "crear", campo: "obligacion", antes: null, despues: null }), { tipo: "vacio" });
  assert.deepEqual(f.cambioEnPalabras({ accion: "editar", campo: "moneda", antes: null, despues: null }), { tipo: "sin_valores" });
  const tipos = ["vacio", "sin_valores", "valores"];
  for (const campo of Object.keys({ frecuencia: 1, activa: 1, mesArranque: 1, obligacion: 1, pago_asociado: 1, montoEsperado: 1 })) {
    for (const accion of ["editar", "crear", "asociar_pago", "quitar_asociacion"]) {
      const c = f.cambioEnPalabras({ accion, campo, antes: null, despues: null });
      assert.ok(tipos.includes(c.tipo), accion + campo);
      if (c.tipo === "valores") assert.ok(c.antes !== "" && c.despues !== "", accion + campo); // nunca un lado vacío con flecha
    }
  }
});

test("filtro «Qué cambió»: dos grupos, un único mapa campo -> grupo, y un grupo sin opciones no se muestra", () => {
  assert.equal(f.rotuloDeCampo("pago_asociado"), "Pago del vencimiento");
  assert.deepEqual(f.GRUPOS_DE_CAMPOS.map((g) => g.titulo), ["Datos de la obligación", "Decisiones manuales"]);
  // con todo lo que hay: cada campo en su grupo y en el orden del mapa (no el de llegada)
  const todo = ["revision_obligacion", "justificacion_archivo", "justificacion_vencimiento", "pago_asociado", "obligacion", "cuentaEsperadaId", "frecuencia", "activa", "mesArranque", "diaEsperadoPago", "frecuenciaPorConfirmar", "controlDesde", "montoEsperado", "moneda"];
  assert.deepEqual(f.agruparCampos(todo), [
    { titulo: "Datos de la obligación", campos: ["frecuencia", "frecuenciaPorConfirmar", "mesArranque", "diaEsperadoPago", "activa", "controlDesde", "montoEsperado", "moneda", "cuentaEsperadaId", "obligacion"] },
    { titulo: "Decisiones manuales", campos: ["pago_asociado", "justificacion_vencimiento", "justificacion_archivo", "revision_obligacion"] },
  ]);
  // un grupo sin opciones dentro del alcance no se muestra; si solo hay uno, se muestra con su título
  assert.deepEqual(f.agruparCampos(["frecuencia", "activa"]), [{ titulo: "Datos de la obligación", campos: ["frecuencia", "activa"] }]);
  assert.deepEqual(f.agruparCampos(["pago_asociado"]), [{ titulo: "Decisiones manuales", campos: ["pago_asociado"] }]);
  assert.deepEqual(f.agruparCampos([]), []);
  // un campo desconocido no se pierde: va al final del primer grupo
  assert.deepEqual(f.agruparCampos(["campoRaro", "frecuencia"]), [{ titulo: "Datos de la obligación", campos: ["frecuencia", "campoRaro"] }]);
  // todos los rótulos del filtro existen (ningún «Otro dato» entre los campos conocidos)
  for (const g of f.GRUPOS_DE_CAMPOS) for (const c of g.campos) assert.notEqual(f.rotuloDeCampo(c), "Otro dato", c);
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
  // «justificado» viene de un vencido o sin información: la asociación gana
  assert.deepEqual([...f.ESTADOS_ASOCIABLES].sort(), ["justificado", "por_revisar", "sin_informacion", "vencido"]);
  assert.deepEqual([...f.ESTADOS_JUSTIFICABLES].sort(), ["sin_informacion", "vencido"]);
});

test("etiquetas de un pago candidato: «Trae el número» y/o «Trae el proveedor»", () => {
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: true, traeProveedor: true }), ["Trae el número", "Trae el proveedor"]);
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: true, traeProveedor: false }), ["Trae el número"]);
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: false, traeProveedor: true }), ["Trae el proveedor"]);
  assert.deepEqual(f.etiquetasDeCandidato({ traeNumero: false, traeProveedor: false }), []);
});

test("justificar un vencimiento: «Justificación del vencimiento de {mes}» y «Sin justificar → Justificado» (a la inversa al quitar)", () => {
  const justificar = { accion: "justificar", campo: "justificacion_vencimiento", antes: null, despues: "2026-10" };
  const quitar = { accion: "quitar_justificacion", campo: "justificacion_vencimiento", antes: "2026-10", despues: null };
  assert.equal(f.rotuloDeFila(justificar), "Justificación del vencimiento de oct 2026"); // el mes sale de «después»
  assert.deepEqual(f.cambioEnPalabras(justificar), { tipo: "valores", antes: "Sin justificar", despues: "Justificado" });
  assert.equal(f.rotuloDeFila(quitar), "Justificación del vencimiento de oct 2026"); // el mes sale de «antes»
  assert.deepEqual(f.cambioEnPalabras(quitar), { tipo: "valores", antes: "Justificado", despues: "Sin justificar" });
  // período ilegible: sin mes, nunca una celda rota
  for (const periodo of [null, "", "raro", "2026-1"]) {
    assert.equal(f.rotuloDeFila({ ...justificar, despues: periodo }), "Justificación del vencimiento", String(periodo));
    assert.equal(f.rotuloDeFila({ ...quitar, antes: periodo }), "Justificación del vencimiento", String(periodo));
  }
});

test("justificar un archivo: «Justificación del archivo» (sin mes) y «Sin justificar → Justificado»; la flecha nunca queda sola", () => {
  const justificar = { accion: "justificar", campo: "justificacion_archivo", antes: null, despues: "2026-10" };
  const quitar = { accion: "quitar_justificacion", campo: "justificacion_archivo", antes: "2026-10", despues: null };
  assert.equal(f.rotuloDeFila(justificar), "Justificación del archivo");
  assert.equal(f.rotuloDeFila(quitar), "Justificación del archivo");
  assert.deepEqual(f.cambioEnPalabras(justificar), { tipo: "valores", antes: "Sin justificar", despues: "Justificado" });
  assert.deepEqual(f.cambioEnPalabras(quitar), { tipo: "valores", antes: "Justificado", despues: "Sin justificar" });
  // aunque el archivo no tenga mes conocido, siguen siendo dos valores (nunca una flecha con un solo lado)
  assert.deepEqual(f.cambioEnPalabras({ ...justificar, despues: null }), { tipo: "valores", antes: "Sin justificar", despues: "Justificado" });
  for (const accion of ["justificar", "quitar_justificacion", "asociar_pago", "quitar_asociacion", "crear", "editar"]) {
    for (const campo of ["justificacion_vencimiento", "justificacion_archivo", "pago_asociado", "obligacion", "frecuencia", "moneda"]) {
      const c = f.cambioEnPalabras({ accion, campo, antes: null, despues: null });
      assert.ok(["vacio", "sin_valores", "valores"].includes(c.tipo), accion + campo);
      if (c.tipo === "valores") assert.ok(c.antes !== "" && c.despues !== "", accion + campo);
    }
  }
});

test("filtro «Qué cambió»: las justificaciones van en «Decisiones manuales» con sus rótulos", () => {
  assert.equal(f.rotuloDeCampo("justificacion_vencimiento"), "Justificación del vencimiento");
  assert.equal(f.rotuloDeCampo("justificacion_archivo"), "Justificación del archivo");
  const decisiones = f.GRUPOS_DE_CAMPOS.find((g) => g.titulo === "Decisiones manuales");
  assert.deepEqual(decisiones.campos, ["pago_asociado", "justificacion_vencimiento", "justificacion_archivo", "revision_obligacion"]);
  // un grupo solo con justificaciones se muestra solo con ese grupo; sin ellas, no aparece
  assert.deepEqual(f.agruparCampos(["justificacion_archivo"]), [{ titulo: "Decisiones manuales", campos: ["justificacion_archivo"] }]);
  assert.deepEqual(f.agruparCampos(["frecuencia"]).map((g) => g.titulo), ["Datos de la obligación"]);
});

test("frase del detalle: «Justificado por {nombre} el {fecha}. Motivo: {motivo}.» (con la nota si existe, sin punto doble)", () => {
  const j = { quien: "Ana Uno", cuando: "2026-10-28T15:30:00.000Z", motivo: "No se paga este mes", nota: null };
  assert.equal(f.fraseJustificado(j, "2026"), "Justificado por Ana Uno el 28 oct. Motivo: No se paga este mes.");
  assert.equal(f.fraseJustificado({ ...j, nota: "La tienda cerró." }, "2026"), "Justificado por Ana Uno el 28 oct. Motivo: No se paga este mes: La tienda cerró.");
  assert.equal(f.fraseJustificado({ ...j, cuando: "2025-12-31T15:30:00.000Z" }, "2026"), "Justificado por Ana Uno el 31 dic 2025. Motivo: No se paga este mes.");
  assert.equal(f.fraseJustificado({ ...j, cuando: "no es fecha" }, "2026"), "Justificado por Ana Uno. Motivo: No se paga este mes.");
});

test("revisión de la obligación: «Revisión de la obligación» y «En revisión → Revisada» (a la inversa al quitar); la flecha nunca queda sola", () => {
  const marcar = { accion: "marcar_revisada", campo: "revision_obligacion", antes: "en_revision", despues: "revisada" };
  const quitar = { accion: "quitar_revision", campo: "revision_obligacion", antes: "revisada", despues: "en_revision" };
  assert.equal(f.rotuloDeCampo("revision_obligacion"), "Revisión de la obligación");
  assert.equal(f.rotuloDeFila(marcar), "Revisión de la obligación");
  assert.equal(f.rotuloDeFila(quitar), "Revisión de la obligación");
  assert.deepEqual(f.cambioEnPalabras(marcar), { tipo: "valores", antes: "En revisión", despues: "Revisada" });
  assert.deepEqual(f.cambioEnPalabras(quitar), { tipo: "valores", antes: "Revisada", despues: "En revisión" });
  // aunque lo guardado viniera vacío, siguen siendo dos valores: nunca una flecha con un solo lado
  assert.deepEqual(f.cambioEnPalabras({ ...marcar, antes: null, despues: null }), { tipo: "valores", antes: "En revisión", despues: "Revisada" });
  for (const accion of ["marcar_revisada", "quitar_revision", "justificar", "asociar_pago", "crear", "editar"]) {
    const c = f.cambioEnPalabras({ accion, campo: "revision_obligacion", antes: null, despues: null });
    assert.ok(["vacio", "sin_valores", "valores"].includes(c.tipo), accion);
    if (c.tipo === "valores") assert.ok(c.antes !== "" && c.despues !== "", accion);
  }
});

test("filtro «Qué cambió»: la revisión va en «Decisiones manuales»; sola, ese es el único grupo", () => {
  assert.deepEqual(f.agruparCampos(["revision_obligacion"]), [{ titulo: "Decisiones manuales", campos: ["revision_obligacion"] }]);
  assert.deepEqual(f.agruparCampos(["revision_obligacion", "frecuencia"]).map((g) => g.titulo), ["Datos de la obligación", "Decisiones manuales"]);
  assert.deepEqual(f.agruparCampos(["frecuencia"]).map((g) => g.titulo), ["Datos de la obligación"]);
});

test("frase de la ficha: «Revisada por {nombre} el {fecha}. Nota: …» (sin punto doble)", () => {
  const r = { quien: "Ana Uno", cuando: "2026-10-28T15:30:00.000Z", nota: "El proveedor solo da su cuenta bancaria" };
  assert.equal(f.fraseRevisada(r, "2026"), "Revisada por Ana Uno el 28 oct. Nota: El proveedor solo da su cuenta bancaria.");
  assert.equal(f.fraseRevisada({ ...r, nota: "Ya se llamó al proveedor. " }, "2026"), "Revisada por Ana Uno el 28 oct. Nota: Ya se llamó al proveedor.");
  assert.equal(f.fraseRevisada({ ...r, cuando: "2025-12-31T15:30:00.000Z" }, "2026"), "Revisada por Ana Uno el 31 dic 2025. Nota: El proveedor solo da su cuenta bancaria.");
  assert.equal(f.fraseRevisada({ ...r, cuando: "no es fecha" }, "2026"), "Revisada por Ana Uno. Nota: El proveedor solo da su cuenta bancaria.");
});

test("el identificador de la ficha nunca sale completo", () => {
  assert.equal(f.identificadorEnmascarado("0001083"), "****1083");
  assert.equal(f.identificadorEnmascarado("CR05015202001026284066"), "****4066");
  assert.equal(f.identificadorEnmascarado("1083"), "****");
  assert.equal(f.identificadorEnmascarado(""), "****");
});

test("tarjeta «Falta día»: sigue contando el dato faltante y dice cuántas están revisadas", () => {
  assert.equal(f.textoFaltaDia(0), "no generan vencimientos");
  assert.equal(f.textoFaltaDia(1), "1 revisada · no generan vencimientos");
  assert.equal(f.textoFaltaDia(3), "3 revisadas · no generan vencimientos");
});
