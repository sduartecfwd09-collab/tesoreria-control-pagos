// UNA sola regla de alcance para todas las pantallas operativas.
//  - Jefatura ve todo.
//  - Un Tesorero ve solo las obligaciones de las que es responsable efectivo (el responsable propio de la obligación o,
//    si no tiene, el tesorero de su sociedad) y, donde la pantalla es por sociedad (Estados de cuenta, Movimientos sin
//    obligación), las sociedades de su responsabilidad: aquellas de las que es tesorero o donde es responsable de alguna obligación.
//  - Sin persona elegida (todavía no hay inicio de sesión) se ve todo, como hoy, hasta el login (Hito 4A).
// «Mi configuración» no usa el alcance: siempre es personal.
import type { FastifyRequest } from "fastify";
import { esDelUsuario } from "../domain/avisos.js";
import { datosParaAlcance } from "../repositories/obligaciones.js";
import { usuarioActual } from "./usuario-actual.js";

export type Alcance = { tipo: "todo" } | { tipo: "mio"; usuario: { id: number; nombre: string; nombreNormalizado: string } };

export async function alcanceDe(req: FastifyRequest, modoPruebas: boolean): Promise<Alcance> {
  const u = await usuarioActual(req, modoPruebas);
  if (!u || u.rol === "Jefatura") return { tipo: "todo" };
  return { tipo: "mio", usuario: { id: u.id, nombre: u.nombre, nombreNormalizado: u.nombreNormalizado } };
}

/** Lo que cada respuesta informa para la línea «Viendo: lo de <nombre>» / «Viendo: todo». */
export const alcanceParaRespuesta = (a: Alcance): { tipo: "todo" | "mio"; nombre: string | null } => ({ tipo: a.tipo, nombre: a.tipo === "mio" ? a.usuario.nombre : null });

/** Identificadores de las obligaciones del alcance; null = todas. */
export async function obligacionesDelAlcance(a: Alcance): Promise<number[] | null> {
  if (a.tipo === "todo") return null;
  const { obligaciones } = await datosParaAlcance();
  return obligaciones.filter((o) => esDelUsuario(a.usuario, { responsable: o.responsable, sociedad: { tesoreroId: o.sociedad.tesoreroId } })).map((o) => o.id);
}

/** Identificadores de las sociedades del alcance; null = todas. */
export async function sociedadesDelAlcance(a: Alcance): Promise<number[] | null> {
  if (a.tipo === "todo") return null;
  const { obligaciones, sociedadesDeTesorero } = await datosParaAlcance(a.usuario.id);
  const propias = obligaciones.filter((o) => esDelUsuario(a.usuario, { responsable: o.responsable, sociedad: { tesoreroId: o.sociedad.tesoreroId } })).map((o) => o.sociedadId);
  return [...new Set([...sociedadesDeTesorero, ...propias])];
}
