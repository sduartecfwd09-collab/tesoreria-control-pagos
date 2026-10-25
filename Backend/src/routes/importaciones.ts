import { stat } from "node:fs/promises";
import { etiquetaSociedad } from "../domain/sociedades.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { calcularCobertura } from "../domain/cobertura.js";
import { hayImportacionEnCurso, importarCarpeta } from "../ingest/importar-carpeta.js";
import { actualizarCuentaManual } from "../repositories/importaciones.js";
import { listarArchivos, listarCuentas, listarMovimientos } from "../repositories/consultas.js";

type DetalleArchivo = {
  advertencias?: string[];
  discrepancias?: { tipo: string; mensaje: string }[];
  continuidad?: unknown;
  monedaOrigen?: string;
  filasPieIgnoradas?: number;
};

const consulta = z.object({
  sociedad: z.string().trim().min(1).optional(),
  cuenta: z.string().trim().min(1).optional(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "El periodo debe ser AAAA-MM").optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(500).default(50),
});

export async function rutasImportaciones(app: FastifyInstance) {
  app.post("/api/importaciones", async (_req, reply) => {
    const raiz = env.STATEMENTS_ROOT;
    if (!raiz) return reply.code(422).send({ error: "STATEMENTS_ROOT no está configurada en el servidor" });
    try {
      if (!(await stat(raiz)).isDirectory()) throw new Error();
    } catch {
      return reply.code(422).send({ error: "La carpeta de estados de cuenta (STATEMENTS_ROOT) no existe o no es accesible" });
    }
    if (hayImportacionEnCurso()) return reply.code(409).send({ error: "Ya hay una importación en curso" });
    const r = await importarCarpeta(raiz);
    return { datos: r };
  });

  app.get("/api/importaciones", async () => {
    const archivos = await listarArchivos();
    const datos = archivos.map((a) => {
      const d = (a.detalle ?? {}) as DetalleArchivo;
      return {
        id: a.id, ruta: a.ruta, sociedad: a.sociedad, cuenta: a.cuenta, formato: a.formato, mes: a.mes,
        estado: a.estado, movimientos: a.numMovimientos, duplicados: a.numDuplicados, error: a.error,
        advertencias: d.advertencias ?? [], discrepancias: d.discrepancias ?? [],
        continuidad: d.continuidad ?? null, monedaOrigen: d.monedaOrigen ?? null,
        leidoEn: a.leidoEn?.toISOString() ?? null,
      };
    });
    return {
      datos,
      resumen: {
        archivos: datos.length,
        leidos: datos.filter((a) => a.estado === "leido").length,
        conError: datos.filter((a) => a.estado === "error").length,
        movimientos: datos.reduce((s, a) => s + a.movimientos, 0),
      },
      enCurso: hayImportacionEnCurso(),
    };
  });

  app.get("/api/cobertura", async () => {
    const archivos = await listarArchivos();
    return { datos: calcularCobertura(archivos) };
  });

  app.get("/api/movimientos", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const { total, datos } = await listarMovimientos(q.data);
    return { datos, total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)) };
  });

  app.get("/api/cuentas", async () => {
    const cuentas = await listarCuentas();
    return {
      datos: cuentas.map((c) => ({
        id: c.id, sociedad: etiquetaSociedad(c.sociedad), numero: c.numero, banco: c.banco, bancoPorConfirmar: c.bancoPorConfirmar,
        codigoBanco: c.codigoBanco, formato: c.formato, moneda: c.moneda, monedaPorConfirmar: c.monedaPorConfirmar,
      })),
    };
  });

  // Tesorería confirma a mano el banco y/o la moneda de una cuenta (la importación ya no los pisa).
  app.patch("/api/cuentas/:id", async (req, reply) => {
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    const cuerpo = z
      .object({ banco: z.string().trim().min(1).max(60).optional(), moneda: z.enum(["CRC", "USD"]).optional() })
      .refine((c) => c.banco !== undefined || c.moneda !== undefined, "Indique banco o moneda")
      .safeParse(req.body);
    if (!id.success || !cuerpo.success) return reply.code(400).send({ error: cuerpo.success ? "Identificador inválido" : (cuerpo.error.issues[0]?.message ?? "Datos inválidos") });
    try {
      const c = await actualizarCuentaManual(id.data, cuerpo.data);
      return { datos: { id: c.id, banco: c.banco, bancoPorConfirmar: c.bancoPorConfirmar, moneda: c.moneda, monedaPorConfirmar: c.monedaPorConfirmar } };
    } catch {
      return reply.code(404).send({ error: "Cuenta no encontrada" });
    }
  });
}
