// Formatos compartidos: montos (centavos <-> pantalla), meses y periodos AAAA-MM.
import type { Frecuencia, Moneda } from "./tipos";

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const FRECUENCIAS: { valor: Frecuencia; texto: string; paso: number }[] = [
  { valor: "mensual", texto: "Mensual (todos los meses)", paso: 1 },
  { valor: "bimestral", texto: "Bimestral (cada 2 meses)", paso: 2 },
  { valor: "trimestral", texto: "Trimestral (cada 3 meses)", paso: 3 },
  { valor: "semestral", texto: "Semestral (cada 6 meses)", paso: 6 },
  { valor: "anual", texto: "Anual (una vez al año)", paso: 12 },
];

export const SIMBOLO: Record<Moneda, string> = { CRC: "₡", USD: "$" };
export const NOMBRE_MONEDA: Record<Moneda, string> = { CRC: "Colones (₡)", USD: "Dólares ($)" };

/** 150050 centavos -> "₡1 500,50" (formato de Costa Rica). */
export function monto(centavos: number | null, moneda: Moneda): string {
  if (centavos === null) return "—";
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda, minimumFractionDigits: 2 }).format(centavos / 100);
}

/** Monto pagado con la moneda de la cuenta que pagó: CRC o USD con su símbolo; sin dato, solo el número (sin símbolo ni código). */
export function montoPagado(centavos: number, moneda: string | null): string {
  if (moneda === "CRC" || moneda === "USD") return monto(centavos, moneda);
  return new Intl.NumberFormat("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100);
}

/** Texto del formulario ("1500,50" o "1500.50") a centavos; "" -> null; inválido -> undefined. */
export function aCentavos(texto: string): number | null | undefined {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return undefined;
  const [entero, dec = ""] = t.split(/[.,]/);
  return Number(entero) * 100 + Number(dec.padEnd(2, "0"));
}

/** Centavos a texto editable: 150050 -> "1500,50"; null -> "". */
export function aTextoMonto(centavos: number | null): string {
  if (centavos === null) return "";
  const dec = centavos % 100;
  return dec === 0 ? String(centavos / 100) : `${Math.floor(centavos / 100)},${String(dec).padStart(2, "0")}`;
}

/** "2026-08" -> "agosto 2026". */
export const nombrePeriodo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

// Año en curso según el servidor (lo fija la línea «Hoy»); mientras no se conoce, el del reloj del navegador.
let anioEnCurso = String(new Date().getFullYear());
export const fijarAnioEnCurso = (hoy: string) => {
  anioEnCurso = hoy.slice(0, 4);
};

/** "2026-08-15" -> "15 ago" si es del año en curso; de otro año, con año: "15 ago 2025". */
export const nombreFecha = (f: string, anio: string = anioEnCurso) => {
  const dia = `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]}`;
  return f.slice(0, 4) === anio ? dia : `${dia} ${f.slice(0, 4)}`;
};

/** Periodo AAAA-MM desplazado n meses. */
export function sumarMeses(p: string, n: number): string {
  const i = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export const periodoActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Meses del año en que vence según frecuencia y mes de arranque (para la vista previa del formulario). */
export function mesesQueVence(frecuencia: Frecuencia, mesArranque: number | null): number[] {
  const paso = FRECUENCIAS.find((f) => f.valor === frecuencia)?.paso ?? 1;
  if (paso === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (mesArranque === null) return [];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => (((m - mesArranque) % paso) + paso) % paso === 0);
}

// --- Sociedades: orden y nombre ----------------------------------------------------------------

/** Clave de orden de un nombre: sin mayúsculas, tildes ni signos al inicio. */
const claveOrden = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "");

/** Orden alfabético por nombre largo; los nombres que empiezan con número (por ejemplo «3-101-…») van al final. */
export function compararSociedades(a: string, b: string): number {
  const ka = claveOrden(a);
  const kb = claveOrden(b);
  const numA = /^\d/.test(ka);
  const numB = /^\d/.test(kb);
  if (numA !== numB) return numA ? 1 : -1;
  return ka.localeCompare(kb, "es", { sensitivity: "base", numeric: true });
}

export const ordenarSociedades = <T extends { nombreLargo: string }>(xs: T[]): T[] => [...xs].sort((a, b) => compararSociedades(a.nombreLargo, b.nombreLargo));

const PARTES_CR = new Intl.DateTimeFormat("en-US", { timeZone: "America/Costa_Rica", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Fecha y hora corta en la zona de Costa Rica, p. ej. «28 oct 2026, 10:30». Devuelve null si el texto no es una fecha válida. */
export function fechaHoraCR(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(PARTES_CR.formatToParts(d).map((x) => [x.type, x.value]));
  return `${Number(p.day)} ${MESES_CORTOS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** «Estados calculados el 28 oct 2026, 10:30», o «Estados sin calcular todavía» si nunca se calcularon. */
export function textoEstadosCalculados(iso: string | null): string {
  const f = iso ? fechaHoraCR(iso) : null;
  return f ? `Estados calculados el ${f}` : "Estados sin calcular todavía";
}

/** «sábado, 31 de octubre de 2026» a partir de AAAA-MM-DD (solo día, sin zona horaria). */
export const textoHoy = (hoy: string) =>
  new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${hoy}T00:00:00Z`));

// --- Historial de cambios: nombres de negocio y valores en palabras (puras, sin red) ---------------------------------------

/** Frecuencia en una palabra, la misma de la confirmación de Editar obligación. */
export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

/** «Qué cambió»: el rótulo de cada dato. Los de Editar obligación se reutilizan; los demás son sencillos. */
const ROTULO_CAMPO: Record<string, string> = {
  frecuencia: "Frecuencia",
  frecuenciaPorConfirmar: "Frecuencia confirmada",
  mesArranque: "Mes de arranque",
  diaEsperadoPago: "Día de pago",
  activa: "Obligación activa",
  controlDesde: "Control desde",
  montoEsperado: "Monto esperado",
  moneda: "Moneda",
  cuentaEsperadaId: "Cuenta de pago",
  obligacion: "Obligación nueva",
  pago_asociado: "Pago del vencimiento",
  justificacion_vencimiento: "Justificación del vencimiento",
  justificacion_archivo: "Justificación del archivo",
};
export const rotuloDeCampo = (campo: string): string => ROTULO_CAMPO[campo] ?? "Otro dato";

/**
 * ÚNICO mapa campo -> grupo del filtro «Qué cambió» (y el orden de las opciones dentro de cada grupo). Para agregar una decisión nueva (una
 * justificación, una nota de revisión...), se agrega su campo al grupo «Decisiones manuales» y su rótulo en ROTULO_CAMPO.
 */
export const GRUPOS_DE_CAMPOS: { titulo: string; campos: string[] }[] = [
  { titulo: "Datos de la obligación", campos: ["frecuencia", "frecuenciaPorConfirmar", "mesArranque", "diaEsperadoPago", "activa", "controlDesde", "montoEsperado", "moneda", "cuentaEsperadaId", "obligacion"] },
  { titulo: "Decisiones manuales", campos: ["pago_asociado", "justificacion_vencimiento", "justificacion_archivo"] },
];

/**
 * Los tipos de dato que hay dentro del alcance de la persona, en sus grupos. Un grupo sin opciones no se muestra. Un campo que ningún grupo
 * conoce (no debería pasar) se agrega al final del primero, para que nunca quede fuera del filtro.
 */
export function agruparCampos(disponibles: string[]): { titulo: string; campos: string[] }[] {
  const conocidos = new Set(GRUPOS_DE_CAMPOS.flatMap((g) => g.campos));
  return GRUPOS_DE_CAMPOS.map((g, i) => ({
    titulo: g.titulo,
    campos: [...g.campos.filter((x) => disponibles.includes(x)), ...(i === 0 ? disponibles.filter((x) => !conocidos.has(x)) : [])],
  })).filter((g) => g.campos.length > 0);
}

/** De estos datos no se guarda el valor (confidencial): solo se sabe que cambiaron. */
const CAMPOS_SIN_VALOR = ["montoEsperado", "moneda", "cuentaEsperadaId"];

const mayuscula = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/** "2026-10" -> "oct 2026". */
export const mesCorto = (p: string) => `${MESES_CORTOS[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

/**
 * Un valor guardado, en palabras. «Frecuencia confirmada» se guarda al revés (sin confirmar = porConfirmar verdadero) y aquí se
 * muestra como la casilla de Editar: porConfirmar verdadero = «No», falso = «Sí».
 */
export function valorEnPalabras(campo: string, valor: string | null): string {
  if (valor === null) return campo === "diaEsperadoPago" ? "Sin día" : "Sin definir";
  switch (campo) {
    case "frecuencia": return NOMBRE_FRECUENCIA[valor as Frecuencia] ?? "Otro valor";
    case "frecuenciaPorConfirmar": return valor === "sin confirmar" || valor === "true" ? "No" : "Sí";
    case "activa": return valor === "activa" || valor === "true" ? "Sí" : "No";
    case "mesArranque": return mayuscula(MESES[Number(valor) - 1] ?? "Otro valor");
    case "diaEsperadoPago": return `día ${Number(valor)}`;
    case "controlDesde": return /^\d{4}-\d{2}$/.test(valor) ? mesCorto(valor) : "Otro valor";
    default: return "Otro valor";
  }
}

/** `vacio`: no hay nada que mostrar (la celda queda en blanco); `valores`: hay un antes y un después (y solo entonces va la flecha). */
export type CambioEnPalabras = { tipo: "vacio" } | { tipo: "sin_valores" } | { tipo: "valores"; antes: string; despues: string };

/**
 * «Qué cambió» de una fila: el rótulo del dato. Al asociar o quitar un pago a mano dice de qué vencimiento, «Pago del vencimiento de oct 2026»
 * (el periodo AAAA-MM guardado: en «después» al asociar y en «antes» al quitar); si el periodo no se puede leer, «Pago del vencimiento».
 */
export function rotuloDeFila(f: { accion: string; campo: string; antes?: string | null; despues?: string | null }): string {
  const periodoLegible = (p: string | null | undefined) => (p && /^\d{4}-\d{2}$/.test(p) ? mesCorto(p) : null);
  if (f.accion === "asociar_pago" || f.accion === "quitar_asociacion") {
    const mes = periodoLegible(f.accion === "asociar_pago" ? f.despues : f.antes);
    return mes ? `Pago del vencimiento de ${mes}` : "Pago del vencimiento";
  }
  // justificar un vencimiento dice de qué vencimiento; justificar un archivo es siempre «Justificación del archivo»
  if ((f.accion === "justificar" || f.accion === "quitar_justificacion") && f.campo === "justificacion_vencimiento") {
    const mes = periodoLegible(f.accion === "justificar" ? f.despues : f.antes);
    return mes ? `Justificación del vencimiento de ${mes}` : "Justificación del vencimiento";
  }
  return rotuloDeCampo(f.campo);
}

/**
 * Lo que va en «Antes → Después»: el alta no tiene valores (vacío); asociar y quitar un pago a mano pasan de «Sin asociar» a «Asociado a mano»
 * y al revés; monto/moneda/cuenta dicen «Cambió»; el resto, antes y después. La flecha solo se dibuja cuando hay dos valores.
 */
export function cambioEnPalabras(f: { accion: string; campo: string; antes: string | null; despues: string | null }): CambioEnPalabras {
  if (f.accion === "crear") return { tipo: "vacio" };
  if (f.accion === "asociar_pago") return { tipo: "valores", antes: "Sin asociar", despues: "Asociado a mano" };
  if (f.accion === "quitar_asociacion") return { tipo: "valores", antes: "Asociado a mano", despues: "Sin asociar" };
  if (f.accion === "justificar") return { tipo: "valores", antes: "Sin justificar", despues: "Justificado" };
  if (f.accion === "quitar_justificacion") return { tipo: "valores", antes: "Justificado", despues: "Sin justificar" };
  if (CAMPOS_SIN_VALOR.includes(f.campo)) return { tipo: "sin_valores" };
  return { tipo: "valores", antes: valorEnPalabras(f.campo, f.antes), despues: valorEnPalabras(f.campo, f.despues) };
}

/** Fecha y hora en la zona de Costa Rica; con año solo si no es el año en curso: «28 oct, 10:30» o «28 oct 2025, 10:30». null si no es una fecha. */
export function fechaHoraDeCambio(iso: string, anio: string = anioEnCurso): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(PARTES_CR.formatToParts(d).map((x) => [x.type, x.value]));
  const dia = `${Number(p.day)} ${MESES_CORTOS[Number(p.month) - 1]}`;
  return `${p.year === anio ? dia : `${dia} ${p.year}`}, ${p.hour}:${p.minute}`;
}

/** Solo el día de un instante, en la zona de Costa Rica; con año solo si no es el año en curso: «28 oct» o «28 oct 2025». null si no es una fecha. */
export function fechaDeCambio(iso: string, anio: string = anioEnCurso): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(PARTES_CR.formatToParts(d).map((x) => [x.type, x.value]));
  const dia = `${Number(p.day)} ${MESES_CORTOS[Number(p.month) - 1]}`;
  return p.year === anio ? dia : `${dia} ${p.year}`;
}

/** «Asociado a mano por Ana Uno el 28 oct. Motivo: se pagó con otra referencia.» (sin punto doble si el motivo ya termina en punto). */
export function fraseAsociadoAMano(a: { quien: string; cuando: string; motivo: string }, anio?: string): string {
  const fecha = fechaDeCambio(a.cuando, anio);
  return `Asociado a mano por ${a.quien}${fecha ? ` el ${fecha}` : ""}. Motivo: ${a.motivo.replace(/[.\s]+$/, "")}.`;
}

/** Estados en los que se puede asociar un pago a mano (el servidor es quien decide; esto solo evita ofrecer lo imposible). */
export const ESTADOS_ASOCIABLES = ["por_revisar", "vencido", "sin_informacion", "justificado"];

/** Estados que se pueden justificar (un Justificado ya lo está: ofrece quitar la justificación). */
export const ESTADOS_JUSTIFICABLES = ["vencido", "sin_informacion"];

/** «Justificado por Ana el 28 oct. Motivo: No se paga este mes: la tienda cerró.» (el motivo y, si hay, la nota; sin punto doble). */
export function fraseJustificado(j: { quien: string; cuando: string; motivo: string; nota: string | null }, anio?: string): string {
  const fecha = fechaDeCambio(j.cuando, anio);
  const motivo = (j.nota ? `${j.motivo}: ${j.nota}` : j.motivo).replace(/[.\s]+$/, "");
  return `Justificado por ${j.quien}${fecha ? ` el ${fecha}` : ""}. Motivo: ${motivo}.`;
}

/** Etiquetas de texto de un pago candidato: «Trae el número» y/o «Trae el proveedor» (ninguna si no trae ninguno). */
export function etiquetasDeCandidato(c: { traeNumero: boolean; traeProveedor: boolean }): string[] {
  return [...(c.traeNumero ? ["Trae el número"] : []), ...(c.traeProveedor ? ["Trae el proveedor"] : [])];
}
