import type { FormatoId } from "./formatos.js";

/** Movimiento ya normalizado (montos en centavos, enteros >= 0 en débito y crédito). */
export interface MovimientoLeido {
  hoja: string;
  fila: number;
  fecha: Date;
  referencia: string | null;
  codigo: string | null;
  descripcion: string | null;
  debito: number;
  credito: number;
  saldo: number | null;
}

export type EstadoContinuidad = "cuadra" | "no_cuadra" | "no_verificable";

export interface Continuidad {
  estado: EstadoContinuidad;
  /** pares de saldos comparados (más la apertura si existe) */
  verificados: number;
  fallos: number;
  orden: "ascendente" | "descendente";
  /** filas de Excel donde el saldo no cuadra (máx. 10) */
  filasConFallo: number[];
  usoSaldoApertura: boolean;
  motivo?: string;
}

export interface Discrepancia {
  tipo: "sociedad" | "cuenta" | "periodo" | "formato";
  mensaje: string;
}

export interface ResultadoLectura {
  formato: FormatoId;
  hoja: string;
  filaEncabezado: number;
  /** moneda explícita en el archivo; null si el archivo no la trae */
  monedaArchivo: "CRC" | "USD" | null;
  /** nombre de banco legible en el propio archivo (p. ej. BCT, Davivienda); null si no se puede leer */
  bancoArchivo: string | null;
  movimientos: MovimientoLeido[];
  continuidad: Continuidad;
  discrepancias: Discrepancia[];
  advertencias: string[];
  /** filas del pie (resúmenes, totales) posteriores al último movimiento: se ignoran, solo se cuentan */
  filasPieIgnoradas: number;
}
