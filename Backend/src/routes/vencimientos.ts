import type { FastifyInstance } from "fastify";
import { aNumero } from "../domain/montos.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { z } from "zod";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { esPeriodo, MAX_MESES_GENERACION, periodosEntre } from "../domain/vencimientos.js";
import { listarVencimientos, periodosGenerados } from "../repositories/vencimientos.js";
import { generarVencimientos, hayGeneracionEnCurso } from "../vencimientos/generar.js";

const periodo = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM)` }).refine(esPeriodo, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe tener el formato AAAA-MM (por ejemplo 2026-08)`);

const consulta = z.object({
  sociedad: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive("La sociedad debe ser un número").optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  periodo: periodo("el periodo").optional(),
  desde: periodo("el mes inicial").optional(),
  hasta: periodo("el mes final").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(500, "Se pueden pedir como máximo 500 por página").default(50),
});

const cuerpoGenerar = z
  .object({ desde: periodo("el mes inicial"), hasta: periodo("el mes final") }, { error: "Indique desde y hasta (AAAA-MM)" })
  .refine((c) => c.desde <= c.hasta, { message: "El mes inicial no puede ser posterior al mes final", path: ["hasta"] })
  .refine((c) => periodosEntre(c.desde, c.hasta).length <= MAX_MESES_GENERACION, {
    message: `Se pueden generar como máximo ${MAX_MESES_GENERACION} meses a la vez`,
    path: ["hasta"],
  });

export async function rutasVencimientos(app: FastifyInstance, opts: { reloj: Reloj }) {
  app.post("/api/vencimientos/generar", async (req, reply) => {
    const r = cuerpoGenerar.safeParse(req.body ?? {});
    if (!r.success) {
      const i = r.error.issues[0];
      return reply.code(422).send({ error: i?.message ?? "Datos inválidos", ...(i?.path[0] ? { campo: String(i.path[0]) } : {}) });
    }
    if (hayGeneracionEnCurso()) return reply.code(409).send({ error: "Ya hay una generación de vencimientos en curso" });
    return { datos: await generarVencimientos(r.data.desde, r.data.hasta) };
  });

  app.get("/api/vencimientos/periodos", async () => ({ datos: await periodosGenerados() }));

  app.get("/api/vencimientos", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const hoy = hoyDe(opts.reloj);
    const { total, datos } = await listarVencimientos(q.data);
    return {
      datos: datos.map((v) => ({
        id: v.id,
        obligacionId: v.obligacionId,
        sociedad: etiquetaSociedad(v.obligacion.sociedad),
        categoria: v.obligacion.categoria.nombre,
        proveedor: v.obligacion.proveedor,
        identificador: v.obligacion.identificador,
        frecuencia: v.obligacion.frecuencia,
        periodo: v.periodo,
        fecha: v.fecha.toISOString().slice(0, 10),
        montoEsperado: aNumero(v.montoEsperado),
        moneda: v.obligacion.moneda,
        estado: v.estado,
        conciliado: v._count.conciliaciones > 0,
        futuro: v.fecha >= hoy,
      })),
      total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
      hoy: hoy.toISOString().slice(0, 10),
    };
  });
}
