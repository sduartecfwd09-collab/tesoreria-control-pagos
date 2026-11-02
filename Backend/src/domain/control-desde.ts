// «Control desde»: mes desde el cual se generan los vencimientos de una obligación. Antes de ese mes no se genera nada.
// Valor por defecto, en este orden:
//   1. la fecha de inicio del Excel, si el archivo la trae (el catálogo actual no trae esa columna);
//   2. el primer día del mes más antiguo con estados de cuenta cargados para la cuenta esperada de la obligación
//      (si no tiene cuenta esperada, el de las cuentas de su sociedad);
//   3. en el alta manual, el mes de alta (editable).
// Funciones puras: sin base.
import { periodoDe } from "./reloj.js";
import { esPeriodo, fechaVencimiento } from "./vencimientos.js";

/** AAAA-MM del mes de hoy (medianoche UTC). */
export const mesDeAlta = (hoy: Date): string => periodoDe(hoy);

export function mesSiguiente(periodo: string): string {
  const y = Number(periodo.slice(0, 4));
  const m = Number(periodo.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Primer día de un periodo AAAA-MM (medianoche UTC). */
export const primerDiaDelPeriodo = (periodo: string): Date => fechaVencimiento(periodo, 1);

/** Periodo AAAA-MM de la fecha guardada, o null si no hay. */
export const periodoDeControl = (f: Date | null): string | null => (f ? periodoDe(f) : null);

/** El más antiguo de varios periodos AAAA-MM válidos; null si no hay ninguno. */
export function periodoMasAntiguo(periodos: (string | null)[]): string | null {
  const validos = periodos.filter((p): p is string => p !== null && esPeriodo(p)).sort();
  return validos[0] ?? null;
}

export interface AdvertenciaDiaYaPaso {
  tipo: "dia_ya_paso";
  mensaje: string;
  mesAlta: string;
  mesSiguiente: string;
}

/**
 * Si el día de pago del mes de alta ya pasó, el formulario debe preguntar «¿controlar desde este mes o desde el
 * siguiente?». El valor por defecto sigue siendo el mes de alta. No avisa si la persona ya eligió el mes.
 */
export function advertenciaDiaYaPaso(dia: number | null | undefined, hoy: Date, controlDesdeElegido: boolean): AdvertenciaDiaYaPaso | null {
  if (controlDesdeElegido || dia == null) return null;
  const mes = mesDeAlta(hoy);
  if (fechaVencimiento(mes, dia).getTime() >= hoy.getTime()) return null;
  return {
    tipo: "dia_ya_paso",
    mensaje: "El día de pago de este mes ya pasó. Indique si se controla desde este mes o desde el siguiente.",
    mesAlta: mes,
    mesSiguiente: mesSiguiente(mes),
  };
}
