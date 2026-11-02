// Permisos de las acciones de Tesorería. Son reglas puras: reciben a quien actúa (un usuario ya cargado) y la
// sociedad afectada. La identidad real de quien actúa llega con el inicio de sesión (Hito 4A); mientras tanto
// ningún endpoint llama a estos servicios, y no hay identidad provisional.
import { ROL_JEFATURA } from "./usuarios.js";

export interface Actor {
  id: number;
  activo: boolean;
  rol: string;
}

/** Jefatura ve y administra todo. */
export const esJefatura = (a: Actor): boolean => a.activo && a.rol === ROL_JEFATURA;

/** El tesorero asignado a la sociedad (en sus sociedades) y Jefatura (en todas). */
export const puedeCambiarDiaDe = (a: Actor, sociedad: { tesoreroId: number | null }): boolean =>
  esJefatura(a) || (a.activo && sociedad.tesoreroId !== null && sociedad.tesoreroId === a.id);

/** Solo Jefatura crea, desactiva y borra categorías. */
export const puedeAdministrarCategorias = (a: Actor): boolean => esJefatura(a);

export type CodigoErrorServicio = "permiso" | "validacion" | "no_encontrado" | "conflicto";

/** Error de un servicio de dominio: el mensaje es texto claro en español, sin datos sensibles. */
export class ErrorDeServicio extends Error {
  constructor(
    readonly codigo: CodigoErrorServicio,
    mensaje: string,
    /** el dato del formulario al que se refiere el error (motivo, nota...) */
    readonly campo?: string,
  ) {
    super(mensaje);
  }
}
