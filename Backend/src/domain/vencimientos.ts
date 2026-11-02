// Reglas puras de generación de vencimientos (sin base).
// SUPUESTOS: si el día no existe en el mes se usa el último día; no se ajusta por fines de semana ni
// feriados (la ventana de cruce lo absorbe). Los estados los calcula el motor de cruce (domain/cruce.ts).

/** Meses entre un vencimiento y el siguiente según la frecuencia. */
export const PASO_MESES: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

/** Estados de un vencimiento ya pagado: nunca se borran ni se mueven al regenerar. */
export const ESTADOS_PAGADOS = ["pagado", "pagado_con_inconsistencia"];

export const esPeriodo = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** ¿Es una fecha real en formato AAAA-MM-DD? (rechaza 2026-02-30). */
export function esFechaIso(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

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

/** Datos de la obligación que cada vencimiento guarda como copia (el monto estimado va aparte, en montoEsperado). */
export interface CopiaObligacion {
  dia: number | null;
  sociedadId: number;
  categoriaId: number;
  proveedor: string;
  cuentaEsperadaId: number | null;
  moneda: string;
}

/** Un cambio permanente del día de pago que rige desde un mes (AAAA-MM) en adelante. */
export interface CambioDiaProgramado {
  desde: string;
  dia: number;
}

export interface ObligacionPlan {
  id: number;
  sociedadId: number;
  categoriaId: number;
  proveedor: string;
  cuentaEsperadaId: number | null;
  moneda: string;
  activa: boolean;
  frecuencia: string;
  mesArranque: number | null;
  diaEsperadoPago: number | null;
  montoEsperado: number | null;
  /** «Control desde» (AAAA-MM): antes de ese mes no se genera nada. null/ausente = sin límite. */
  controlDesde?: string | null;
  /** cambios permanentes del día con su mes de inicio, de menor a mayor «desde» (a igual mes manda el último); ausente = ninguno */
  cambiosDia?: CambioDiaProgramado[];
}

/**
 * Día de pago que rige en un periodo: el del último cambio permanente cuyo «desde» no pasa de ese periodo; sin cambios que apliquen,
 * el día base de la obligación. Sin cambios programados el resultado es siempre el día base (idéntico a antes).
 */
export function diaDelPeriodo(o: { diaEsperadoPago: number | null; cambiosDia?: CambioDiaProgramado[] }, periodo: string): number | null {
  let dia = o.diaEsperadoPago;
  for (const c of o.cambiosDia ?? []) if (c.desde <= periodo) dia = c.dia;
  return dia;
}

/** La copia que se guarda en cada vencimiento a partir de la obligación (con el día que rige en su periodo). */
export const copiaDe = (o: ObligacionPlan, periodo?: string): CopiaObligacion => ({
  dia: periodo === undefined ? o.diaEsperadoPago : diaDelPeriodo(o, periodo),
  sociedadId: o.sociedadId,
  categoriaId: o.categoriaId,
  proveedor: o.proveedor,
  cuentaEsperadaId: o.cuentaEsperadaId,
  moneda: o.moneda,
});

export interface VencimientoPlan extends CopiaObligacion {
  obligacionId: number;
  periodo: string;
  fecha: Date;
  montoEsperado: number | null;
}

export interface Omitida {
  obligacionId: number;
  motivo: "falta_dia" | "falta_mes_arranque" | "frecuencia_desconocida";
}

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
      if (o.controlDesde && periodo < o.controlDesde) continue; // antes de «Control desde» no se genera nada
      if (!tocaEnPeriodo(o.frecuencia, o.mesArranque, periodo)) continue;
      const dia = diaDelPeriodo(o, periodo) ?? o.diaEsperadoPago;
      vencimientos.push({ obligacionId: o.id, periodo, fecha: fechaVencimiento(periodo, dia), montoEsperado: o.montoEsperado, ...copiaDe(o, periodo) });
    }
  }
  return { vencimientos, omitidas };
}

const SIGUIENTE = (p: string) => periodosEntre(p, dePeriodoIndice(aIndice(p) + 1))[1]!;

/**
 * Próximo pago de una obligación: dato calculado (no son filas). Es el próximo vencimiento con fecha igual o posterior a hoy
 * según su frecuencia y su mes de arranque (el día de hoy cuenta). Parte del mes de hoy, o de «Control desde» si es futuro.
 * No depende de los vencimientos ya generados: un vencimiento generado con anticipación (por ejemplo el del día 1 del mes
 * siguiente) sigue siendo el próximo hasta que pase su fecha.
 * null si no se puede calcular (falta el día, o falta el mes de arranque en las frecuencias no mensuales).
 */
export function proximoPago(
  o: { frecuencia: string; mesArranque: number | null; diaEsperadoPago: number | null; controlDesde: string | null; cambiosDia?: CambioDiaProgramado[] },
  hoy: Date,
): Date | null {
  if (o.diaEsperadoPago === null || !PASO_MESES[o.frecuencia]) return null;
  const mesDeHoy = hoy.toISOString().slice(0, 7);
  let periodo = o.controlDesde && o.controlDesde > mesDeHoy ? o.controlDesde : mesDeHoy;
  for (let i = 0; i < 24; i++, periodo = SIGUIENTE(periodo)) {
    if (!tocaEnPeriodo(o.frecuencia, o.mesArranque, periodo)) continue;
    const fecha = fechaVencimiento(periodo, diaDelPeriodo(o, periodo) ?? o.diaEsperadoPago);
    if (fecha >= hoy) return fecha;
  }
  return null;
}
