// Lógica pura del selector de fechas: fechas ISO (AAAA-MM-DD) y periodos (AAAA-MM), formato día/mes/año, rangos, atajos y límites.
// Sin dependencias, para poder probarla con `npm run fechas`. Todo es «solo día»: se calcula en UTC, sin zona horaria.

export interface Rango {
  desde: string;
  hasta: string;
}

/** Primera y última fecha con datos (salen del servidor, con el alcance de la persona). */
export interface Limites {
  primera: string;
  ultima: string;
}

export type IdAtajo = "hoy" | "semana" | "mes" | "mes_anterior" | "ultimos_3_meses" | "ultimos_12_meses" | "anio";

export const TEXTO_ATAJO: Record<IdAtajo, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
  mes_anterior: "Mes anterior",
  ultimos_3_meses: "Últimos 3 meses",
  ultimos_12_meses: "Últimos 12 meses",
  anio: "Este año",
};

const MS_DIA = 86_400_000;
const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const aFecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const deFecha = (f: Date) => f.toISOString().slice(0, 10);

/** ¿Es una fecha real AAAA-MM-DD? (rechaza 2026-02-30). */
export function esFechaIso(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = aFecha(f);
  return !Number.isNaN(d.getTime()) && deFecha(d) === f;
}

export const periodoDe = (iso: string) => iso.slice(0, 7);

/** "2026-10-15" -> "15/10/2026". */
export const aTextoDMA = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "15/10/2026" (también con - o .; día y mes de uno o dos dígitos; año de cuatro) -> "2026-10-15"; null si no es una fecha real. */
export function deTextoDMA(texto: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(texto);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return esFechaIso(iso) ? iso : null;
}

export const sumarDias = (iso: string, n: number) => deFecha(new Date(aFecha(iso).getTime() + n * MS_DIA));

/** Periodo AAAA-MM desplazado n meses (también hacia atrás y a través de los años). */
export function sumarMeses(periodo: string, n: number): string {
  const i = Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export const primerDia = (periodo: string) => `${periodo}-01`;

export function ultimoDia(periodo: string): string {
  return sumarDias(primerDia(sumarMeses(periodo, 1)), -1);
}

/** "2026-10" -> "octubre 2026". */
export const nombreDelPeriodo = (p: string) => `${NOMBRES_MES[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

/** Lunes a domingo de la semana de una fecha. */
export function semanaDe(iso: string): Rango {
  const dia = aFecha(iso).getUTCDay(); // 0 = domingo
  const desde = sumarDias(iso, -((dia + 6) % 7));
  return { desde, hasta: sumarDias(desde, 6) };
}

/**
 * Rango de cada atajo a partir de «hoy». Son bloques de calendario: «Este mes» y «Mes anterior» son meses completos;
 * «Últimos 3 meses» son los dos meses anteriores y el actual, completos; «Últimos 12 meses» van del día 1 del mes de hace 11 meses a hoy;
 * «Este año» va del 1 de enero al 31 de diciembre. Quien los usa en una pantalla del pasado los recorta a hoy (recortarRango).
 */
export function rangoDeAtajo(id: IdAtajo, hoy: string): Rango {
  const mes = periodoDe(hoy);
  switch (id) {
    case "hoy": return { desde: hoy, hasta: hoy };
    case "semana": return semanaDe(hoy);
    case "mes": return { desde: primerDia(mes), hasta: ultimoDia(mes) };
    case "mes_anterior": { const m = sumarMeses(mes, -1); return { desde: primerDia(m), hasta: ultimoDia(m) }; }
    case "ultimos_3_meses": return { desde: primerDia(sumarMeses(mes, -2)), hasta: ultimoDia(mes) };
    case "ultimos_12_meses": return { desde: primerDia(sumarMeses(mes, -11)), hasta: hoy };
    case "anio": return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: `${hoy.slice(0, 4)}-12-31` };
  }
}

/** Recorta un rango a los límites de los datos y, si se indica, a un mes (null si no queda ningún día). */
export function recortarRango(r: Rango, opciones: { limites?: Limites | null; mes?: string | null } = {}): Rango | null {
  let { desde, hasta } = r;
  if (opciones.mes) {
    if (desde < primerDia(opciones.mes)) desde = primerDia(opciones.mes);
    if (hasta > ultimoDia(opciones.mes)) hasta = ultimoDia(opciones.mes);
  }
  if (opciones.limites) {
    if (desde < opciones.limites.primera) desde = opciones.limites.primera;
    if (hasta > opciones.limites.ultima) hasta = opciones.limites.ultima;
  }
  return desde <= hasta ? { desde, hasta } : null;
}

/** Mensaje claro si el rango no es válido (desde <= hasta, dentro de los límites y del mes); null si lo es. */
export function validarRango(r: Rango, opciones: { limites?: Limites | null; mes?: string | null } = {}): string | null {
  if (!esFechaIso(r.desde) || !esFechaIso(r.hasta)) return "Escriba las fechas como día/mes/año, por ejemplo 15/10/2026.";
  if (r.desde > r.hasta) return "«Desde» no puede ser posterior a «Hasta».";
  if (opciones.mes && (r.desde < primerDia(opciones.mes) || r.hasta > ultimoDia(opciones.mes))) {
    return `Las fechas deben estar dentro de ${nombreDelPeriodo(opciones.mes)}.`;
  }
  const l = opciones.limites;
  if (l && (r.desde < l.primera || r.hasta > l.ultima)) return `Elija fechas entre ${aTextoDMA(l.primera)} y ${aTextoDMA(l.ultima)}.`;
  return null;
}

/** ¿Se puede ir a este mes? Sin límites siempre; con límites, solo si el mes tiene algún día con datos. */
export function mesDentroDeLimites(periodo: string, limites: Limites | null | undefined): boolean {
  if (!limites) return true;
  return periodo >= periodoDe(limites.primera) && periodo <= periodoDe(limites.ultima);
}

/** «15/10/2026 y 31/10/2026» para los mensajes («entre … y …»). */
export const textoEntre = (r: Rango) => `${aTextoDMA(r.desde)} y ${aTextoDMA(r.hasta)}`;

/**
 * Qué decir cuando un período no tiene filas: «futuro» (empieza después de hoy), «sin_informacion» (ya pasó y ningún día tiene
 * estados de cuenta cargados: una tabla vacía se leería como «no hubo pagos») o «normal» (hay estados de cuenta: de verdad no hay filas).
 */
export function tipoDeVacio(rango: Rango, hoy: string, cobertura: Limites | null): "futuro" | "sin_informacion" | "normal" {
  if (rango.desde > hoy) return "futuro";
  if (!cobertura || rango.hasta < cobertura.primera || rango.desde > cobertura.ultima) return "sin_informacion";
  return "normal";
}
