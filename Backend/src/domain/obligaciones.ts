// Reglas del catálogo de obligaciones: validación de alta y edición, etiquetas por obligación y
// alertas de calidad. Todo es puro (sin base): las alertas se recalculan siempre a partir de los datos,
// así desaparecen solas cuando Tesorería corrige el catálogo.
import { z } from "zod";
import { limpiarIdentificador } from "../catalogo/lector.js";
import { proveedorCanonico } from "../config/alias-proveedores.js";
import { identificadorClave } from "./identificadores.js";
import { esPeriodo } from "./vencimientos.js";
import { FRECUENCIAS } from "./parametros.js";

export const MONEDAS = ["CRC", "USD"] as const;
// Los montos se guardan en centavos como BigInt y la API los envía como número: el máximo es el mayor entero que un
// número representa sin perder precisión (unos ₡90 billones). Hay montos reales mayores a ₡21,4 millones.
export const MONTO_MAXIMO = Number.MAX_SAFE_INTEGER;

/** Identificador con forma de IBAN (dos letras, dos dígitos de control y el resto alfanumérico). */
export const pareceIban = (id: string) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(id);

// --- Validación ---------------------------------------------------------------------------------

const textoOpcional = (max: number, nombre: string) =>
  z
    .string({ error: `${nombre} debe ser texto` })
    .nullable()
    .transform((s) => (s === null || s.trim() === "" ? null : s.replace(/\s+/g, " ").trim()))
    .refine((s) => s === null || s.length <= max, `${nombre} admite como máximo ${max} caracteres`);

const enteroOpcional = (min: number, max: number, mensaje: string) =>
  z.number({ error: mensaje }).int(mensaje).min(min, mensaje).max(max, mensaje).nullable();

const camposEditables = {
  frecuencia: z.string({ error: "Indique la frecuencia" }).refine((f) => FRECUENCIAS.includes(f), `La frecuencia debe ser una de: ${FRECUENCIAS.join(", ")}`),
  frecuenciaPorConfirmar: z.boolean({ error: "Indique sí o no" }),
  mesArranque: enteroOpcional(1, 12, "El mes de arranque debe ser de 1 (enero) a 12 (diciembre)"),
  diaEsperadoPago: enteroOpcional(1, 31, "El día esperado de pago debe ser un número entero de 1 a 31"),
  montoEsperado: z
    .number({ error: "El monto debe ser un número" })
    .int("El monto se envía en centavos (número entero)")
    .min(0, "El monto no puede ser negativo")
    .max(MONTO_MAXIMO, "El monto es demasiado grande")
    .nullable(),
  moneda: z.enum(MONEDAS, { error: "La moneda debe ser CRC (colones) o USD (dólares)" }),
  monedaPorConfirmar: z.boolean({ error: "Indique sí o no" }),
  cuentaEsperadaId: z.number({ error: "La cuenta de pago no es válida" }).int("La cuenta de pago no es válida").positive("La cuenta de pago no es válida").nullable(),
  responsable: textoOpcional(80, "El responsable"),
  activa: z.boolean({ error: "Indique si la obligación está activa (sí o no)" }),
  controlDesde: z
    .string({ error: "«Control desde» debe ser un mes con el formato AAAA-MM (por ejemplo 2026-08)" })
    .refine(esPeriodo, "«Control desde» debe ser un mes con el formato AAAA-MM (por ejemplo 2026-08)")
    .nullable(),
};

export const CAMPOS_EDITABLES = Object.keys(camposEditables);

const editablesOpcionales = z.object(camposEditables).partial();

export const esquemaEdicion = editablesOpcionales.refine((o) => Object.keys(o).length > 0, "No se indicó ningún cambio");

