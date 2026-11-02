import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ACCIONES_DE, TIPOS_DIFERENCIA, type AccionDiferencia, type TipoDiferencia } from "../domain/diferencias-excel.js";
import { enmascararIdentificador } from "../domain/enmascarar.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import type { Reloj } from "../domain/reloj.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { alcanceDe, alcanceParaRespuesta, sociedadesDelAlcance } from "../identidad/alcance.js";
import { autorDe, exigirPersona, puedeEscribirEnSociedad, SIN_PERMISO_SOCIEDAD } from "../identidad/exigir-persona.js";
import { listarDiferencias, resolverDiferencia } from "../diferencias/servicio.js";
import { filasDelArchivo, type FuenteDeFilas } from "../diferencias/fuente-excel.js";

const consulta = z.object({
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive().optional(),
  tipo: z.enum(TIPOS_DIFERENCIA as [TipoDiferencia, ...TipoDiferencia[]], { error: "El tipo de diferencia no es válido" }).optional(),
  estado: z.enum(["pendiente", "decidida"], { error: "El estado debe ser pendiente o decidida" }).optional(),
});

const ACCIONES = Object.values(ACCIONES_DE).flat();

/**
 * «Diferencias con el Excel» (privada). Sin persona identificada, 401. Jefatura ve todas; un Tesorero, las de las sociedades de las que es tesorero
 * vigente (función de alcance única). Resolver exige además la sociedad propia (403) y un motivo (3 a 300). Nunca devuelve identificadores completos ni rutas.
 */
export async function rutasDiferenciasExcel(app: FastifyInstance, opts: { modoPruebas: boolean; reloj: Reloj; fuente?: FuenteDeFilas }) {
  const fuente = opts.fuente ?? filasDelArchivo;

  app.get("/api/diferencias-excel", async (req, reply) => {
    const persona = await exigirPersona(req, reply, opts.modoPruebas);
    if (!persona) return reply;
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const sociedadesPropias = await sociedadesDelAlcance(alcance);
    const { disponible, filas } = await listarDiferencias(fuente);
    const delAlcance = filas.filter((f) => (!sociedadesPropias || sociedadesPropias.includes(f.sociedadId)) && (q.data.sociedadId === undefined || f.sociedadId === q.data.sociedadId));
    const pendientes = delAlcance.filter((f) => f.estado === "pendiente");
    const resumen = Object.fromEntries(TIPOS_DIFERENCIA.map((t) => [t, pendientes.filter((f) => f.tipo === t).length]));
    const visibles = delAlcance.filter((f) => (q.data.tipo === undefined || f.tipo === q.data.tipo) && (q.data.estado === undefined || f.estado === q.data.estado));
    const orden = (a: { sociedadNombre: string; plataforma: { proveedor: string } }, b: typeof a) => a.sociedadNombre.localeCompare(b.sociedadNombre, "es") || a.plataforma.proveedor.localeCompare(b.plataforma.proveedor, "es");
    return {
      datos: visibles.sort(orden).map((f) => {
        const puede = puedeEscribirEnSociedad(persona, { tesoreroId: f.tesoreroId });
        return {
          clave: f.clave, tipo: f.tipo, estado: f.estado, sociedadId: f.sociedadId, sociedad: etiquetaSociedad({ nombreLargo: f.sociedadNombre }),
          plataforma: { proveedor: f.plataforma.proveedor, identificador: enmascararIdentificador(f.plataforma.identificador), dia: f.plataforma.dia },
          excel: f.excel ? { proveedor: f.excel.proveedor, identificador: enmascararIdentificador(f.excel.identificador), dia: f.excel.dia } : null,
          decision: f.decision,
          // las acciones posibles solo se ofrecen en lo pendiente y a quien puede actuar
          acciones: f.estado === "pendiente" && puede ? ACCIONES_DE[f.tipo] : [],
          puedeGestionar: f.estado === "pendiente" && puede,
        };
      }),
      resumen, pendientes: pendientes.length, disponible, alcance: alcanceParaRespuesta(alcance),
    };
  });

  const cuerpoResolver = z.object({
    tipo: z.enum(TIPOS_DIFERENCIA as [TipoDiferencia, ...TipoDiferencia[]], { error: "Indique el tipo de diferencia" }),
    claves: z.array(z.string().min(1).max(40), { error: "Elija al menos una diferencia" }).min(1, "Elija al menos una diferencia").max(100, "Elija como máximo 100 diferencias a la vez"),
    accion: z.enum(ACCIONES as [AccionDiferencia, ...AccionDiferencia[]], { error: "Elija una acción" }),
  });

  app.post("/api/diferencias-excel/resolver", async (req, reply) => {
    const persona = await exigirPersona(req, reply, opts.modoPruebas);
    if (!persona) return reply;
    const cuerpo = (req.body ?? {}) as { motivo?: unknown; desdeMes?: unknown; aplicaAlMesEnCurso?: unknown };
    const p = cuerpoResolver.safeParse(req.body ?? {});
    if (!p.success) {
      const issue = p.error.issues[0]!;
      return reply.code(422).send({ error: issue.message, campo: String(issue.path[0] ?? "") });
    }
    const { tipo, claves, accion } = p.data;
    if (!ACCIONES_DE[tipo].includes(accion)) return reply.code(422).send({ error: "Esa acción no corresponde a este tipo de diferencia", campo: "accion" });
    if (accion === "usar_excel" && claves.length > 1) return reply.code(422).send({ error: "Para usar el día del Excel elija una diferencia a la vez", campo: "claves" });
    try {
      const { filas } = await listarDiferencias(fuente);
      const elegidas = claves.map((c) => filas.find((f) => f.clave === c && f.tipo === tipo));
      if (elegidas.some((f) => !f)) return reply.code(404).send({ error: "Diferencia no encontrada" });
      const todas = elegidas as NonNullable<(typeof elegidas)[number]>[];
      if (todas.some((f) => !puedeEscribirEnSociedad(persona, { tesoreroId: f.tesoreroId }))) return reply.code(403).send({ error: SIN_PERMISO_SOCIEDAD });
      if (todas.some((f) => f.estado === "decidida")) return reply.code(409).send({ error: "Esta diferencia ya está decidida." });
      for (const f of todas) {
        await resolverDiferencia({ diferencia: f, accion, motivo: cuerpo.motivo, desdeMes: cuerpo.desdeMes, aplicaAlMesEnCurso: cuerpo.aplicaAlMesEnCurso, autor: autorDe(persona, opts.modoPruebas) }, opts.reloj);
      }
      return { datos: { resueltas: todas.length } };
    } catch (e) {
      if (!(e instanceof ErrorDeServicio)) throw e;
      const estado = { permiso: 403, validacion: 422, no_encontrado: 404, conflicto: 409 }[e.codigo];
      return reply.code(estado).send({ error: e.message, ...(e.campo ? { campo: e.campo } : {}) });
    }
  });
}
