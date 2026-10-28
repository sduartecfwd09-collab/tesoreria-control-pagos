// Identidad temporal de la persona que actúa. ÚNICO punto del Frontend que sabe quién es el usuario: en el Hito 4A lo
// reemplaza la sesión de Microsoft (este módulo devolverá el encabezado de la sesión o nada) sin tocar las pantallas.
// Solo se usa cuando /api/identidad informa modoPruebas=true; el id elegido vive en este navegador.
const CLAVE = "tesorero-actual";

export function obtenerUsuarioActual(): number | null {
  try {
    const v = window.localStorage.getItem(CLAVE);
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function guardarUsuarioActual(id: number | null): void {
  try {
    if (id === null) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, String(id));
  } catch {
    // sin almacenamiento disponible: la elección no se conserva
  }
}

/** Encabezado que se agrega a todas las llamadas a la API (vacío si no hay tesorero elegido o no se está en el navegador). */
export function encabezadoUsuario(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = obtenerUsuarioActual();
  return id === null ? {} : { "X-Usuario-Actual": String(id) };
}
