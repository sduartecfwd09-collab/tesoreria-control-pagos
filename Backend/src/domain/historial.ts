// Qué líneas del historial deja una edición de una obligación. Lógica pura: compara el antes y el después y devuelve solo
// los campos que realmente cambiaron. Reglas de confidencialidad: de montoEsperado, moneda y cuentaEsperadaId solo se anota
// que «cambió» (antes y despues nulos); en el resto, valores de texto corto sin montos ni cuentas.
import { periodoDeControl } from "./control-desde.js";

export interface DatosEditables {
  frecuencia: string;
  frecuenciaPorConfirmar: boolean;
  mesArranque: number | null;
  diaEsperadoPago: number | null;
  activa: boolean;
  controlDesde: Date | null;
  montoEsperado: bigint | null;
  moneda: string;
  cuentaEsperadaId: number | null;
}

export type AccionHistorial = "crear" | "editar" | "activar" | "desactivar";

export interface LineaCambio {
  accion: AccionHistorial;
  campo: string;
  antes: string | null;
  despues: string | null;
}

const texto = (n: number | null): string | null => (n === null ? null : String(n));
const confirmada = (porConfirmar: boolean) => (porConfirmar ? "sin confirmar" : "confirmada");

export function lineasDeEdicion(a: DatosEditables, d: DatosEditables): LineaCambio[] {
  const l: LineaCambio[] = [];
  const valor = (campo: string, antes: string | null, despues: string | null) => l.push({ accion: "editar", campo, antes, despues });
  if (a.frecuencia !== d.frecuencia) valor("frecuencia", a.frecuencia, d.frecuencia);
  if (a.frecuenciaPorConfirmar !== d.frecuenciaPorConfirmar) valor("frecuenciaPorConfirmar", confirmada(a.frecuenciaPorConfirmar), confirmada(d.frecuenciaPorConfirmar));
  if (a.mesArranque !== d.mesArranque) valor("mesArranque", texto(a.mesArranque), texto(d.mesArranque));
  // el día ya definido solo se cambia por el servicio de cambio de día; aquí se anota cuando se fija por primera vez
  if (a.diaEsperadoPago === null && d.diaEsperadoPago !== null) valor("diaEsperadoPago", null, texto(d.diaEsperadoPago));
  if (a.activa !== d.activa) l.push({ accion: d.activa ? "activar" : "desactivar", campo: "activa", antes: a.activa ? "activa" : "inactiva", despues: d.activa ? "activa" : "inactiva" });
  if (periodoDeControl(a.controlDesde) !== periodoDeControl(d.controlDesde)) valor("controlDesde", periodoDeControl(a.controlDesde), periodoDeControl(d.controlDesde));
  // datos sensibles: solo se anota que cambió
  if (a.montoEsperado !== d.montoEsperado) valor("montoEsperado", null, null);
  if (a.moneda !== d.moneda) valor("moneda", null, null);
  if (a.cuentaEsperadaId !== d.cuentaEsperadaId) valor("cuentaEsperadaId", null, null);
  return l;
}

/** El alta manual deja una sola línea. */
export const lineaDeAlta = (): LineaCambio => ({ accion: "crear", campo: "obligacion", antes: null, despues: null });
