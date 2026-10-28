// Pantalla «Avisos»: qué vencimientos requieren atención y de quién son. Puro: no calcula estados (los decide el motor de cruce).
import { normalizarNombrePersona } from "./usuarios.js";

export const GRUPOS_AVISO = [
  { clave: "vencidos", titulo: "Vencidos", estados: ["vencido"] },
  { clave: "por_vencer", titulo: "Por vencer", estados: ["por_vencer"] },
  { clave: "programados", titulo: "Programados", estados: ["proyectado"] },
  { clave: "por_revisar", titulo: "Por revisar", estados: ["por_revisar"] },
  { clave: "sin_informacion", titulo: "Sin información", estados: ["sin_informacion"] },
] as const;

export type ClaveGrupoAviso = (typeof GRUPOS_AVISO)[number]["clave"];

export const ESTADOS_DE_AVISOS: string[] = GRUPOS_AVISO.flatMap((g) => [...g.estados]);

export const grupoDeAviso = (estado: string): ClaveGrupoAviso | null =>
  GRUPOS_AVISO.find((g) => (g.estados as readonly string[]).includes(estado))?.clave ?? null;

/** ¿La obligación es de este usuario? Su responsable propio o, si no tiene, el tesorero de su sociedad. */
export function esDelUsuario(
  u: { id: number; nombreNormalizado: string },
  o: { responsable: string | null; sociedad: { tesoreroId: number | null } },
): boolean {
  return o.responsable ? normalizarNombrePersona(o.responsable) === u.nombreNormalizado : o.sociedad.tesoreroId === u.id;
}

/** Identificador enmascarado a sus últimos 4 caracteres. */
export const identificadorEnmascarado = (id: string): string => `****${id.replace(/\s+/g, "").slice(-4)}`;
