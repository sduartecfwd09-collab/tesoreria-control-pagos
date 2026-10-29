import type {
  AvisoDatos, Avisos, CambiosObligacion, Categoria, DetalleVencimiento, Cobertura, FiltroObligaciones, FiltroVencimientos, Identidad, Alcance, Importaciones, InfoArchivo, LimitesFechas, DetalleMovimientoSinObligacion, MiConfiguracion, MovimientosSinObligacion, Obligacion, Pagina,
  Parametro, Regeneracion, ResultadoImportacionCatalogo, ResumenCatalogo, Sociedad, Vencimiento,
} from "./tipos";
import { encabezadoUsuario } from "./usuario-actual";
import { avisar } from "./avisos";

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
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...encabezadoUsuario(), ...init?.headers },
      cache: "no-store",
    });
  } catch {
    const mensaje = "No se pudo conectar con el servidor. Verifique que el Backend esté encendido.";
    // El aviso no se repite mientras el mismo ya esté visible (varias peticiones fallan a la vez).
    if (typeof window !== "undefined") avisar.error(mensaje);
    throw new ErrorApi(mensaje);
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

  obtenerAvisos: () => pedir<Avisos>("/api/avisos"),
  movimientosSinObligacion: () => pedir<MovimientosSinObligacion>("/api/movimientos-sin-obligacion"),

  movimientoSinObligacionDetalle: async (clave: string) =>
    (await pedir<{ datos: DetalleMovimientoSinObligacion }>(`/api/movimientos-sin-obligacion/detalle?clave=${encodeURIComponent(clave)}`)).datos,
  informacionArchivo: async (id: number) => (await pedir<{ datos: InfoArchivo }>(`/api/archivos/${id}`)).datos,
  obtenerIdentidad: () => pedir<Identidad>("/api/identidad"),
  obtenerMiConfiguracion: async () => (await pedir<{ datos: MiConfiguracion }>("/api/mi-configuracion")).datos,
  guardarMiConfiguracion: async (diasAviso: number, diasEspera: number) =>
    (await pedir<{ datos: MiConfiguracion }>("/api/mi-configuracion", { method: "PUT", body: JSON.stringify({ diasAviso, diasEspera }) })).datos,

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

  listarVencimientos: (f: FiltroVencimientos) =>
    pedir<Pagina<Vencimiento> & { hoy: string; resumen: Record<string, number>; diasAviso: number }>(`/api/vencimientos${consulta(f)}`),
  /** Todas las páginas de un filtro (los meses y la lista de vencidos son cortos), con el conteo por estado y el «hoy» del servidor. */
  listarTodosVencimientos: async (f: Omit<FiltroVencimientos, "pagina" | "porPagina">) => {
    let pagina = 1;
    const datos: Vencimiento[] = [];
    for (;;) {
      const r = await pedir<Pagina<Vencimiento> & { hoy: string; resumen: Record<string, number>; diasAviso: number; alcance: Alcance; estadosCalculadosEn: string | null }>(`/api/vencimientos${consulta({ ...f, pagina, porPagina: 500 })}`);
      datos.push(...r.datos);
      if (pagina >= r.paginas) return { datos, resumen: r.resumen, hoy: r.hoy, diasAviso: r.diasAviso, alcance: r.alcance, estadosCalculadosEn: r.estadosCalculadosEn };
      pagina++;
    }
  },
  detalleVencimiento: async (id: number) => (await pedir<{ datos: DetalleVencimiento }>(`/api/vencimientos/${id}`)).datos,
  avisosDatos: async () => (await pedir<{ datos: AvisoDatos[] }>("/api/vencimientos/avisos-datos")).datos,
  periodosGenerados: async () => (await pedir<{ datos: { periodo: string; total: number }[]; hoy: string }>("/api/vencimientos/periodos")).datos,
  /** Primera y última fecha con datos (límites del selector de fechas) y «hoy» del servidor. */
  limitesFechas: () => pedir<LimitesFechas>("/api/fechas/limites"),
  /** La fecha de hoy según el servidor (reloj inyectable). */
  hoy: async () => (await pedir<{ datos: unknown; hoy: string }>("/api/vencimientos/periodos")).hoy,
};
