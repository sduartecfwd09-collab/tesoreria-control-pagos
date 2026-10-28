import { normalizar } from "../ingest/utiles.js";

export const ROL_JEFATURA = "Jefatura"; // ve todo y administra (sociedades, categorías, usuarios)
export const ROL_TESORERO = "Tesorero"; // ve y trabaja solo sus sociedades
export const ROLES = [ROL_JEFATURA, ROL_TESORERO] as const;
export type NombreRol = (typeof ROLES)[number];

/** Clave de comparación del nombre de una persona: sin mayúsculas, tildes ni espacios sobrantes. */
export const normalizarNombrePersona = (nombre: string): string => normalizar(nombre);

/** Correo en minúsculas y sin espacios. */
export const normalizarCorreo = (correo: string): string => correo.replace(/\s+/g, "").toLowerCase();

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const correoValido = (correo: string): boolean => FORMATO_CORREO.test(correo) && correo.length <= 254;

/** "jefatura", "JEFATURA" o "Jefatura " son el rol Jefatura; «Usuario» (nombre anterior) y «Tesorero» son el rol Tesorero; cualquier otro texto no es un rol. */
export function rolDesdeTexto(texto: string): NombreRol | null {
  const t = normalizar(texto);
  if (t === "usuario") return ROL_TESORERO;
  return ROLES.find((r) => normalizar(r) === t) ?? null;
}
