import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fijarDiasAviso, listarUsuariosConAviso } from "../repositories/usuarios.js";
import { diasDeAviso } from "../vencimientos/generar.js";

// Aviso propio de cada tesorero. Por ahora lo edita cualquiera; cuando exista el inicio de sesión, solo Jefatura y cada
// tesorero el suyo (ruta privada por defecto: el control de acceso llega con el inicio de sesión de Microsoft).
export async function rutasAvisos(app: FastifyInstance) {
  app.get("/api/avisos-tesoreros", async () => {
    const general = await diasDeAviso();
    return {
      general,
      datos: (await listarUsuariosConAviso()).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol.nombre, diasAviso: u.diasAviso, diasEfectivos: u.diasAviso ?? general })),
    };
  });

  app.put("/api/avisos-tesoreros/:id", async (req, reply) => {
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const cuerpo = z.object({ diasAviso: z.union([z.null(), z.number({ error: "Indique un número de días o déjelo vacío" }).int("Debe ser un número entero").min(0, "Debe ser al menos 0").max(60, "Debe ser como máximo 60")]) }).safeParse(req.body);
    if (!cuerpo.success) return reply.code(422).send({ error: cuerpo.error.issues[0]?.message ?? "Valor inválido" });
    const existe = (await listarUsuariosConAviso()).some((u) => u.id === id.data);
    if (!existe) return reply.code(404).send({ error: "Usuario no encontrado" });
    const u = await fijarDiasAviso(id.data, cuerpo.data.diasAviso);
    return { datos: { id: u.id, nombre: u.nombre, diasAviso: u.diasAviso, diasEfectivos: u.diasAviso ?? (await diasDeAviso()) } };
  });
}
