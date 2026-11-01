import { z } from "zod";

export type TipoParametro = "entero" | "texto";

export interface DefinicionParametro {
  clave: string;
  etiqueta: string;
  ayuda: string;
  tipo: TipoParametro;
  ambito: "global";
  valorInicial: string;
  unidad?: string;
  min?: number;
  max?: number;
  opciones?: string[];
  supuesto: boolean; // true = valor por confirmar con Tesorería
  /** false = no se muestra en Configuración (sigue siendo parámetro; irá en una sección «Avanzado» solo para Jefatura) */
  visible: boolean;
  /** ejemplo con fechas, en lenguaje de tesorería, para las filas visibles */
  ejemplo?: string;
}

/** Período más corto entre dos pagos de una obligación, en días (el de la frecuencia mensual). */
export const PERIODO_MAS_CORTO_DIAS = 30;

/** Mensaje si los días antes y después del rango de búsqueda no caben dentro del período más corto; null si están bien. */
export function errorRangoDeBusqueda(diasAntes: number, diasDespues: number): string | null {
  if (diasAntes + diasDespues < PERIODO_MAS_CORTO_DIAS) return null;
  return `Los días antes (${diasAntes}) y los días después (${diasDespues}) suman ${diasAntes + diasDespues}; deben sumar menos de ${PERIODO_MAS_CORTO_DIAS}, el período más corto entre dos pagos (el de una obligación mensual).`;
}

export const FRECUENCIAS = ["mensual", "bimestral", "trimestral", "semestral", "anual"];

