import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { usuarioActual } from "../identidad/usuario-actual.js";
import { fijarPreferencias, listarTesoreros } from "../repositories/usuarios.js";
import { valorGlobal } from "../repositories/parametros.js";

// «Mi configuración» y el selector de tesorero temporal. El selector solo existe con MODO_PRUEBAS=true; cuando llegue el
// inicio de sesión de Microsoft (Hito 4A) se reemplaza `usuarioActual` y estas rutas no cambian.
const entero = async (clave: string, defecto: number) => {
  const n = Number(await valorGlobal(clave));
  return Number.isInteger(n) && n >= 0 ? n : defecto;
};

const valorOpcional = (max: number) =>
  z.number({ error: "Indique un número de días" }).int("Debe ser un número entero").min(0, "Debe ser al menos 0").max(max, `Debe ser como máximo ${max}`);

export async function rutasIdentidad(app: FastifyInstance, opts: { modoPruebas: boolean }) {
  app.get("/api/identidad", async () => ({ modoPruebas: opts.modoPruebas, tesoreros: opts.modoPruebas ? await listarTesoreros() : [] }));

  const sinUsuario = (reply: import("fastify").FastifyReply) =>
    reply.code(401).send({ error: opts.modoPruebas ? "Elija con qué tesorero está actuando." : "No hay una sesión iniciada." });

  const respuesta = async (u: { id: number; nombre: string; diasAviso: number | null; diasEspera: number | null }) => {
    const respaldoAviso = await entero("aviso_dias", 3);
    const respaldoEspera = await entero("dias_espera_vencido", 3);
    return { usuario: { id: u.id, nombre: u.nombre }, diasAviso: u.diasAviso ?? respaldoAviso, diasEspera: u.diasEspera ?? respaldoEspera, propios: { diasAviso: u.diasAviso, diasEspera: u.diasEspera } };
  };

  app.get("/api/mi-configuracion", async (req, reply) => {
    const u = await usuarioActual(req, opts.modoPruebas);
    if (!u) return sinUsuario(reply);
    return { datos: await respuesta(u) };
  });

  app.put("/api/mi-configuracion", async (req, reply) => {
    const u = await usuarioActual(req, opts.modoPruebas);
    if (!u) return sinUsuario(reply);
    const r = z.object({ diasAviso: valorOpcional(60), diasEspera: valorOpcional(15) }).safeParse(req.body);
    if (!r.success) return reply.code(422).send({ error: r.error.issues[0]?.message ?? "Valor inválido" });
    return { datos: await respuesta(await fijarPreferencias(u.id, r.data)) };
  });
}
