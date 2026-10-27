import { z } from "zod";

export type TipoParametro = "entero" | "texto";

export interface DefinicionParametro {
  clave: string;
  etiqueta: string;
  ayuda: string;
  tipo: TipoParametro;
  ambito: "global" | "categoria";
  valorInicial: string;
  unidad?: string;
  min?: number;
  max?: number;
  opciones?: string[];
  supuesto: boolean; // true = valor por confirmar con Tesorería
}

export const FRECUENCIAS = ["mensual", "bimestral", "trimestral", "semestral", "anual"];

export const DEFINICIONES: DefinicionParametro[] = [
  {
    clave: "ventana_dias_antes",
    etiqueta: "Días antes de la fecha de pago",
    ayuda:
      "Cuántos días antes de la fecha de pago se acepta un pago como válido para esa obligación (se puede pagar antes). Se cuentan días calendario y pueden cruzar de un mes a otro.",
    tipo: "entero", ambito: "global", valorInicial: "3", unidad: "días", min: 0, max: 15, supuesto: false,
  },
  {
    clave: "ventana_dias_despues",
    etiqueta: "Días después de la fecha de pago",
    ayuda:
      "Cuántos días después de la fecha de pago se acepta un pago como válido para esa obligación. Pasado ese margen sin pago, el vencimiento queda vencido (si hay estados de cuenta que lo confirmen).",
    tipo: "entero", ambito: "global", valorInicial: "3", unidad: "días", min: 0, max: 15, supuesto: false,
  },
  {
    clave: "aviso_dias",
    etiqueta: "Días de aviso antes del vencimiento",
    ayuda: "Con cuántos días de anticipación un vencimiento pasa a “por vencer”, se prepara el aviso por correo y se genera en el calendario.",
    tipo: "entero", ambito: "global", valorInicial: "3", unidad: "días", min: 0, max: 60, supuesto: false,
  },
  {
    clave: "marcar_vencido_sin_estado",
    etiqueta: "Marcar Vencido aunque falte el estado de cuenta",
    ayuda:
      "Apagado: si faltan estados de cuenta para confirmar el pago, el vencimiento queda en «Sin información» y requiere atención. Encendido: se muestra como Vencido, con la nota «sin estado de cuenta que lo confirme».",
    tipo: "texto", ambito: "global", valorInicial: "no", opciones: ["no", "si"], supuesto: false,
  },
  {
    clave: "aviso_datos_dias",
    etiqueta: "Días sin estados de cuenta para avisar",
    ayuda: "Si los estados de cuenta de una sociedad llegan hasta una fecha anterior a hoy menos estos días, se avisa que faltan datos.",
    tipo: "entero", ambito: "global", valorInicial: "5", unidad: "días", min: 0, max: 60, supuesto: false,
  },
  {
    clave: "frecuencia_defecto",
    etiqueta: "Frecuencia por defecto",
    ayuda:
      "Frecuencia que se asigna a las obligaciones cuando no se indica otra. La tabla de pagos frecuentes no trae este dato. SUPUESTO: mensual.",
    tipo: "texto", ambito: "global", valorInicial: "mensual", opciones: FRECUENCIAS, supuesto: true,
  },
  {
    clave: "tolerancia_pct",
    etiqueta: "Tolerancia de monto",
    ayuda:
      "Diferencia porcentual aceptada entre el monto esperado y el monto pagado. En el piloto NO se valida el monto, así que este valor todavía no se aplica. SUPUESTO: 10 %.",
    tipo: "entero", ambito: "categoria", valorInicial: "10", unidad: "%", min: 0, max: 100, supuesto: true,
  },
];

export function definicionDe(clave: string, ambito: string): DefinicionParametro | undefined {
  return DEFINICIONES.find((d) => d.clave === clave && d.ambito === ambito);
}

function error(mensaje: string): never {
  throw new z.ZodError([{ code: "custom", path: [], message: mensaje }]);
}

/** Valida y normaliza un valor según la definición; lanza ZodError si no es válido. */
export function validarValor(def: DefinicionParametro, valor: unknown): string {
  if (typeof valor === "string" && valor.trim() === "") error("Debe indicar un valor");
  if (def.tipo === "entero") {
    const n = Number(valor);
    if (!Number.isFinite(n)) error("Debe ser un número");
    if (!Number.isInteger(n)) error("Debe ser un número entero");
    if (def.min !== undefined && n < def.min) error(`Debe ser al menos ${def.min}`);
    if (def.max !== undefined && n > def.max) error(`Debe ser como máximo ${def.max}`);
    return String(n);
  }
  const s = String(valor).trim();
  if (def.opciones && !def.opciones.includes(s)) error(`Debe ser uno de: ${def.opciones.join(", ")}`);
  return s;
}
