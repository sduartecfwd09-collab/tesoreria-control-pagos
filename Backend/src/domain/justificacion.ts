// Justificar a mano un vencimiento o un archivo: motivos fijos, notas, qué problema tiene un archivo y cuándo una justificación sigue teniendo efecto.
// Reglas puras (sin base). Los motivos y el mapa problema -> motivos están SOLO aquí: la API los entrega y el Frontend los usa tal cual.
import { estadoDeArchivo, type DatosEstadoArchivo } from "./estado-archivo.js";
import { esImagenNoLegible, esSinMovimientos, textoSaldoDeDetalle, type ContinuidadGuardada } from "./saldo.js";

export const TIPO_JUSTIFICACION_VENCIMIENTO = "justificacion_vencimiento";
export const TIPO_JUSTIFICACION_ARCHIVO = "justificacion_archivo";

/** Solo un vencimiento cuyo estado calculado es Vencido o Sin información se puede justificar. */
export const ESTADOS_JUSTIFICABLES = ["vencido", "sin_informacion"];

export interface MotivoJustificacion {
  clave: string;
  texto: string;
  /** «Otro» y los que dicen «(explicar)» exigen una nota de 3 a 300 caracteres; en los demás es opcional (hasta 300) */
  notaObligatoria: boolean;
}

export const MOTIVOS_VENCIMIENTO: MotivoJustificacion[] = [
  { clave: "no_se_paga", texto: "No se paga este mes", notaObligatoria: false },
  { clave: "otro_medio", texto: "Se pagó por otro medio", notaObligatoria: false },
  { clave: "otro", texto: "Otro (explicar)", notaObligatoria: true },
];

/** El único motivo de un archivo que da cobertura (solo en «Imagen no legible»). */
export const MOTIVO_DA_COBERTURA = "banco_confirma_sin_movimientos";

const MOTIVOS_ARCHIVO: Record<string, MotivoJustificacion> = {
  banco_confirma_sin_movimientos: { clave: "banco_confirma_sin_movimientos", texto: "El banco confirma que no hubo movimientos", notaObligatoria: false },
  solo_ese_movimiento: { clave: "solo_ese_movimiento", texto: "El mes solo tuvo ese movimiento", notaObligatoria: false },
  saldo_difiere: { clave: "saldo_difiere", texto: "El saldo difiere por una razón conocida (explicar)", notaObligatoria: true },
  pedido_al_banco: { clave: "pedido_al_banco", texto: "Estado pedido al banco (pendiente)", notaObligatoria: false },
  otro: { clave: "otro", texto: "Otro (explicar)", notaObligatoria: true },
};

/** Los problemas que hoy muestra «Estados de cuenta» en «Archivos que requieren atención». */
export type ProblemaArchivo = "con_error" | "sin_sociedad" | "saldo_no_cuadra" | "imagen_no_legible" | "nombre_distinto";

/** ÚNICO mapa problema -> motivos que se pueden elegir (en este orden). */
export const MOTIVOS_POR_PROBLEMA: Record<ProblemaArchivo, string[]> = {
  con_error: ["pedido_al_banco", "otro"],
  sin_sociedad: ["pedido_al_banco", "otro"],
  saldo_no_cuadra: ["saldo_difiere", "solo_ese_movimiento", "pedido_al_banco", "otro"],
  imagen_no_legible: ["banco_confirma_sin_movimientos", "pedido_al_banco", "otro"],
  nombre_distinto: ["pedido_al_banco", "otro"],
};

export const motivosDeProblema = (p: ProblemaArchivo): MotivoJustificacion[] => MOTIVOS_POR_PROBLEMA[p].map((k) => MOTIVOS_ARCHIVO[k]!);

export const NOTA_MAXIMA = 300;
export const NOTA_MINIMA_SI_OBLIGATORIA = 3;

export type ResultadoValidacion =
  | { ok: true; motivo: MotivoJustificacion; nota: string | null }
  | { ok: false; campo: "motivo" | "nota"; error: string };

/** Valida el motivo elegido (debe estar entre los permitidos) y la nota (opcional u obligatoria según el motivo); la nota se normaliza (espacios). */
export function validarMotivoYNota(permitidos: MotivoJustificacion[], clave: unknown, nota?: unknown): ResultadoValidacion {
  const motivo = typeof clave === "string" ? permitidos.find((m) => m.clave === clave) : undefined;
  if (!motivo) return { ok: false, campo: "motivo", error: "Elija el motivo de la lista" };
  if (nota !== undefined && nota !== null && typeof nota !== "string") return { ok: false, campo: "nota", error: "La nota debe ser un texto" };
  const texto = typeof nota === "string" ? nota.replace(/\s+/g, " ").trim() : "";
  if (texto.length > NOTA_MAXIMA) return { ok: false, campo: "nota", error: `La nota admite como máximo ${NOTA_MAXIMA} caracteres` };
  if (motivo.notaObligatoria && texto.length < NOTA_MINIMA_SI_OBLIGATORIA) return { ok: false, campo: "nota", error: `Explique el motivo (entre ${NOTA_MINIMA_SI_OBLIGATORIA} y ${NOTA_MAXIMA} caracteres)` };
  return { ok: true, motivo, nota: texto === "" ? null : texto };
}

