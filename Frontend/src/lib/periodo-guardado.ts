// Cada pantalla guarda su propio período (mes o rango) mientras la persona trabaja: al volver a ella queda donde la dejó.
// Es solo una comodidad de esta pestaña del navegador (sessionStorage): si no está disponible, la pantalla abre en su valor por defecto.

export function leerPeriodo<T>(clave: string): T | null {
  try {
    const t = window.sessionStorage.getItem(`periodo:${clave}`);
    return t ? (JSON.parse(t) as T) : null;
  } catch {
    return null;
  }
}

export function guardarPeriodo(clave: string, valor: unknown): void {
  try {
    window.sessionStorage.setItem(`periodo:${clave}`, JSON.stringify(valor));
  } catch {
    // sin almacenamiento: no se recuerda el período, nada más
  }
}
