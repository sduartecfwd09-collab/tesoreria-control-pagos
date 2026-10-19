import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { definicionDe, validarValor } from "../domain/parametros.js";
import { actualizarValor, listarParametros, obtenerParametro } from "../repositories/parametros.js";

export async function rutasParametros(app: FastifyInstance) {
  app.get("/api/parametros", async () => {
    const filas = await listarParametros();
    return {
      datos: filas.map((p) => {
        const def = definicionDe(p.clave, p.ambito);
        return {
          id: p.id,
          clave: p.clave,
          valor: p.valor,
          tipo: p.tipo,
          ambito: p.ambito,
          categoria: p.categoria,
          etiqueta: def?.etiqueta ?? p.clave,
          ayuda: def?.ayuda ?? p.descripcion ?? "",
          unidad: def?.unidad ?? null,
          min: def?.min ?? null,
          max: def?.max ?? null,
          opciones: def?.opciones ?? null,
          supuesto: def?.supuesto ?? false,
          actualizado: p.actualizado.toISOString(),
        };
      }),
    };
  });

  app.put("/api/parametros/:id", async (req, reply) => {
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const cuerpo = z.object({ valor: z.union([z.string(), z.number()]) }).safeParse(req.body);
    if (!cuerpo.success) return reply.code(400).send({ error: "Falta el campo «valor»" });

    const actual = await obtenerParametro(id.data);
    if (!actual) return reply.code(404).send({ error: "Parámetro no encontrado" });
    const def = definicionDe(actual.clave, actual.ambito);
    if (!def) return reply.code(422).send({ error: "Parámetro sin definición" });

    let valor: string;
    try {
      valor = validarValor(def, cuerpo.data.valor);
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
      return reply.code(422).send({ error: msg ?? "Valor inválido" });
    }
    const guardado = await actualizarValor(id.data, valor);
    return {
      datos: { id: guardado.id, clave: guardado.clave, valor: guardado.valor, actualizado: guardado.actualizado.toISOString() },
    };
  });
}
