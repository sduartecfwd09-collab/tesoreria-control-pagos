// Reglas puras de generación de vencimientos (sin base).
// SUPUESTOS: si el día no existe en el mes se usa el último día; no se ajusta por fines de semana ni
// feriados (la ventana de cruce lo absorbe). Los estados distintos de "proyectado" llegan en el Hito 4.

/** Meses entre un vencimiento y el siguiente según la frecuencia. */
export const PASO_MESES: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

export const MAX_MESES_GENERACION = 24;

export const esPeriodo = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

const aIndice = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
const dePeriodoIndice = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/** Periodos AAAA-MM de desde a hasta, ambos incluidos (vacío si desde > hasta). */
export function periodosEntre(desde: string, hasta: string): string[] {
  const r: string[] = [];
  for (let i = aIndice(desde); i <= aIndice(hasta); i++) r.push(dePeriodoIndice(i));
  return r;
}

/** ¿Le toca vencimiento en ese periodo? Mensual siempre; las demás cuentan desde el mes de arranque. */
export function tocaEnPeriodo(frecuencia: string, mesArranque: number | null, periodo: string): boolean {
  const paso = PASO_MESES[frecuencia];
  if (!paso) return false;
  if (paso === 1) return true;
  if (mesArranque === null) return false;
  const mes = Number(periodo.slice(5, 7));
  return (((mes - mesArranque) % paso) + paso) % paso === 0;
}

/** Fecha del vencimiento (medianoche UTC). Si el día no existe en el mes, el último día del mes. */
export function fechaVencimiento(periodo: string, dia: number): Date {
  const y = Number(periodo.slice(0, 4));
  const m = Number(periodo.slice(5, 7));
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(dia, ultimo)));
}

export interface ObligacionPlan {
  id: number;
  activa: boolean;
  frecuencia: string;
  mesArranque: number | null;
  diaEsperadoPago: number | null;
  montoEsperado: number | null;
}

export interface VencimientoPlan {
  obligacionId: number;
  periodo: string;
  fecha: Date;
  montoEsperado: number | null;
}

export interface Omitida {
  obligacionId: number;
  motivo: "falta_dia" | "falta_mes_arranque" | "frecuencia_desconocida";
}

export const TEXTO_OMISION: Record<Omitida["motivo"], string> = {
  falta_dia: "Falta el día esperado de pago",
  falta_mes_arranque: "Falta el mes de arranque (frecuencia no mensual)",
  frecuencia_desconocida: "Frecuencia desconocida",
};

/** Vencimientos que corresponden a las obligaciones activas en los periodos dados, y las que no se pudieron planificar. */
export function planificar(obligaciones: ObligacionPlan[], periodos: string[]): { vencimientos: VencimientoPlan[]; omitidas: Omitida[] } {
  const vencimientos: VencimientoPlan[] = [];
  const omitidas: Omitida[] = [];
  for (const o of obligaciones) {
    if (!o.activa) continue;
    const paso = PASO_MESES[o.frecuencia];
    if (!paso) { omitidas.push({ obligacionId: o.id, motivo: "frecuencia_desconocida" }); continue; }
    if (o.diaEsperadoPago === null) { omitidas.push({ obligacionId: o.id, motivo: "falta_dia" }); continue; }
    if (paso > 1 && o.mesArranque === null) { omitidas.push({ obligacionId: o.id, motivo: "falta_mes_arranque" }); continue; }
    for (const periodo of periodos) {
      if (!tocaEnPeriodo(o.frecuencia, o.mesArranque, periodo)) continue;
      vencimientos.push({ obligacionId: o.id, periodo, fecha: fechaVencimiento(periodo, o.diaEsperadoPago), montoEsperado: o.montoEsperado });
    }
  }
  return { vencimientos, omitidas };
}
