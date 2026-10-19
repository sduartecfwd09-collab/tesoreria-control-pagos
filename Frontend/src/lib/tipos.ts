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
  sinUbicar: { ruta: string; error: string | null }[];
}

export interface ArchivoImportado {
  id: number;
  ruta: string;
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
