import type {
  CambiosObligacion, Categoria, Cobertura, FiltroObligaciones, FiltroVencimientos, Importaciones, Obligacion, Pagina,
  Parametro, Regeneracion, ResultadoImportacionCatalogo, ResumenCatalogo, Sociedad, Vencimiento,
} from "./tipos";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly estado?: number,
    /** campo del formulario al que se refiere el error (altas y ediciones) */
    readonly campo?: string,
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
  if (!r.ok) throw new ErrorApi(cuerpo.error ?? `Error ${r.status}`, r.status, cuerpo.campo);
  return cuerpo as T;
}

/** Arma ?a=1&b=2 omitiendo los valores vacíos. */
function consulta(f: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  listarImportaciones: () => pedir<Importaciones>("/api/importaciones"),
  obtenerCobertura: async () => (await pedir<{ datos: Cobertura }>("/api/cobertura")).datos,
  listarParametros: async () => (await pedir<{ datos: Parametro[] }>("/api/parametros")).datos,
  guardarParametro: (id: number, valor: string) =>
    pedir<{ datos: { id: number; valor: string; actualizado: string } }>(`/api/parametros/${id}`, {
      method: "PUT",
      body: JSON.stringify({ valor }),
    }),

  listarSociedades: async () => (await pedir<{ datos: Sociedad[] }>("/api/sociedades")).datos,
  listarCategorias: async () => (await pedir<{ datos: Categoria[] }>("/api/categorias")).datos,

  listarObligaciones: (f: FiltroObligaciones) => pedir<Pagina<Obligacion>>(`/api/obligaciones${consulta(f)}`),
  importarCatalogo: async () =>
    (await pedir<{ datos: ResultadoImportacionCatalogo }>("/api/catalogo/importar", { method: "POST" })).datos,
  resumenCatalogo: async () => (await pedir<{ datos: ResumenCatalogo }>("/api/obligaciones/resumen")).datos,
  crearObligacion: (c: CambiosObligacion) =>
    pedir<{ datos: Obligacion; regeneracion: Regeneracion }>("/api/obligaciones", { method: "POST", body: JSON.stringify(c) }),
  editarObligacion: (id: number, c: CambiosObligacion) =>
    pedir<{ datos: Obligacion; regeneracion: Regeneracion | null }>(`/api/obligaciones/${id}`, { method: "PATCH", body: JSON.stringify(c) }),

  listarVencimientos: (f: FiltroVencimientos) => pedir<Pagina<Vencimiento> & { hoy: string }>(`/api/vencimientos${consulta(f)}`),
  periodosGenerados: async () => (await pedir<{ datos: { periodo: string; total: number }[] }>("/api/vencimientos/periodos")).datos,
};
