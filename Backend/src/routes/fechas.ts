import type { FastifyInstance } from "fastify";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance, sociedadesDelAlcance } from "../identidad/alcance.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { limitesDeMovimientos, limitesDeVencimientos } from "../repositories/fechas.js";

// Solo lectura, privada y con el mismo alcance que el resto de las pantallas. Informa la primera y la última fecha con datos
// (los límites del selector de fechas) y la fecha de hoy según el servidor (zona de Costa Rica). Solo fechas, nunca filas.
export async function rutasFechas(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  app.get("/api/fechas/limites", async (req) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const [vencimientos, movimientos] = await Promise.all([
      limitesDeVencimientos(await obligacionesDelAlcance(alcance)),
      limitesDeMovimientos(await sociedadesDelAlcance(alcance)),
    ]);
    return { alcance: alcanceParaRespuesta(alcance), hoy: hoyDe(opts.reloj).toISOString().slice(0, 10), vencimientos, movimientos };
  });
}