export const DEFINICIONES: DefinicionParametro[] = [
  {
    clave: "ventana_dias_antes",
    etiqueta: "Días antes de la fecha de pago",
    ayuda:
      "Cuántos días antes de la fecha de pago se acepta un pago como válido para esa obligación (se puede pagar antes). Se cuentan días calendario y pueden cruzar de un mes a otro.",
    tipo: "entero", ambito: "global", valorInicial: "10", unidad: "días", min: 0, max: 15, supuesto: false, visible: false,
  },
  {
    clave: "ventana_dias_despues",
    etiqueta: "Días después de la fecha de pago",
    ayuda:
      "Cuántos días después de la fecha de pago se sigue buscando el pago en los estados de cuenta. Pasado ese plazo sin encontrarlo, el vencimiento queda vencido (si hay estados de cuenta que lo confirmen). Se cuentan días calendario y pueden cruzar de un mes a otro.",
    tipo: "entero", ambito: "global", valorInicial: "12", unidad: "días", min: 0, max: 15, supuesto: false, visible: false,
  },
  {
    clave: "meses_vencimientos_adelante",
    etiqueta: "Meses de vencimientos que se generan por adelantado",
    ayuda: "Cuántos meses después del actual se generan los vencimientos de cada obligación. Los de fechas futuras quedan como Programado: no generan avisos ni se marcan Vencido ni Sin información.",
    tipo: "entero", ambito: "global", valorInicial: "12", unidad: "meses", min: 0, max: 36, supuesto: true, visible: false,
  },
  {
    clave: "selector_anios_atras",
    etiqueta: "Años hacia atrás que permite el selector de fechas",
    ayuda: "Hasta cuántos años antes de hoy se puede navegar en el selector de fechas. No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "5", unidad: "años", min: 1, max: 20, supuesto: true, visible: false,
  },
  {
    clave: "selector_meses_adelante",
    etiqueta: "Meses hacia adelante que permite el selector de fechas",
    ayuda: "Hasta cuántos meses después de hoy se puede navegar en el selector de fechas. No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "12", unidad: "meses", min: 0, max: 60, supuesto: true, visible: false,
  },
  {
    clave: "historico_meses",
    etiqueta: "Meses que muestra el Histórico por defecto",
    ayuda: "Cuántos meses de calendario (contando el actual) abre el Histórico antes de que la persona elija otras fechas. No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "12", unidad: "meses", min: 1, max: 120, supuesto: true, visible: false,
  },
  {
    clave: "ventana_asociacion_manual_dias",
    etiqueta: "Días a cada lado para asociar un pago a mano",
    ayuda: "Al asociar un pago a mano a un vencimiento, se ofrecen los pagos de la sociedad con fecha hasta este número de días antes o después de la fecha del vencimiento. No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "30", unidad: "días", min: 1, max: 120, supuesto: true, visible: false,
  },
  {
    clave: "historial_por_pagina",
    etiqueta: "Filas por página del Historial de cambios",
    ayuda: "Cuántas filas trae cada página de la pantalla Historial de cambios. No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "50", unidad: "filas", min: 10, max: 200, supuesto: true, visible: false,
  },
  {
    clave: "diagnostico_dias_lejos",
    etiqueta: "Distancia máxima para el diagnóstico de pagos",
    ayuda:
      "Solo para el diagnóstico: hasta cuántos días antes o después del rango de búsqueda se mira un pago con el mismo número para explicar por qué un vencimiento no quedó pagado. No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "45", unidad: "días", min: 1, max: 365, supuesto: false, visible: false,
  },
  {
    clave: "diagnostico_imagen_grande_pct",
    etiqueta: "Tamaño desde el que una imagen es grande (diagnóstico)",
    ayuda: "Solo para el diagnóstico: porcentaje del área de la hoja desde el que una imagen pegada se considera grande (posible captura). No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "15", unidad: "%", min: 1, max: 100, supuesto: false, visible: false,
  },
  {
    clave: "diagnostico_imagen_esquina_pct",
    etiqueta: "Franja de la esquina para el diagnóstico de imágenes",
    ayuda: "Solo para el diagnóstico: ancho, en porcentaje de la hoja, de la franja exterior que se considera esquina (una imagen pequeña en la esquina es probablemente un logo). No cambia ningún estado.",
    tipo: "entero", ambito: "global", valorInicial: "25", unidad: "%", min: 1, max: 50, supuesto: false, visible: false,
  },
  {
    clave: "tolerancia_saldo",
    etiqueta: "Tolerancia de redondeo del saldo",
    ayuda:
      "Diferencia máxima, en centavos, que se acepta por redondeo al comprobar que el saldo de un estado de cuenta cuadra (saldo anterior más créditos menos débitos). Se aplica al leer los archivos: después de cambiarla hay que volver a importar. Un estado de cuenta cuyo saldo no cuadra no cuenta como cobertura.",
    tipo: "entero", ambito: "global", valorInicial: "1", unidad: "centavos", min: 0, max: 1000, supuesto: false, visible: false,
  },
  {
    clave: "aviso_dias",
    etiqueta: "Días de aviso antes del vencimiento",
    ayuda: "Con cuántos días de anticipación un pago pasa de «Programado» a «Por vencer». Cada tesorero puede tener su propio aviso en «Mi configuración»; este valor lo usa quien no tenga el suyo.",
    ejemplo: "Ejemplo: con 3 días de aviso, un pago con fecha de pago el 15 de octubre figura como «Programado» hasta el 11 de octubre y como «Por vencer» desde el 12 de octubre.",
    tipo: "entero", ambito: "global", valorInicial: "3", unidad: "días", min: 0, max: 60, supuesto: false, visible: false,
  },
  {
    clave: "dias_espera_vencido",
    etiqueta: "Días de espera antes de marcar Vencido",
    ayuda: "Cuántos días después de la fecha de pago se espera el pago antes de marcarlo como «Vencido». Durante la espera el pago sigue como «Por vencer».",
    ejemplo: "Ejemplo: con 3 días de espera y fecha de pago el 10 de octubre, sin pago, el 11, 12 y 13 de octubre figura como «Por vencer» (se espera el pago) y desde el 14 de octubre pasa a «Vencido».",
    tipo: "entero", ambito: "global", valorInicial: "3", unidad: "días", min: 0, max: 15, supuesto: false, visible: false,
  },
  {
    clave: "marcar_vencido_sin_estado",
    etiqueta: "Marcar Vencido aunque falte el estado de cuenta",
    ayuda:
      "Apagado: si faltan estados de cuenta para confirmar el pago, el vencimiento queda en «Sin información» y requiere atención. Encendido: se muestra como Vencido, con la nota «sin estado de cuenta que lo confirme».",
    tipo: "texto", ambito: "global", valorInicial: "no", opciones: ["no", "si"], supuesto: false, visible: false,
  },
  {
    clave: "aviso_datos_dias",
    etiqueta: "Días sin estados de cuenta para avisar",
    ayuda: "Si los estados de cuenta de una sociedad llegan hasta una fecha anterior a hoy menos estos días, se avisa que faltan datos.",
    tipo: "entero", ambito: "global", valorInicial: "5", unidad: "días", min: 0, max: 60, supuesto: false, visible: false,
  },
  {
    clave: "frecuencia_defecto",
    etiqueta: "Frecuencia por defecto",
    ayuda:
      "Frecuencia que se asigna a las obligaciones cuando no se indica otra. La tabla de pagos frecuentes no trae este dato. SUPUESTO: mensual.",
    tipo: "texto", ambito: "global", valorInicial: "mensual", opciones: FRECUENCIAS, supuesto: true, visible: false,
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
