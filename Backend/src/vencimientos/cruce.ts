// Ejecuta el motor de cruce sobre la base: carga datos, calcula y guarda solo lo que cambió. Solo escribe en la base
// de datos (columnas de Vencimiento); no toca los archivos de estados de cuenta ni el catálogo.
import { cruzar, type EstadisticasCruce, type ResultadoCruce } from "../domain/cruce.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { cargarDatosCruce, preferenciasPorObligacion, guardarResultadosCruce, type DatosCruce } from "../repositories/cruce.js";
import { valorGlobal } from "../repositories/parametros.js";
import { diasDeAviso } from "./generar.js";

export interface ResumenCruce {
  vencimientos: number;
  cambiados: number;
  porEstado: Record<string, number>;
  resultados: ResultadoCruce[];
  estadisticas: EstadisticasCruce;
  datos: DatosCruce;
  parametros: { diasAntes: number; diasDespues: number; diasAviso: number; avisoPorObligacion: Map<number, number>; esperaPorObligacion: Map<number, number>; diasEspera: number; marcarVencidoSinEstado: boolean; hoy: Date };
}

const entero = async (clave: string, defecto: number) => {
  const n = Number(await valorGlobal(clave));
  return Number.isInteger(n) && n >= 0 ? n : defecto;
};

/** Los parámetros del cruce tal como están en la base para un «hoy» dado. Solo lee. */
export async function parametrosDeCruce(hoy: Date): Promise<ResumenCruce["parametros"]> {
  const preferencias = await preferenciasPorObligacion();
  return {
    diasAntes: await entero("ventana_dias_antes", 10),
    diasDespues: await entero("ventana_dias_despues", 12),
    diasAviso: await diasDeAviso(),
    avisoPorObligacion: preferencias.aviso,
    esperaPorObligacion: preferencias.espera,
    diasEspera: await entero("dias_espera_vencido", 3),
    marcarVencidoSinEstado: (await valorGlobal("marcar_vencido_sin_estado")) === "si",
    hoy,
  };
}

/** Recalcula el estado de todos los vencimientos de obligaciones activas. Determinista e idempotente. */
export async function cruzarVencimientos(reloj: Reloj): Promise<ResumenCruce> {
  const datos = await cargarDatosCruce();
  const parametros = await parametrosDeCruce(hoyDe(reloj));
  const { resultados, estadisticas } = cruzar({ ...datos, ...parametros });
  const cambiados = await guardarResultadosCruce(datos.vencimientos, resultados);
  const porEstado: Record<string, number> = {};
  for (const r of resultados) porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1;
  return { vencimientos: resultados.length, cambiados, porEstado, resultados, estadisticas, datos, parametros };
}
