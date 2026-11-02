// Filtro por tarjeta: una sola definición por pantalla, con funciones puras. El número de la tarjeta y las filas que
// deja el filtro salen de la MISMA lista y de la MISMA regla, así que no pueden diferir.
import type { ArchivoImportado, ClaveGrupoAviso, EstadoVencimiento, FilaAviso, GrupoAviso, Vencimiento } from "./tipos";

export interface DefTarjeta<T> {
  clave: string;
  coincide: (x: T) => boolean;
}

/** Cuántos elementos de la lista corresponden a cada tarjeta. */
export function contarPorTarjeta<T>(lista: readonly T[], defs: readonly DefTarjeta<T>[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const d of defs) r[d.clave] = lista.filter(d.coincide).length;
  return r;
}

/** Las filas de la tarjeta activa; sin tarjeta activa (null), la lista completa. */
export function filtrarPorTarjeta<T>(lista: readonly T[], defs: readonly DefTarjeta<T>[], activa: string | null): T[] {
  if (activa === null) return [...lista];
  const d = defs.find((x) => x.clave === activa);
  return d ? lista.filter(d.coincide) : [...lista];
}

/** Un toque activa la tarjeta; un segundo toque sobre la misma quita el filtro. */
export function alternarTarjeta(activa: string | null, clave: string): string | null {
  return activa === clave ? null : clave;
}

const deEstados = (clave: string, ...e: EstadoVencimiento[]): DefTarjeta<Vencimiento> => ({ clave, coincide: (v) => e.includes(v.estado) });

/** Pagos del mes: las tarjetas del resumen (las cuatro de siempre y «Justificados»). */
export const TARJETAS_PAGOS: DefTarjeta<Vencimiento>[] = [
  deEstados("vencidos", "vencido"),
  deEstados("por_vencer", "por_vencer"),
  deEstados("pagados", "pagado", "pagado_con_inconsistencia"),
  deEstados("sin_informacion", "sin_informacion"),
  deEstados("justificados", "justificado"),
];

/** Avisos: cada grupo es una tarjeta; la lista se aplana con la clave de su grupo. */
export interface FilaDeGrupo {
  clave: ClaveGrupoAviso;
  fila: FilaAviso;
}
export const aplanarAvisos = (grupos: readonly GrupoAviso[]): FilaDeGrupo[] => grupos.flatMap((g) => g.filas.map((fila) => ({ clave: g.clave, fila })));
export const TARJETAS_AVISOS: DefTarjeta<FilaDeGrupo>[] = (["vencidos", "por_vencer", "por_revisar", "sin_informacion"] as const).map((c) => ({ clave: c, coincide: (x: FilaDeGrupo) => x.clave === c }));

/** Estados de cuenta: las tarjetas por estado del archivo. */
export const TARJETAS_ARCHIVOS: DefTarjeta<ArchivoImportado>[] = [
  { clave: "leidos", coincide: (a) => a.estado === "leido" },
  { clave: "con_error", coincide: (a) => a.estado === "con_error" },
  { clave: "sin_sociedad", coincide: (a) => a.estado === "sin_sociedad" },
  { clave: "retirados", coincide: (a) => a.estado === "retirado" },
];
