import type { EncabezadoSaldos } from "./encabezado-saldos.js";
import type { FormatoId } from "./formatos.js";
import type { ImagenRelativa } from "./medir-imagenes.js";

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
  /** por qué no se pudo verificar (solo si estado = no_verificable); ver `razonDeContinuidad` */
  razon?: RazonNoVerificable;
  /** movimientos del archivo y cuántos vienen sin saldo */
  movimientos?: number;
  filasSinSaldo?: number;
}

export type RazonNoVerificable = "sin_movimientos" | "saldo_vacio_todas" | "saldo_vacio_algunas" | "un_solo_saldo" | "imagen_no_legible" | "otro";

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
  /** saldo inicial («Saldo inicial» o «Saldo anterior» del encabezado), en centavos; null si el archivo no lo trae */
  saldoInicial: number | null;
  /** saldo de la última fila de la tabla, en centavos; null si no hay o está vacío */
  saldoFinal: number | null;
  /** primera y última fecha con movimientos del archivo (AAAA-MM-DD); null si no tiene movimientos */
  fechas: { del: string; al: string } | null;
  /** período declarado en el encabezado; null si el formato no lo declara */
  periodoDeclarado: { del: string | null; al: string | null } | null;
  discrepancias: Discrepancia[];
  advertencias: string[];
  /** filas del pie (resúmenes, totales) posteriores al último movimiento: se ignoran, solo se cuentan */
  filasPieIgnoradas: number;
  /** el archivo trae imágenes (que el lector ignora) */
  conImagenes: boolean;
  /** las imágenes de la hoja leída, medidas contra la hoja: porcentaje del área y posición */
  imagenes: ImagenRelativa[];
  /** el bloque de saldos del encabezado (solo qué etiquetas hay, nunca importes); null si no lo trae */
  encabezadoSaldos: EncabezadoSaldos | null;
}
