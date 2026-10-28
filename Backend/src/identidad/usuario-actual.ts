// Único lugar que decide quién es el usuario actual. Hoy lee el selector de tesorero de la pantalla (encabezado
// X-Usuario-Actual) y SOLO si MODO_PRUEBAS=true; en el Hito 4A lo reemplaza la sesión de Microsoft sin tocar las pantallas
// ni las rutas que lo usan. Sin modo de pruebas, el encabezado se ignora por completo.
import type { FastifyRequest } from "fastify";
import { obtenerTesorero } from "../repositories/usuarios.js";

export const ENCABEZADO_USUARIO = "x-usuario-actual";

export interface UsuarioActual { id: number; nombre: string; diasAviso: number | null; diasEspera: number | null }

export async function usuarioActual(req: FastifyRequest, modoPruebas: boolean): Promise<UsuarioActual | null> {
  if (!modoPruebas) return null;
  const crudo = req.headers[ENCABEZADO_USUARIO];
  const id = Number(Array.isArray(crudo) ? crudo[0] : crudo);
  if (!Number.isInteger(id) || id <= 0) return null;
  return obtenerTesorero(id);
}