export const esquemaAlta = editablesOpcionales.extend({
  /** «Es intencional»: la persona confirma que el identificador ya existe en otra obligación y quiere crearla igual. */
  esIntencional: z.boolean({ error: "Indique sí o no" }).optional(),
  // La sociedad se elige por su nombre oficial y se envía su identificador (61 sociedades no tienen abreviatura).
  sociedadId: z.number({ error: "Indique la sociedad" }).int("Indique la sociedad").positive("Indique la sociedad"),
  categoriaId: z.number({ error: "Indique la categoría" }).int().positive("Indique la categoría"),
  proveedor: z
    .string({ error: "Indique el proveedor" })
    .transform((s) => proveedorCanonico(s.replace(/\s+/g, " ").trim())) // variantes conocidas -> proveedor canónico
    .pipe(z.string().min(1, "Indique el proveedor").max(80, "El proveedor admite como máximo 80 caracteres")),
  identificador: z
    .string({ error: "Indique el identificador (NISE, cuenta o número de servicio)" })
    .transform(limpiarIdentificador)
    .pipe(z.string().min(1, "Indique el identificador (NISE, cuenta o número de servicio)").max(40, "El identificador admite como máximo 40 caracteres")),
});

/** Primer error de zod como { error, campo } (el campo permite marcarlo en el formulario). */
export function primerError(e: z.ZodError): { error: string; campo?: string } {
  const i = e.issues[0];
  const campo = i?.path[0] !== undefined ? String(i.path[0]) : undefined;
  return { error: i?.message ?? "Datos inválidos", ...(campo ? { campo } : {}) };
}

/** Mensaje si el mes de arranque no corresponde a la frecuencia final; null si está bien. */
export function errorMesArranque(frecuencia: string, mesArranque: number | null | undefined): string | null {
  if (frecuencia === "mensual" && mesArranque != null) {
    return "El mes de arranque solo aplica a frecuencias bimestral, trimestral, semestral o anual";
  }
  return null;
}

// --- Etiquetas y calidad ------------------------------------------------------------------------

/** El responsable de la obligación es el suyo y, si no lo tiene, el tesorero de su sociedad. */
export function responsableEfectivo(o: { responsable: string | null; sociedad: { tesorero: { nombre: string } | null } }): { nombre: string | null; de: "obligacion" | "tesorero" | null } {
  if (o.responsable) return { nombre: o.responsable, de: "obligacion" };
  if (o.sociedad.tesorero) return { nombre: o.sociedad.tesorero.nombre, de: "tesorero" };
  return { nombre: null, de: null };
}

export interface ObligacionCalidad {
  id: number;
  sociedad: string;
  proveedor: string;
  identificador: string;
  activa: boolean;
  frecuencia: string;
  frecuenciaPorConfirmar: boolean;
  mesArranque: number | null;
  diaEsperadoPago: number | null;
  montoEsperado: number | null;
  monedaPorConfirmar: boolean;
  cuentaEsperadaId: number | null;
  /** responsable efectivo: el de la obligación o, si no tiene, el tesorero de su sociedad */
  responsable: string | null;
}

export type CodigoEtiqueta = "falta_dia" | "falta_mes_arranque" | "id_repetido" | "formato_iban";

export interface Etiqueta {
  codigo: CodigoEtiqueta;
  texto: string;
  ayuda: string;
}

const claveId = (o: { sociedad: string; identificador: string }) => `${o.sociedad}|${identificadorClave(o.identificador)}`;

/** Grupos de obligaciones activas con el mismo identificador en una sociedad y distinto proveedor. */
export function identificadoresRepetidos(obs: ObligacionCalidad[]) {
  const grupos = new Map<string, ObligacionCalidad[]>();
  for (const o of obs.filter((x) => x.activa)) grupos.set(claveId(o), [...(grupos.get(claveId(o)) ?? []), o]);
  return [...grupos.values()]
    .filter((g) => new Set(g.map((o) => o.proveedor.toLowerCase())).size > 1)
    .map((g) => ({ sociedad: g[0]!.sociedad, identificador: g[0]!.identificador, proveedores: g.map((o) => o.proveedor), obligaciones: g.map((o) => o.id) }));
}

