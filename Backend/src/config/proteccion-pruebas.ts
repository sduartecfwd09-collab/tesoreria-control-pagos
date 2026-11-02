// Cada corrida de pruebas borra todo el contenido de su base. Para que nunca pueda apuntar por error a la base
// de desarrollo o a la de produccion, el codigo de pruebas se niega a correr si el nombre de la base no termina
// en _test. Sin dependencias: lo usan vitest.config.ts, el globalSetup y cada archivo de pruebas.
export function nombreDeBaseDe(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

/** Devuelve la direccion si la base termina en _test; si no, lanza un error (sin mostrar la direccion). */
export function exigirBaseDePruebas(url: string | undefined, variable = "TEST_DATABASE_URL"): string {
  if (!url) throw new Error(`${variable} no esta definida: las pruebas no corren sin una base de pruebas.`);
  const nombre = nombreDeBaseDe(url);
  if (!nombre.endsWith("_test")) {
    throw new Error(`Las pruebas se niegan a correr: el nombre de la base de ${variable} debe terminar en _test (cada corrida borra todo).`);
  }
  return url;
}
