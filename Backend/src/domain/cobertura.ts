import { estadoDeArchivo, motivoDeArchivo } from "./estado-archivo.js";
import { parsearNombreArchivo } from "../ingest/nombre-archivo.js";
import { esImagenNoLegible, textoSaldoDeDetalle, type ContinuidadGuardada } from "./saldo.js";

export interface ArchivoCobertura {
  id?: number;
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
  retiradoEn?: Date | null;
}

/** error: el archivo no se pudo leer; sin_sociedad: su carpeta no tiene sociedad; falta: no hay archivo de ese mes. */
export type EstadoCelda = "leido" | "error" | "sin_sociedad" | "falta";

export interface CeldaCobertura {
  estado: EstadoCelda;
  /** identificador del archivo registrado: la celda enlaza a su motivo en el detalle */
  archivoId?: number;
  archivo?: string;
  formato?: string | null;
  movimientos: number;
  duplicados: number;
  /** "cuadra" | "no_cuadra" | "no_verificable" */
  saldo?: string;
  /** el resultado del saldo en lenguaje claro (también para Cuadra y No verificable) */
  saldoMotivo?: string;
  /** los movimientos vienen como imagen: el archivo no da cobertura */
  imagenNoLegible?: boolean;
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

export const conImagenesDe = (d: unknown): boolean | null => {
  const v = (d as { conImagenes?: unknown } | null)?.conImagenes;
  return typeof v === "boolean" ? v : null; // null: archivo leído antes de registrar este dato (se completa al reimportar)
};

const continuidadDe = (d: unknown): string | undefined => (d as { continuidad?: { estado?: string } } | null)?.continuidad?.estado;
const saldoDe = (d: unknown) => textoSaldoDeDetalle(d as { continuidad?: ContinuidadGuardada } | null);

/**
 * Cobertura por sociedad, cuenta y mes: qué hay, qué falta y qué falló.
 * Una celda "falta" significa que no hay archivo de esa cuenta para ese mes (cobertura de datos, no alerta de pago).
 */
export function calcularCobertura(archivos: (ArchivoCobertura & { error?: string | null })[]): Cobertura {
  const meses = new Set<string>();
  const filas = new Map<string, FilaCobertura>();
  const sinUbicar: Cobertura["sinUbicar"] = [];

  // Los archivos retirados de la carpeta no cuentan en la cobertura.
  for (const a of archivos.filter((x) => !x.retiradoEn)) {
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
      // un archivo que no aportó datos se muestra como celda con problema, nunca como leído
      estado: { leido: "leido", sin_sociedad: "sin_sociedad", con_error: "error", retirado: "error" }[estadoDeArchivo(a)] as EstadoCelda,
      ...(a.id !== undefined ? { archivoId: a.id } : {}),
      archivo: a.ruta,
      formato: a.formato,
      movimientos: a.numMovimientos,
      duplicados: a.numDuplicados,
      saldo: continuidadDe(a.detalle),
      saldoMotivo: saldoDe(a.detalle)?.motivo,
      ...(estadoDeArchivo(a) === "leido" && esImagenNoLegible((a.detalle as { continuidad?: ContinuidadGuardada } | null)?.continuidad) ? { imagenNoLegible: true } : {}),
      error: motivoDeArchivo(a),
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