/**
 * Observaciones de una obligación: solo problemas reales. Monto, cuenta y responsable son datos opcionales y no se
 * señalan; frecuencia y moneda por confirmar siguen guardadas como dato interno, pero no se muestran como observación.
 */
export function etiquetasDe(o: ObligacionCalidad, repetidos: ReturnType<typeof identificadoresRepetidos>): Etiqueta[] {
  const e: Etiqueta[] = [];
  if (o.diaEsperadoPago === null) e.push({ codigo: "falta_dia", texto: "Falta día", ayuda: "Sin día esperado de pago no se pueden generar sus vencimientos. Indíquelo al editar." });
  if (o.frecuencia !== "mensual" && o.mesArranque === null) {
    e.push({ codigo: "falta_mes_arranque", texto: "Falta mes de arranque", ayuda: "Para una frecuencia no mensual indique en qué mes toca el primer pago." });
  }
  const rep = repetidos.find((g) => g.obligaciones.includes(o.id));
  if (rep) {
    const otros = rep.proveedores.filter((p) => p !== o.proveedor).join(", ");
    e.push({ codigo: "id_repetido", texto: "Identificador repetido", ayuda: `El mismo identificador aparece con otro proveedor (${otros}). Verifique cuál es el correcto.` });
  }
  if (pareceIban(o.identificador)) {
    e.push({ codigo: "formato_iban", texto: "Formato de IBAN", ayuda: "El identificador tiene formato de IBAN (cuenta bancaria), no de número de servicio. Verifique cuál es el correcto." });
  }
  return e;
}

export type EstadoObligacion = "activa" | "inactiva" | "en_revision";

/** Inactiva; activa con alguna observación = en revisión; activa sin observaciones = activa. */
export const estadoDeObligacion = (activa: boolean, observaciones: Etiqueta[]): EstadoObligacion =>
  !activa ? "inactiva" : observaciones.length > 0 ? "en_revision" : "activa";

/** Una sociedad con su nombre y si tiene estados de cuenta cargados (para separar las que no tienen estados). */
export interface SociedadParaCalidad {
  nombre: string;
  conEstados: boolean;
}

export function calidadCatalogo(obs: ObligacionCalidad[], sociedades: SociedadParaCalidad[]) {
  const activas = obs.filter((o) => o.activa);
  const conActivas = new Set(activas.map((o) => o.sociedad));
  const sinObligaciones = sociedades.filter((s) => !conActivas.has(s.nombre));
  const n = (f: (o: ObligacionCalidad) => boolean) => activas.filter(f).length;
  return {
    total: obs.length,
    activas: activas.length,
    inactivas: obs.length - activas.length,
    sinDia: n((o) => o.diaEsperadoPago === null),
    sinMonto: n((o) => o.montoEsperado === null),
    sinCuenta: n((o) => o.cuentaEsperadaId === null),
    sinResponsable: n((o) => o.responsable === null),
    sinMesArranque: n((o) => o.frecuencia !== "mensual" && o.mesArranque === null),
    frecuenciaPorConfirmar: n((o) => o.frecuenciaPorConfirmar),
    monedaPorConfirmar: n((o) => o.monedaPorConfirmar),
    identificadoresRepetidos: identificadoresRepetidos(obs),
    formatoIban: activas.filter((o) => pareceIban(o.identificador)).map((o) => ({ id: o.id, sociedad: o.sociedad, proveedor: o.proveedor, identificador: o.identificador })),
    // con estados de cuenta pero sin obligaciones: aviso individual (algo falta en el catálogo)
    sociedadesSinObligaciones: sinObligaciones.filter((s) => s.conEstados).map((s) => s.nombre).sort(),
    // sin estados de cuenta ni obligaciones: una sola línea resumen (sociedades sin movimiento cargado)
    sociedadesSinEstadosNiObligaciones: sinObligaciones.filter((s) => !s.conEstados).map((s) => s.nombre).sort(),
  };
}
