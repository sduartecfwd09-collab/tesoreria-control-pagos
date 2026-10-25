import { parsearNombreArchivo } from "../ingest/nombre-archivo.js";

export interface ArchivoCobertura {
  ruta: string;
  sociedad: string | null;
  mes: string | null;
  estado: string; // leido | error | en_revision | pendiente
  motivo?: string | null; // motivo fijo si el archivo quedó en revisión
  numMovimientos: number;
  numDuplicados: number;
  banco: string | null;
  bancoPorConfirmar: boolean | null;
  moneda: string | null;
  monedaPorConfirmar: boolean | null;
  cuentaId: number | null;
  formato: string | null;
  detalle: unknown;
}

export type EstadoCelda = "leido" | "error" | "falta";

export interface CeldaCobertura {
  estado: EstadoCelda;
  archivo?: string;
  formato?: string | null;
  movimientos: number;
  duplicados: number;
  /** "cuadra" | "no_cuadra" | "no_verificable" */
  saldo?: string;
  error?: string | null;
}

export interface FilaCobertura {
  sociedad: string;
  cuenta: string;
  cuentaId: number | null;
  banco: string | null;
  bancoPorConfirmar: boolean | null;
  moneda: string | null;
  monedaPorConfirmar: boolean | null;
  celdas: Record<string, CeldaCobertura>;
}

export interface Cobertura {
  meses: string[];
  filas: FilaCobertura[];
  /** archivos que no se pudieron ubicar en la tabla (nombre fuera de convención) */
  sinUbicar: { ruta: string; error: string | null }[];
}

const continuidadDe = (d: unknown): string | undefined => (d as { continuidad?: { estado?: string } } | null)?.continuidad?.estado;

/**
 * Cobertura por sociedad, cuenta y mes: qué hay, qué falta y qué falló.
 * Una celda "falta" significa que no hay archivo de esa cuenta para ese mes (cobertura de datos, no alerta de pago).
 */
export function calcularCobertura(archivos: (ArchivoCobertura & { error?: string | null })[]): Cobertura {
  const meses = new Set<string>();
  const filas = new Map<string, FilaCobertura>();
  const sinUbicar: Cobertura["sinUbicar"] = [];

  for (const a of archivos) {
    const nombre = parsearNombreArchivo(a.ruta.split("/").pop() ?? "");
    const sociedad = a.sociedad ?? a.ruta.split("/")[0] ?? "";
    const mes = a.mes ?? nombre?.periodo ?? null;
    if (!nombre || !mes) {
      sinUbicar.push({ ruta: a.ruta, error: a.error ?? a.motivo ?? null });
      continue;
    }
    meses.add(mes);
    const k = `${sociedad}|${nombre.cuenta}`;
    const fila = filas.get(k) ?? { sociedad, cuenta: nombre.cuenta, cuentaId: null, banco: null, bancoPorConfirmar: null, moneda: null, monedaPorConfirmar: null, celdas: {} };
    if (a.cuentaId !== null) {
      fila.cuentaId = a.cuentaId;
      fila.banco = a.banco;
      fila.bancoPorConfirmar = a.bancoPorConfirmar;
      fila.moneda = a.moneda;
      fila.monedaPorConfirmar = a.monedaPorConfirmar;
    }
    fila.celdas[mes] = {
      // un archivo en revisión no aportó datos: se muestra como celda con problema, nunca como leído
      estado: a.estado === "error" || a.estado === "en_revision" ? "error" : "leido",
      archivo: a.ruta,
      formato: a.formato,
      movimientos: a.numMovimientos,
      duplicados: a.numDuplicados,
      saldo: continuidadDe(a.detalle),
      error: a.error ?? a.motivo ?? null,
    };
    filas.set(k, fila);
  }
  const lista = [...meses].sort();
  const resultado = [...filas.values()].sort((x, y) => x.sociedad.localeCompare(y.sociedad) || x.cuenta.localeCompare(y.cuenta));
  for (const f of resultado) {
    for (const m of lista) f.celdas[m] ??= { estado: "falta", movimientos: 0, duplicados: 0 };
  }
  return { meses: lista, filas: resultado, sinUbicar };
}
