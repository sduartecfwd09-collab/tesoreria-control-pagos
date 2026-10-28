// Resultado de la comprobación del saldo de un estado de cuenta (lo calcula el lector al importar) y su texto en
// lenguaje claro. Puro. Un archivo que «no cuadra» no cuenta como cobertura; uno «no verificable» no cambia la cobertura.
import type { RazonNoVerificable } from "../ingest/tipos.js";

export type ResultadoSaldo = "cuadra" | "no_cuadra" | "no_verificable";

export interface ContinuidadGuardada {
  estado?: string;
  verificados?: number;
  fallos?: number;
  motivo?: string;
  razon?: RazonNoVerificable;
}

/** Razón por la que no se pudo verificar; los archivos leídos antes de guardarla se reconocen por su texto fijo. */
export function razonDeContinuidad(c: ContinuidadGuardada | null | undefined): RazonNoVerificable | null {
  if (!c || c.estado !== "no_verificable") return null;
  if (c.razon) return c.razon;
  if (c.motivo === "sin movimientos") return "sin_movimientos";
  if (c.motivo === "hay movimientos sin saldo") return "saldo_vacio_algunas";
  if (c.motivo === "un solo saldo y sin saldo de apertura") return "un_solo_saldo";
  return "otro";
}

export const TEXTO_RAZON: Record<RazonNoVerificable, string> = {
  sin_movimientos: "el archivo no trae movimientos",
  saldo_vacio_todas: "ninguna fila trae saldo",
  saldo_vacio_algunas: "algunas filas no traen saldo",
  un_solo_saldo: "trae un solo saldo (un movimiento o un solo día) y no hay saldo anterior con qué compararlo",
  otro: "el archivo no permite comprobarlo",
};

/** Resultado y motivo para mostrar en Estados de cuenta; null si el archivo no tiene la comprobación guardada. */
export function textoSaldo(c: ContinuidadGuardada | null | undefined): { resultado: ResultadoSaldo; motivo: string } | null {
  if (!c || (c.estado !== "cuadra" && c.estado !== "no_cuadra" && c.estado !== "no_verificable")) return null;
  if (c.estado === "cuadra") return { resultado: "cuadra", motivo: "El saldo cuadra: el saldo anterior más los créditos menos los débitos da el saldo siguiente en todas las filas." };
  if (c.estado === "no_cuadra") {
    const cuantas = c.fallos !== undefined && c.verificados !== undefined ? `En ${c.fallos} de ${c.verificados} comparaciones el saldo no cuadra. ` : "El saldo no cuadra. ";
    return { resultado: "no_cuadra", motivo: `${cuantas}Este archivo no cuenta como estado de cuenta completo: los pagos de esa sociedad quedan en «Sin información» hasta revisarlo.` };
  }
  return { resultado: "no_verificable", motivo: `No se puede comprobar el saldo: ${TEXTO_RAZON[razonDeContinuidad(c) ?? "otro"]}. La cobertura sigue por fechas.` };
}
