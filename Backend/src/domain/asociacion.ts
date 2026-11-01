// Reglas puras de «asociar un pago a mano»: qué vencimientos lo admiten y en qué orden se ofrecen los pagos candidatos.

/** Estados que admiten asociar un pago a mano. Con un pago ya asociado el estado es Pagado: primero se quita la asociación. */
export const ESTADOS_ASOCIABLES = ["por_revisar", "vencido", "sin_informacion"];

/** Respaldo del parámetro `ventana_asociacion_manual_dias` (SUPUESTO: 30 días a cada lado de la fecha vigente del vencimiento). */
export const VENTANA_ASOCIACION_DEFECTO_DIAS = 30;
export const VENTANA_ASOCIACION_MAXIMO_DIAS = 120;

/** Cuántos pagos se ofrecen como máximo. */
export const MAXIMO_CANDIDATOS = 50;

const MS_DIA = 86_400_000;
const dia = (f: Date) => Math.floor(f.getTime() / MS_DIA);

/** Valor del parámetro como días enteros de 1 a 120; ausente o inválido, el respaldo. */
export function ventanaDeAsociacion(texto: string | null): number {
  const n = texto === null || texto.trim() === "" ? NaN : Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= VENTANA_ASOCIACION_MAXIMO_DIAS ? n : VENTANA_ASOCIACION_DEFECTO_DIAS;
}

/** Los pagos más cercanos a la fecha vigente primero, luego el más antiguo y, a igual fecha, el de id menor; con tope. */
export function ordenarCandidatos<T extends { id: number; fecha: Date }>(candidatos: T[], fechaVencimiento: Date, maximo = MAXIMO_CANDIDATOS): T[] {
  return [...candidatos]
    .sort((a, b) => Math.abs(dia(a.fecha) - dia(fechaVencimiento)) - Math.abs(dia(b.fecha) - dia(fechaVencimiento)) || dia(a.fecha) - dia(b.fecha) || a.id - b.id)
    .slice(0, maximo);
}

/** Límites en días del rango de pagos que se ofrecen: [fecha - N, fecha + N] ambos incluidos. */
export function rangoDeCandidatos(fechaVencimiento: Date, ventanaDias: number): { desde: Date; hastaExclusivo: Date } {
  return { desde: new Date(fechaVencimiento.getTime() - ventanaDias * MS_DIA), hastaExclusivo: new Date(fechaVencimiento.getTime() + (ventanaDias + 1) * MS_DIA) };
}

/** Clave de la asociación vigente de un vencimiento (la que impone una sola por obligación y periodo). */
export const claveObligacionPeriodo = (obligacionId: number, periodo: string) => `${obligacionId}|${periodo}`;

/** ¿La asociación vigente no tiene efecto? Sí, salvo que el vencimiento esté Pagado con el pago elegido (si ese movimiento ya no aparece, el cruce lo dejó en su estado calculado). */
export const asociacionSinEfecto = (estado: string, huellaDelPagoActual: string | null, huellaDeLaDecision: string | null): boolean =>
  !(estado === "pagado" && huellaDelPagoActual !== null && huellaDelPagoActual === huellaDeLaDecision);