/** Lo que se guarda en `datos` de la decisión (texto JSON corto). */
export const datosDeJustificacion = (d: { clave: string; nota: string | null; problema?: ProblemaArchivo }): string => JSON.stringify(d);

export function leerDatos(datos: string | null): { clave: string | null; nota: string | null; problema: string | null } {
  try {
    const d = JSON.parse(datos ?? "{}") as { clave?: unknown; nota?: unknown; problema?: unknown };
    return {
      clave: typeof d.clave === "string" ? d.clave : null,
      nota: typeof d.nota === "string" ? d.nota : null,
      problema: typeof d.problema === "string" ? d.problema : null,
    };
  } catch {
    return { clave: null, nota: null, problema: null };
  }
}

/** Texto del «Motivo» del historial: el motivo elegido y, si hay, la nota. Cabe en las 300 posiciones de la columna. */
export const motivoParaHistorial = (motivo: string, nota: string | null): string => (nota ? `${motivo}: ${nota}` : motivo).slice(0, 300);

// --- Archivos ---

/** Claves de las columnas únicas (sin chocar con las asociaciones de pago: el prefijo distingue el tipo). */
export const claveUnicaJustificacionVencimiento = (obligacionId: number, periodo: string) => `j|${obligacionId}|${periodo}`;
export const claveUnicaJustificacionArchivo = (archivoId: number) => `a|${archivoId}`;

export interface DatosArchivoRegistrado extends DatosEstadoArchivo {
  /** el detalle guardado al leer (continuidad del saldo, discrepancias de nombre) */
  detalle: unknown;
}

/**
 * El problema que tiene el archivo AHORA (el principal, si tiene varios), o null si no requiere atención. Un archivo legible sin movimientos ya da
 * cobertura (no es un problema); los retirados no cuentan. Orden: sin sociedad, error, imagen no legible, saldo que no cuadra, nombre distinto.
 */
export function problemaDeArchivo(a: DatosArchivoRegistrado): ProblemaArchivo | null {
  const vista = estadoDeArchivo(a);
  if (vista === "retirado") return null;
  if (vista === "sin_sociedad") return "sin_sociedad";
  if (vista === "con_error") return "con_error";
  const d = (a.detalle ?? {}) as { continuidad?: ContinuidadGuardada; discrepancias?: unknown[] };
  if (esImagenNoLegible(d.continuidad)) return "imagen_no_legible";
  if (!esSinMovimientos(d.continuidad) && textoSaldoDeDetalle({ continuidad: d.continuidad })?.resultado === "no_cuadra") return "saldo_no_cuadra";
  if ((d.discrepancias?.length ?? 0) > 0) return "nombre_distinto";
  return null;
}

export interface DecisionDeArchivo {
  huella: string | null;
  datos: string | null;
}

/**
 * ¿La justificación de un archivo sigue teniendo efecto? Sí solo si el archivo tiene el MISMO contenido (misma huella: su hash) y el MISMO problema
 * con el que se justificó. Si se vuelve a importar con contenido distinto o aparece otro tipo de problema, queda sin efecto (no se borra) y el archivo
 * vuelve a requerir atención. Un archivo sin leer (en revisión) tiene hash vacío: la justificación vale mientras siga sin leerse.
 */
export function justificacionDeArchivoTieneEfecto(d: DecisionDeArchivo, actual: { hash: string; problema: ProblemaArchivo | null }): boolean {
  return actual.problema !== null && (d.huella ?? "") === actual.hash && leerDatos(d.datos).problema === actual.problema;
}

/** ¿Da cobertura? Solo con efecto, con el motivo «El banco confirma que no hubo movimientos» y en un archivo de imagen no legible. */
export const justificacionDaCobertura = (d: DecisionDeArchivo, actual: { hash: string; problema: ProblemaArchivo | null }): boolean =>
  justificacionDeArchivoTieneEfecto(d, actual) && actual.problema === "imagen_no_legible" && leerDatos(d.datos).clave === MOTIVO_DA_COBERTURA;
