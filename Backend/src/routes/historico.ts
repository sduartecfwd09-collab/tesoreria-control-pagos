import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { coberturaDelPeriodo, HISTORICO_MESES_DEFECTO, rangoPorDefecto } from "../domain/historico.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { aNumero } from "../domain/montos.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { esFechaIso } from "../domain/vencimientos.js";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance, sociedadesDelAlcance } from "../identidad/alcance.js";
import { limitesDeMovimientos } from "../repositories/fechas.js";
import { valorGlobal } from "../repositories/parametros.js";
import { listarVencimientos } from "../repositories/vencimientos.js";

const ESTADOS = ["proyectado", "por_vencer", "vencido", "pagado", "pagado_con_inconsistencia", "sin_informacion", "por_revisar", "justificado"] as const;

const fecha = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM-DD)` }).refine(esFechaIso, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe ser una fecha válida con el formato AAAA-MM-DD (por ejemplo 2026-08-15)`);

const consulta = z.object({
  desde: fecha("la fecha inicial").optional(),
  hasta: fecha("la fecha final").optional(),
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive("La sociedad debe ser un número").optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  estado: z.string().transform((t) => t.split(",").map((e) => e.trim()).filter(Boolean)).pipe(z.array(z.enum(ESTADOS)).max(ESTADOS.length, "Estado inválido")).optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(200, "Se pueden pedir como máximo 200 por página").default(50),
}).refine((c) => !c.desde || !c.hasta || c.desde <= c.hasta, { message: "La fecha inicial no puede ser posterior a la final" });

/**
 * Histórico (solo lectura, privado, con alcance): los vencimientos de las obligaciones del catálogo con su pago cruzado, filtrados por
 * fecha de vencimiento, del más reciente al más antiguo y paginados en el servidor. No incluye movimientos del banco sin obligación.
 * El estado es el actual (calculado); la línea de tiempo se abre desde el detalle del vencimiento (GET /api/vencimientos/:id).
 */
export async function rutasHistorico(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  app.get("/api/historico", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const hoy = hoyDe(opts.reloj).toISOString().slice(0, 10);
    const meses = Number(await valorGlobal("historico_meses"));
    const porDefecto = rangoPorDefecto(hoy, Number.isInteger(meses) && meses > 0 ? meses : HISTORICO_MESES_DEFECTO);
    const rango = { desde: q.data.desde ?? porDefecto.desde, hasta: q.data.hasta ?? porDefecto.hasta };
    if (rango.desde > rango.hasta) return reply.code(400).send({ error: "La fecha inicial no puede ser posterior a la final" });

    const alcance = await alcanceDe(req, opts.modoPruebas);
    const obligacionIds = (await obligacionesDelAlcance(alcance)) ?? undefined;
    const { total, datos, resumen } = await listarVencimientos({
      obligacionIds, sociedadId: q.data.sociedadId, categoria: q.data.categoria, q: q.data.q, estados: q.data.estado,
      fechaDesde: rango.desde, fechaHasta: rango.hasta, orden: "desc", pagina: q.data.pagina, porPagina: q.data.porPagina,
    });
    const cobertura = await limitesDeMovimientos(await sociedadesDelAlcance(alcance));
    return {
      datos: datos.map((v) => ({
        id: v.id,
        sociedad: etiquetaSociedad(v.sociedad),
        proveedor: v.proveedor,
        categoria: v.categoria.nombre,
        periodo: v.periodo,
        fecha: v.fecha.toISOString().slice(0, 10),
        estado: v.estado,
        pago: v.movimiento
          ? { fecha: v.movimiento.fecha.toISOString().slice(0, 10), monto: aNumero(v.movimiento.debito), moneda: v.movimiento.cuenta.moneda, banco: v.movimiento.cuenta.banco, cuenta: enmascararCuenta(v.movimiento.cuenta.numero) }
          : null,
      })),
      alcance: alcanceParaRespuesta(alcance),
      rango,
      porDefecto: q.data.desde === undefined && q.data.hasta === undefined,
      coberturaEstados: cobertura,
      cobertura: coberturaDelPeriodo(rango, cobertura),
      resumen,
      total,
      pagina: q.data.pagina,
      porPagina: q.data.porPagina,
      paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
    };
  });
}
