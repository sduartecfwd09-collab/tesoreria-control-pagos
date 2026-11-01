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

// --- Lectura del historial (pantalla «Historial de cambios») ---

/** Tamaño de página de respaldo si el parámetro `historial_por_pagina` no existe o es inválido. */
export const HISTORIAL_POR_PAGINA_DEFECTO = 50;
export const HISTORIAL_POR_PAGINA_MAXIMO = 200;

const MS_DIA = 86_400_000;
const CR_UTC_MS = 6 * 3_600_000; // Costa Rica es UTC-6 todo el año (sin horario de verano)

/**
 * Límites en UTC de un rango de días de Costa Rica (AAAA-MM-DD): desde el inicio del día `desde` hasta el inicio del día siguiente a
 * `hasta` (exclusivo). `creadoEn` se guarda en UTC, así que el día de la persona se traduce aquí.
 */
export function limitesDeDias(desde?: string, hasta?: string): { desde?: Date; hastaExclusivo?: Date } {
  const inicio = (iso: string) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + CR_UTC_MS);
  return {
    ...(desde ? { desde: inicio(desde) } : {}),
    ...(hasta ? { hastaExclusivo: new Date(inicio(hasta).getTime() + MS_DIA) } : {}),
  };
}
