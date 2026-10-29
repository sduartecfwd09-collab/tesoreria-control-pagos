import type { FastifyInstance } from "fastify";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance, sociedadesDelAlcance } from "../identidad/alcance.js";
import { SELECTOR_ANIOS_ATRAS_DEFECTO, SELECTOR_MESES_ADELANTE_DEFECTO, ventanaDelSelector } from "../domain/historico.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { limitesDeMovimientos, limitesDeVencimientos } from "../repositories/fechas.js";
import { valorGlobal } from "../repositories/parametros.js";

const entero = async (clave: string, respaldo: number) => {
  const n = Number(await valorGlobal(clave));
  return Number.isInteger(n) && n >= 0 ? n : respaldo;
};

// Solo lectura, privada y con el mismo alcance que el resto de las pantallas. Informa la fecha de hoy según el servidor (zona de
// Costa Rica), la ventana por la que se puede navegar en el selector de fechas (años hacia atrás y meses hacia adelante, parámetros)
// y la primera y la última fecha con datos (para decir «sin información» o «todavía no hay vencimientos»). Solo fechas, nunca filas.
export async function rutasFechas(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  app.get("/api/fechas/limites", async (req) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const hoy = hoyDe(opts.reloj).toISOString().slice(0, 10);
    const [vencimientos, movimientos, atras, adelante] = await Promise.all([
      limitesDeVencimientos(await obligacionesDelAlcance(alcance)),
      limitesDeMovimientos(await sociedadesDelAlcance(alcance)),
      entero("selector_anios_atras", SELECTOR_ANIOS_ATRAS_DEFECTO),
      entero("selector_meses_adelante", SELECTOR_MESES_ADELANTE_DEFECTO),
    ]);
    const ventana = ventanaDelSelector(hoy, atras, adelante);
    return { alcance: alcanceParaRespuesta(alcance), hoy, ventana: { primera: ventana.desde, ultima: ventana.hasta }, vencimientos, movimientos };
  });
}
