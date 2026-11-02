// Resultado de la comprobación del saldo de un estado de cuenta (lo calcula el lector al importar) y su texto en
// lenguaje claro: qué pasó, qué significa y qué hacer (una frase corta cada una). Puro. Un archivo que «no cuadra» o cuyos
// movimientos vienen como imagen no cuenta como cobertura; uno «no verificable» no cambia la cobertura.
import type { RazonNoVerificable } from "../ingest/tipos.js";

export type ResultadoSaldo = "cuadra" | "no_cuadra" | "no_verificable";

export interface ContinuidadGuardada {
  estado?: string;
  verificados?: number;
  fallos?: number;
  motivo?: string;
  razon?: RazonNoVerificable;
  movimientos?: number;
  filasSinSaldo?: number;
}

/** Razón por la que no se pudo verificar; los archivos guardados antes de registrarla se reconocen por su texto fijo. */
export function razonDeContinuidad(c: ContinuidadGuardada | null | undefined): RazonNoVerificable | null {
  if (!c || c.estado !== "no_verificable") return null;
  if (c.razon) return c.razon;
  if (c.motivo === "sin movimientos") return "sin_movimientos";
  if (c.motivo === "hay movimientos sin saldo") return "saldo_vacio_algunas";
  if (c.motivo === "un solo saldo y sin saldo de apertura") return "un_solo_saldo";
  return "otro";
}

/** Frase corta de la razón, para el diagnóstico. */
export const TEXTO_RAZON: Record<RazonNoVerificable, string> = {
  sin_movimientos: "el archivo no trae movimientos",
  saldo_vacio_todas: "ninguna fila trae saldo",
  saldo_vacio_algunas: "algunas filas no traen saldo",
  un_solo_saldo: "trae un solo saldo (un movimiento o un solo día) y no hay saldo anterior con qué compararlo",
  imagen_no_legible: "no trae movimientos y trae una imagen grande (los movimientos vienen como imagen)",
  otro: "el archivo no permite comprobarlo",
};

export interface TextoSaldo {
  resultado: ResultadoSaldo;
  queSePaso: string;
  queSignifica: string;
  queHacer: string;
  /** las tres partes juntas, para mostrar en una sola línea */
  motivo: string;
}

const armar = (resultado: ResultadoSaldo, queSePaso: string, queSignifica: string, queHacer: string): TextoSaldo => ({
  resultado, queSePaso, queSignifica, queHacer, motivo: `${queSePaso} ${queSignifica} ${queHacer}`,
});

const NO_CAMBIA_COBERTURA = "la cobertura sigue por fechas";

/** Un archivo leído sin ningún movimiento y con alguna imagen pegada (solo lo usa la sección 11 del diagnóstico; el criterio de pantalla es «sin movimientos», tenga imagen o no). */
export const esSoloImagen = (conImagenes: unknown, filasLeidas: number): boolean => conImagenes === true && filasLeidas === 0;

/** El texto del saldo de un archivo según lo guardado en su detalle. */
export function textoSaldoDeDetalle(detalle: { continuidad?: ContinuidadGuardada } | null | undefined): TextoSaldo | null {
  return textoSaldo(detalle?.continuidad);
}

/** ¿El archivo se leyó y no trae ningún movimiento, con logo o sin imagen? Da cobertura. */
export const esSinMovimientos = (c: ContinuidadGuardada | null | undefined): boolean => razonDeContinuidad(c) === "sin_movimientos";

/** ¿Los movimientos vienen como imagen (sin movimientos y con una imagen grande)? NO da cobertura. */
export const esImagenNoLegible = (c: ContinuidadGuardada | null | undefined): boolean => razonDeContinuidad(c) === "imagen_no_legible";

/** Resultado y texto en tres partes para mostrar en Estados de cuenta; null si el archivo no tiene la comprobación guardada. */
export function textoSaldo(c: ContinuidadGuardada | null | undefined): TextoSaldo | null {
  if (!c || (c.estado !== "cuadra" && c.estado !== "no_cuadra" && c.estado !== "no_verificable")) return null;
  if (c.estado === "cuadra") {
    return armar("cuadra", "El saldo cuadra en todas las filas.", "El estado de cuenta está completo.", "No requiere ninguna acción.");
  }
  if (c.estado === "no_cuadra") {
    const pasó = c.fallos !== undefined && c.verificados !== undefined
      ? `En ${c.fallos} de ${c.verificados} comparaciones el saldo no coincide.`
      : "El saldo no coincide en algunas filas.";
    return armar("no_cuadra", pasó, "No se usa para confirmar pagos: quedan en «Sin información».", "Revise el archivo con el banco o cargue uno corregido.");
  }
  switch (razonDeContinuidad(c) ?? "otro") {
    case "sin_movimientos":
      return armar("no_verificable", "El archivo no tiene movimientos de este mes.", "Se entiende que la cuenta no tuvo actividad, por eso se da por revisada.", "Si la cuenta sí tuvo movimientos, pida el estado completo al banco.");
    case "imagen_no_legible":
      return armar("no_verificable", "Los movimientos vienen como imagen y el sistema no puede leerlos.", "No se puede confirmar qué se pagó con esta cuenta.", "Pida al banco el estado en Excel o CSV.");
    case "saldo_vacio_todas":
      return armar("no_verificable", "El archivo no trae saldo en ninguna fila.", `No se puede confirmar que esté completo; ${NO_CAMBIA_COBERTURA}.`, "Pida al banco una versión con saldo.");
    case "saldo_vacio_algunas": {
      const donde = c.filasSinSaldo !== undefined && c.movimientos !== undefined ? `en ${c.filasSinSaldo} de ${c.movimientos} filas` : "en algunas filas";
      return armar("no_verificable", `El archivo no trae saldo ${donde}.`, `No se puede confirmar que esté completo; ${NO_CAMBIA_COBERTURA}.`, "Pida al banco una versión con saldo en todas las filas.");
    }
    case "un_solo_saldo": {
      const pasó = c.movimientos === 1 ? "El archivo trae un solo movimiento." : "El archivo trae movimientos de un solo día.";
      return armar("no_verificable", pasó, "No hay saldo anterior con qué comparar.", "Si el mes tuvo más movimientos, pida el estado completo.");
    }
    default:
      return armar("no_verificable", "No se pudo revisar el saldo del archivo.", `El archivo no trae lo necesario; ${NO_CAMBIA_COBERTURA}.`, "Si le parece incompleto, revíselo con el banco.");
  }
}
