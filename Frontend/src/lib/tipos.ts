// Contrato con el Backend (ver ../Backend/src/routes). Hoy se mantiene a mano;
// se propone generarlo desde OpenAPI cuando crezca la API.
export interface Parametro {
  id: number;
  clave: string;
  valor: string;
  tipo: "entero" | "texto";
  ambito: "global" | "categoria";
  categoria: string | null;
  etiqueta: string;
  ayuda: string;
  unidad: string | null;
  min: number | null;
  max: number | null;
  opciones: string[] | null;
  supuesto: boolean;
  actualizado: string;
}

export type EstadoCelda = "leido" | "error" | "falta";

export interface CeldaCobertura {
  estado: EstadoCelda;
  archivo?: string;
  formato?: string | null;
  movimientos: number;
  duplicados: number;
  saldo?: "cuadra" | "no_cuadra" | "no_verificable";
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
  sinUbicar: { archivo: string; error: string | null }[];
}

export interface ArchivoImportado {
  id: number;
  archivo: string; // solo el nombre del archivo, con los números largos enmascarados
  sociedad: string | null;
  cuenta: string | null;
  formato: string | null;
  mes: string | null;
  estado: "leido" | "error" | "pendiente";
  movimientos: number;
  duplicados: number;
  error: string | null;
  advertencias: string[];
  discrepancias: { tipo: string; mensaje: string }[];
  continuidad: { estado: string; verificados: number; fallos: number; filasConFallo: number[] } | null;
  monedaOrigen: string | null;
  leidoEn: string | null;
}

export interface Importaciones {
  datos: ArchivoImportado[];
  resumen: { archivos: number; leidos: number; conError: number; movimientos: number };
  enCurso: boolean;
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

export interface Sociedad {
  id: number;
  codigo: string | null; // abreviatura interna; puede faltar
  nombreLargo: string;
  activa: boolean;
  obligaciones: number;
  cuentas: number;
}

export interface Categoria {
  id: number;
  nombre: string;
  obligaciones: number;
}

export interface Cuenta {
  id: number;
  sociedad: string;
  numero: string;
  banco: string | null;
  moneda: string | null;
}

export type Frecuencia = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual";
export type Moneda = "CRC" | "USD";

export type CodigoEtiqueta =
  | "falta_dia" | "falta_monto" | "falta_cuenta" | "falta_responsable" | "falta_mes_arranque"
  | "por_confirmar" | "id_repetido" | "formato_iban";

export interface EtiquetaObligacion {
  codigo: CodigoEtiqueta;
  texto: string;
  ayuda: string;
}

export interface Obligacion {
  id: number;
  sociedadId: number;
  sociedad: string;
  categoriaId: number;
  categoria: string;
  proveedor: string;
  identificador: string;
  diaEsperadoPago: number | null;
  diaEditado: boolean;
  frecuencia: Frecuencia;
  frecuenciaPorConfirmar: boolean;
  mesArranque: number | null;
  montoEsperado: number | null; // centavos
  moneda: Moneda;
  monedaPorConfirmar: boolean;
  cuentaEsperada: { id: number; numero: string; banco: string | null } | null;
  responsable: string | null; // el propio de la obligación (lo que se edita)
  responsableEfectivo: string | null; // el que se muestra: el propio o, si falta, el tesorero de la sociedad
  responsableDe: "obligacion" | "tesorero" | null;
  activa: boolean;
  origen: "catalogo" | "manual";
  actualizado: string;
  etiquetas: EtiquetaObligacion[];
}

/** Campos que se envían al crear o editar (en la edición solo los que cambiaron). */
export interface CambiosObligacion {
  sociedadId?: number;
  categoriaId?: number;
  proveedor?: string;
  identificador?: string;
  diaEsperadoPago?: number | null;
  frecuencia?: Frecuencia;
  frecuenciaPorConfirmar?: boolean;
  mesArranque?: number | null;
  montoEsperado?: number | null;
  moneda?: Moneda;
  monedaPorConfirmar?: boolean;
  cuentaEsperadaId?: number | null;
  responsable?: string | null;
  activa?: boolean;
}

export interface Regeneracion {
  creados: number;
  actualizados: number;
  eliminados: number;
  protegidos: number;
}

export interface FiltroObligaciones {
  sociedadId?: number;
  categoria?: number;
  activa?: boolean;
  q?: string;
  falta?: "monto" | "cuenta" | "responsable" | "dia";
  pagina: number;
  porPagina: number;
}

export interface ResumenCatalogo {
  total: number;
  activas: number;
  inactivas: number;
  sinDia: number;
  sinMonto: number;
  sinCuenta: number;
  sinResponsable: number;
  sinMesArranque: number;
  frecuenciaPorConfirmar: number;
  monedaPorConfirmar: number;
  identificadoresRepetidos: { sociedad: string; identificador: string; proveedores: string[]; obligaciones: number[] }[];
  formatoIban: { id: number; sociedad: string; proveedor: string; identificador: string }[];
  /** con estados de cuenta pero sin obligaciones: aviso individual */
  sociedadesSinObligaciones: string[];
  /** sin estados de cuenta ni obligaciones: una sola línea resumen */
  sociedadesSinEstadosNiObligaciones: string[];
  porSociedad: Record<string, number>;
  porCategoria: Record<string, number>;
}

export interface ResultadoImportacionCatalogo {
  filasLeidas: number;
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  noEnArchivo: number;
  problemas: { fila: number; motivo: string; importada: boolean }[];
}

export type EstadoVencimiento = "proyectado" | "por_vencer" | "vencido" | "pagado" | "pagado_con_inconsistencia" | "sin_informacion";

export interface Vencimiento {
  id: number;
  obligacionId: number;
  sociedad: string;
  categoria: string;
  proveedor: string;
  identificador: string;
  frecuencia: Frecuencia;
  periodo: string;
  fecha: string;
  montoEsperado: number | null;
  moneda: Moneda;
  estado: EstadoVencimiento;
  conciliado: boolean;
  futuro: boolean;
}

export interface FiltroVencimientos {
  sociedadId?: number;
  categoria?: number;
  periodo?: string;
  q?: string;
  pagina: number;
  porPagina: number;
}

export interface ResumenGeneracion {
  desde: string;
  hasta: string;
  creados: number;
  yaExistentes: number;
  porPeriodo: { periodo: string; creados: number; yaExistentes: number }[];
  omitidas: { obligacionId: number; motivo: string; sociedad: string; proveedor: string; identificador: string; texto: string }[];
}
