import type { Parametro } from "./tipos";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly estado?: number,
  ) {
    super(message);
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${ruta}`, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ErrorApi("No se pudo conectar con el servidor. Verifique que el Backend esté encendido.");
  }
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(cuerpo.error ?? `Error ${r.status}`, r.status);
  return cuerpo as T;
}

export const api = {
  listarParametros: async () => (await pedir<{ datos: Parametro[] }>("/api/parametros")).datos,
  guardarParametro: (id: number, valor: string) =>
    pedir<{ datos: { id: number; valor: string; actualizado: string } }>(`/api/parametros/${id}`, {
      method: "PUT",
      body: JSON.stringify({ valor }),
    }),
};
