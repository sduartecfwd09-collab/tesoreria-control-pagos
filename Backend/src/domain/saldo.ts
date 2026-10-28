// Resultado de la comprobación del saldo de un estado de cuenta (lo calcula el lector al importar) y su texto en
// lenguaje claro: qué pasó, qué significa y qué hacer. Puro. Un archivo que «no cuadra» no cuenta como cobertura;
// uno «no verificable» no cambia la cobertura.
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

const NO_CAMBIA_COBERTURA = "La cobertura sigue por fechas.";

/** Un archivo leído sin ningún movimiento y con una imagen pegada (la captura de la pantalla del banco): el lector no lee imágenes. */
export const esSoloImagen = (conImagenes: unknown, filasLeidas: number): boolean => conImagenes === true && filasLeidas === 0;

/** Texto de un archivo que solo trae una captura del estado de cuenta. */
export function textoSoloImagen(): TextoSaldo {
  return armar(
    "no_verificable",
    "Este archivo solo trae una captura del estado de cuenta; el sistema no lee imágenes.",
    "No se pudieron revisar ni los movimientos ni el saldo.",
    "Pida al banco el estado en Excel o CSV.",
  );
}

/** El texto del saldo de un archivo según lo guardado en su detalle; los archivos solo con imagen usan su propio texto. */
export function textoSaldoDeDetalle(detalle: { continuidad?: ContinuidadGuardada; conImagenes?: boolean } | null | undefined, filasLeidas: number): TextoSaldo | null {
  if (esSoloImagen(detalle?.conImagenes, filasLeidas)) return textoSoloImagen();
  return textoSaldo(detalle?.continuidad);
}

/** Resultado y texto en tres partes para mostrar en Estados de cuenta; null si el archivo no tiene la comprobación guardada. */
export function textoSaldo(c: ContinuidadGuardada | null | undefined): TextoSaldo | null {
  if (!c || (c.estado !== "cuadra" && c.estado !== "no_cuadra" && c.estado !== "no_verificable")) return null;
  if (c.estado === "cuadra") {
    return armar("cuadra", "El saldo cuadra en todas las filas.", "El estado de cuenta está completo y sirve para confirmar pagos.", "No hay nada que hacer.");
  }
  if (c.estado === "no_cuadra") {
    const pasó = c.fallos !== undefined && c.verificados !== undefined
      ? `En ${c.fallos} de ${c.verificados} comparaciones el saldo no coincide.`
      : "El saldo no coincide en algunas filas.";
    return armar("no_cuadra", pasó, "Puede faltar un movimiento o haber un error en el archivo, así que no se usa para confirmar pagos: los pagos de esa sociedad quedan en «Sin información».", "Revise el archivo con el banco o cargue uno corregido.");
  }
  switch (razonDeContinuidad(c) ?? "otro") {
    case "sin_movimientos":
      return armar("no_verificable", "Este archivo no trae movimientos del mes.", `No hay saldos que revisar. ${NO_CAMBIA_COBERTURA}`, "Si el mes tuvo movimientos, pida el estado de cuenta completo al banco; si no tuvo, no hay nada que hacer.");
    case "saldo_vacio_todas":
      return armar("no_verificable", "Este archivo no trae saldo en ninguna fila.", `No se puede revisar que los movimientos estén completos. ${NO_CAMBIA_COBERTURA}`, "Si el banco ofrece una versión con el saldo, descargue esa.");
    case "saldo_vacio_algunas": {
      const donde = c.filasSinSaldo !== undefined && c.movimientos !== undefined ? `en ${c.filasSinSaldo} de ${c.movimientos} filas` : "en algunas filas";
      return armar("no_verificable", `Este archivo no trae saldo ${donde}.`, `No se puede revisar que los movimientos estén completos. ${NO_CAMBIA_COBERTURA}`, "Revise el archivo o pida al banco una versión con el saldo en todas las filas.");
    }
    case "un_solo_saldo": {
      const pasó = c.movimientos === 1
        ? "Este archivo trae un solo movimiento, así que no hay un saldo anterior para revisar."
        : "Este archivo trae movimientos de un solo día, así que no hay un saldo anterior para revisar.";
      return armar("no_verificable", pasó, `El saldo no se puede revisar con tan poca información. ${NO_CAMBIA_COBERTURA}`, "Si el mes tuvo más movimientos, pida el estado de cuenta completo al banco; si no, no hay nada que hacer.");
    }
    default:
      return armar("no_verificable", "No se pudo revisar el saldo de este archivo.", `El archivo no trae lo necesario para hacerlo. ${NO_CAMBIA_COBERTURA}`, "Revise el archivo con el banco si le parece incompleto.");
  }
}
