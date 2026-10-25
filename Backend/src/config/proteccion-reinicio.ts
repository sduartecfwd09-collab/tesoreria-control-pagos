// db:reiniciar borra todo el contenido de una base. Por eso solo corre contra una base de DESARROLLO, reconocida
// por una regla positiva: nombre terminado en _dev y servidor local. Una base _test (tiene su propio reinicio) o
// cualquier otra (producción incluida) se rechaza. Los mensajes nunca muestran la dirección (puede traer la clave).
import { nombreDeBaseDe } from "./proteccion-pruebas.js";

const SERVIDORES_LOCALES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Devuelve la dirección si es una base de desarrollo local; si no, lanza un error. */
export function exigirBaseDeDesarrollo(url: string | undefined, entorno: string | undefined = process.env.NODE_ENV): string {
  if (!url) throw new Error("DATABASE_URL no esta definida: no hay base de desarrollo que reiniciar.");
  if (entorno === "production") throw new Error("Se niega a reiniciar: NODE_ENV es production.");
  const nombre = nombreDeBaseDe(url);
  if (nombre.endsWith("_test")) throw new Error("Se niega a reiniciar: es una base de pruebas (_test). Las pruebas la reinician solas.");
  if (!nombre.endsWith("_dev")) throw new Error("Se niega a reiniciar: solo se reinician bases de desarrollo (nombre terminado en _dev).");
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("La direccion de la base no tiene un formato valido.");
  }
  if (!SERVIDORES_LOCALES.has(host)) throw new Error("Se niega a reiniciar: la base no esta en este computador (solo 127.0.0.1).");
  return url;
}
