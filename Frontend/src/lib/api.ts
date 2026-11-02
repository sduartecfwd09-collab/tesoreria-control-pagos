import type {
  CandidatoPago, AvisoDatos, Avisos, CambiosObligacion, Categoria, DetalleVencimiento, Cobertura, FiltroObligaciones, FiltroVencimientos, Identidad, Alcance, Importaciones, InfoArchivo, LimitesFechas, FiltroHistorico, RespuestaHistorico, FiltroHistorial, RespuestaHistorial, RespuestaDiferencias, DetalleMovimientoSinObligacion, MiConfiguracion, MovimientosSinObligacion, Obligacion, Pagina,
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
  movimientosSinObligacion: (p: { desde?: string; hasta?: string } = {}) => pedir<MovimientosSinObligacion>(`/api/movimientos-sin-obligacion${consulta(p)}`),

  movimientoSinObligacionDetalle: async (clave: string, p: { desde?: string; hasta?: string } = {}) =>
    (await pedir<{ datos: DetalleMovimientoSinObligacion }>(`/api/movimientos-sin-obligacion/detalle${consulta({ clave, ...p })}`)).datos,
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
  /** Pagos del banco que se pueden asociar a mano a este vencimiento (los más cercanos a su fecha primero). */
  pagosCandidatos: async (id: number) => (await pedir<{ datos: CandidatoPago[] }>(`/api/vencimientos/${id}/pagos-candidatos`)).datos,
  asociarPago: (id: number, movimiento: number, motivo: string) =>
    pedir<{ datos: { estado: string } }>(`/api/vencimientos/${id}/asociar-pago`, { method: "POST", body: JSON.stringify({ movimiento, motivo }) }),
  moverFecha: (id: number, nuevaFecha: string, motivo: string) =>
    pedir<{ datos: { fecha: string; fechaOriginal: string } }>(`/api/vencimientos/${id}/mover-fecha`, { method: "POST", body: JSON.stringify({ nuevaFecha, motivo }) }),
  quitarMovimiento: (id: number, motivo: string) =>
    pedir<{ datos: { fecha: string } }>(`/api/vencimientos/${id}/quitar-movimiento`, { method: "POST", body: JSON.stringify({ motivo }) }),
  cambiarDia: (id: number, c: { nuevoDia: number; desdeMes: string; aplicaAlMesEnCurso?: boolean; motivo: string }) =>
    pedir<{ datos: { desde: string; dia: number; actualizados: number } }>(`/api/obligaciones/${id}/cambiar-dia`, { method: "POST", body: JSON.stringify(c) }),
  justificarVencimiento: (id: number, motivo: string, nota: string) =>
    pedir<{ datos: { estado: string } }>(`/api/vencimientos/${id}/justificar`, { method: "POST", body: JSON.stringify({ motivo, nota }) }),
  quitarJustificacionDeVencimiento: (id: number, motivo: string) =>
    pedir<{ datos: { estado: string } }>(`/api/vencimientos/${id}/quitar-justificacion`, { method: "POST", body: JSON.stringify({ motivo }) }),
  justificarArchivo: (id: number, motivo: string, nota: string) =>
    pedir<{ datos: { problema: string } }>(`/api/archivos/${id}/justificar`, { method: "POST", body: JSON.stringify({ motivo, nota }) }),
  quitarJustificacionDeArchivo: (id: number, motivo: string) =>
    pedir<{ datos: { ok: boolean } }>(`/api/archivos/${id}/quitar-justificacion`, { method: "POST", body: JSON.stringify({ motivo }) }),
  marcarRevisada: (id: number, nota: string) =>
    pedir<{ datos: { estado: string } }>(`/api/obligaciones/${id}/marcar-revisada`, { method: "POST", body: JSON.stringify({ nota }) }),
  quitarRevision: (id: number, motivo: string) =>
    pedir<{ datos: { estado: string } }>(`/api/obligaciones/${id}/quitar-revision`, { method: "POST", body: JSON.stringify({ motivo }) }),
  quitarAsociacion: (id: number, motivo: string) =>
    pedir<{ datos: { estado: string } }>(`/api/vencimientos/${id}/quitar-asociacion`, { method: "POST", body: JSON.stringify({ motivo }) }),
  avisosDatos: async () => (await pedir<{ datos: AvisoDatos[] }>("/api/vencimientos/avisos-datos")).datos,
  periodosGenerados: async () => (await pedir<{ datos: { periodo: string; total: number }[]; hoy: string }>("/api/vencimientos/periodos")).datos,
  /** Histórico: vencimientos con su pago cruzado, una página por vez (filtro y paginación en el servidor). */
  historico: (f: FiltroHistorico) => pedir<RespuestaHistorico>(`/api/historico${consulta(f)}`),
  /** Historial de cambios de las obligaciones, una página por vez (alcance, filtros y paginación en el servidor). */
  historialCambios: (f: FiltroHistorial) => pedir<RespuestaHistorial>(`/api/historial-cambios${consulta(f)}`),
  /** Diferencias entre el Excel del catálogo y la plataforma (alcance en el servidor). */
  diferenciasExcel: (f: { sociedadId?: number; tipo?: string; estado?: string } = {}) => pedir<RespuestaDiferencias>(`/api/diferencias-excel${consulta(f)}`),
  resolverDiferencias: (c: { tipo: string; claves: string[]; accion: string; motivo: string; desdeMes?: string; aplicaAlMesEnCurso?: boolean }) =>
    pedir<{ datos: { resueltas: number } }>("/api/diferencias-excel/resolver", { method: "POST", body: JSON.stringify(c) }),
  /** Primera y última fecha con datos (límites del selector de fechas) y «hoy» del servidor. */
  limitesFechas: () => pedir<LimitesFechas>("/api/fechas/limites"),
  /** La fecha de hoy según el servidor (reloj inyectable). */
  hoy: async () => (await pedir<{ hoy: string }>("/api/hoy")).hoy,
};
