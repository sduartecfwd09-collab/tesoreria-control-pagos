import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { PoolConfig } from "mariadb";

// Convierte una dirección mysql://usuario:clave@127.0.0.1:3306/base en la configuración del adaptador.
// Nunca incluye la dirección en los errores: puede traer la clave.
export function configDesdeUrl(url: string): PoolConfig {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("La dirección de la base no tiene el formato mysql://usuario:clave@127.0.0.1:3306/base");
  }
  if (u.protocol !== "mysql:") throw new Error("La dirección de la base debe empezar con mysql://");
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    connectionLimit: 5,
  };
}

export function nombreDeBase(url: string): string {
  return configDesdeUrl(url).database ?? "";
}

export function crearAdaptador(url: string): PrismaMariaDb {
  return new PrismaMariaDb(configDesdeUrl(url));
}
