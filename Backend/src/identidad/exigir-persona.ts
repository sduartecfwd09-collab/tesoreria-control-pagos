// Entrada común de las acciones que cambian datos: exige una persona identificada (401 sin ella) y valida la sociedad
// con la regla de permisos que ya existe (`puedeCambiarDiaDe`: el tesorero vigente de la sociedad y Jefatura en todas).
// No toca `usuarioActual`: solo lo usa. Cuando llegue el inicio de sesión (Hito 4A) esto sigue igual.
import type { FastifyReply, FastifyRequest } from "fastify";
import { puedeCambiarDiaDe, type Actor } from "../domain/permisos.js";
import type { AutorDelCambio } from "../repositories/historial.js";
import { usuarioActual, type UsuarioActual } from "./usuario-actual.js";

export const SIN_PERMISO_SOCIEDAD = "No tiene permiso para cambiar obligaciones de esta sociedad";

/** La persona que actúa; sin ella responde 401 y devuelve null (quien llama debe terminar con `return reply`). */
export async function exigirPersona(req: FastifyRequest, reply: FastifyReply, modoPruebas: boolean): Promise<UsuarioActual | null> {
  const u = await usuarioActual(req, modoPruebas);
  if (!u) {
    reply.code(401).send({ error: modoPruebas ? "Elija con qué tesorero está actuando." : "No hay una sesión iniciada." });
    return null;
  }
  return u;
}

/** Quién queda anotado en el historial; `modoPruebas` es la misma bandera que reciben las rutas. */
export const autorDe = (u: UsuarioActual, modoPruebas: boolean): AutorDelCambio => ({ id: u.id, nombre: u.nombre, modoPruebas });

/** `usuarioActual` solo devuelve personas activas, por eso `activo` es siempre verdadero aquí. */
const comoActor = (u: UsuarioActual): Actor => ({ id: u.id, activo: true, rol: u.rol });

/** ¿Puede esta persona cambiar obligaciones de la sociedad dada? */
export const puedeEscribirEnSociedad = (u: UsuarioActual, sociedad: { tesoreroId: number | null }): boolean => puedeCambiarDiaDe(comoActor(u), sociedad);
