// Reglas puras de «asociar un pago a mano»: qué vencimientos lo admiten y en qué orden se ofrecen los pagos candidatos.
import { nombresEnDescripcion } from "../config/alias-proveedores.js";
import { normalizar } from "../ingest/utiles.js";
import { patronIdentificador } from "./identificadores.js";

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

export interface Marcas {
  /** el identificador de la obligación aparece en la descripción o en la referencia del pago */
  traeNumero: boolean;
  /** el nombre del proveedor (o un alias conocido) aparece en la descripción del pago */
  traeProveedor: boolean;
}

// Misma forma de comparar nombres que el cruce: sin mayúsculas, tildes ni espacios.
const plano = (t: string) => normalizar(t).replace(/\s+/g, "");

/**
 * Las dos marcas de un pago frente a una obligación, con la MISMA lógica del cruce: el número se busca con `patronIdentificador` (acepta ceros
 * a la izquierda y exige delimitación) en el texto en mayúsculas; el proveedor, con `nombresEnDescripcion` (nombre, nombre canónico y rótulos del
 * banco) contra la descripción normalizada. Aquí además se mira la referencia para el número.
 */
export function marcasDeCoincidencia(pago: { descripcion: string | null; referencia?: string | null }, obligacion: { identificador: string; proveedor: string }): Marcas {
  const patron = patronIdentificador(obligacion.identificador);
  const descripcion = (pago.descripcion ?? "").toUpperCase();
  const referencia = (pago.referencia ?? "").toUpperCase();
  const traeNumero = patron !== null && (patron.test(descripcion) || patron.test(referencia));
  const texto = plano(pago.descripcion ?? "");
  const traeProveedor = nombresEnDescripcion(obligacion.proveedor).some((n) => texto.includes(n));
  return { traeNumero, traeProveedor };
}

/** Grupo de coincidencia: 0 número y proveedor, 1 solo número, 2 solo proveedor, 3 ninguno. */
export const grupoDeCoincidencia = (m: Partial<Marcas>): number => (m.traeNumero ? (m.traeProveedor ? 0 : 1) : m.traeProveedor ? 2 : 3);

/**
 * Orden de los pagos que se ofrecen: primero los que traen número y proveedor, luego solo número, luego solo proveedor y luego el resto; dentro de
 * cada grupo, el más cercano a la fecha vigente, luego el más antiguo y, a igual fecha, el de id menor. El tope se aplica DESPUÉS de ordenar.
 * Sin marcas (todos en el mismo grupo) queda el orden por cercanía de siempre.
 */
export function ordenarCandidatos<T extends { id: number; fecha: Date } & Partial<Marcas>>(candidatos: T[], fechaVencimiento: Date, maximo = MAXIMO_CANDIDATOS): T[] {
  return [...candidatos]
    .sort(
      (a, b) =>
        grupoDeCoincidencia(a) - grupoDeCoincidencia(b) ||
        Math.abs(dia(a.fecha) - dia(fechaVencimiento)) - Math.abs(dia(b.fecha) - dia(fechaVencimiento)) ||
        dia(a.fecha) - dia(b.fecha) ||
        a.id - b.id,
    )
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
