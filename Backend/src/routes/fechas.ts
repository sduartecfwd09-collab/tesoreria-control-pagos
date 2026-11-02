import type { FastifyInstance } from "fastify";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance, sociedadesDelAlcance } from "../identidad/alcance.js";
import { SELECTOR_ANIOS_ATRAS_DEFECTO, SELECTOR_MESES_ADELANTE_DEFECTO, ventanaDelSelector } from "../domain/historico.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { limitesDeMovimientos, limitesDeVencimientos } from "../repositories/fechas.js";
import { valorGlobal } from "../repositories/parametros.js";

// Si la fila del parámetro no existe (la base no pasó por el seed), `Number(null)` daría 0 y la ventana se reduciría al mes en curso:
// un valor ausente o vacío usa el respaldo.
const entero = async (clave: string, respaldo: number) => {
  const texto = await valorGlobal(clave);
  if (texto === null || texto.trim() === "") return respaldo;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 0 ? n : respaldo;
};

// Solo lectura, privada y con el mismo alcance que el resto de las pantallas. Informa la fecha de hoy según el servidor (zona de
// Costa Rica), la ventana por la que se puede navegar en el selector de fechas (años hacia atrás y meses hacia adelante, parámetros)
// y la primera y la última fecha con datos (para decir «sin información» o «todavía no hay vencimientos»). Solo fechas, nunca filas.
export async function rutasFechas(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  // Solo la fecha de hoy (zona de Costa Rica), para la línea «Hoy» del encabezado: sin consultas a la base.
  app.get("/api/hoy", async () => ({ hoy: hoyDe(opts.reloj).toISOString().slice(0, 10) }));

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
