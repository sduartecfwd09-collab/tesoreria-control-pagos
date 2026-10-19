// Especificación declarativa de los 7 formatos de estado de cuenta (Hito 0).
// Los encabezados se comparan normalizados (minúsculas, sin tildes, sin asterisco final).
// SUPUESTO: los nombres de banco 0102, 0123 y 0104 (salvo Davivienda, legible en E5) no están confirmados.

export type FormatoId = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7";

export type Campo = "fecha" | "referencia" | "codigo" | "descripcion" | "debito" | "credito" | "monto" | "saldo";

export interface EspecFormato {
  id: FormatoId;
  /** código de banco del IBAN con el que debe ser coherente */
  banco: string;
  /** campo normalizado -> etiquetas de encabezado aceptadas (ya normalizadas) */
  columnas: Partial<Record<Campo, string[]>>;
  /** true si hay un único monto con signo (negativo = débito) */
  montoConSigno?: boolean;
  /** true si el saldo es el saldo de cierre del día (no por movimiento) */
  saldoDiario?: boolean;
  nota: string;
}

export const FORMATOS: EspecFormato[] = [
  {
    id: "E1", banco: "0107", nota: "BCT",
    columnas: { fecha: ["fecha"], descripcion: ["concepto"], referencia: ["referencia"], debito: ["debito"], credito: ["credito"], saldo: ["saldo"] },
  },
  {
    id: "E2", banco: "0102", nota: "Detalle de movimientos del periodo (celdas combinadas)",
    columnas: { fecha: ["fecha"], referencia: ["referencia"], codigo: ["codigo"], descripcion: ["descripcion"], debito: ["debitos"], credito: ["creditos"], saldo: ["balance"] },
  },
  {
    id: "E3", banco: "0123", nota: "Estado de movimiento",
    columnas: { fecha: ["fecha"], referencia: ["referencia"], descripcion: ["descripcion"], debito: ["debitos"], credito: ["creditos"], saldo: ["saldo"] },
  },
  {
    id: "E4", banco: "0104", nota: "Consulta DR/CR",
    columnas: { fecha: ["fecha"], descripcion: ["descripcion"], referencia: ["ref."], debito: ["debitos (dr)"], credito: ["creditos (cr)"], saldo: ["saldo contable"] },
  },
  {
    id: "E5", banco: "0104", nota: "Davivienda consolidado: se lee la hoja de detalle",
    columnas: { fecha: ["fecha"], codigo: ["transac."], descripcion: ["concepto"], debito: ["debitos"], credito: ["creditos"], saldo: ["saldo"], referencia: ["referencia"] },
  },
  {
    id: "E6", banco: "0151", nota: "BNCR agosto",
    columnas: { fecha: ["fecha"], descripcion: ["descripcion"], referencia: ["referencia"], debito: ["debitos"], credito: ["creditos"], saldo: ["saldo"] },
  },
  {
    id: "E7", banco: "0151", nota: "BNCR septiembre: monto único con signo",
    columnas: { fecha: ["fecha"], referencia: ["numero"], descripcion: ["descripcion"], monto: ["monto"], saldo: ["saldo diario"] },
    montoConSigno: true, saldoDiario: true,
  },
];

export function especDe(id: FormatoId): EspecFormato {
  return FORMATOS.find((f) => f.id === id)!;
}
