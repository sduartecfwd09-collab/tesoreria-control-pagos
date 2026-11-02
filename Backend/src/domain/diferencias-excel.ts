// Diferencias entre el Excel del catálogo (fuente principal) y la plataforma. Lógica pura: recibe las obligaciones y las filas del Excel ya
// resueltas (sociedad y categoría de la plataforma) y devuelve las diferencias. NUNCA une nada sola: solo propone y decide una persona.
//   posible_renombre: una obligación activa que el Excel ya no trae + una nueva que el Excel sí trae y que se parece de forma CLARA.
//   ya_no_esta:       una obligación activa del catálogo que el Excel ya no trae (y que no forma una pareja clara).
//   dia_distinto:     el día del Excel difiere del vigente en la plataforma (solo se muestra cuando Tesorería lo editó a mano; si no, el Excel manda).
import { createHash } from "node:crypto";
import { claveNombre } from "../catalogo/lector.js";
import type { LineaCambio } from "./historial.js";
import { identificadorClave } from "./identificadores.js";

export type TipoDiferencia = "posible_renombre" | "ya_no_esta" | "dia_distinto";
export const TIPOS_DIFERENCIA: TipoDiferencia[] = ["posible_renombre", "ya_no_esta", "dia_distinto"];
export type AccionDiferencia = "es_la_misma" | "son_distintas" | "sigue_vigente" | "desactivar" | "mantener_plataforma" | "usar_excel";

/** Qué acciones admite cada tipo (la persona nunca ve una acción sin destino). */
export const ACCIONES_DE: Record<TipoDiferencia, AccionDiferencia[]> = {
  posible_renombre: ["es_la_misma", "son_distintas"],
  ya_no_esta: ["sigue_vigente", "desactivar"],
  dia_distinto: ["mantener_plataforma", "usar_excel"],
};

export const TIPO_DECISION_DIFERENCIA = "diferencia_excel";
export const CAMPO_DIFERENCIA = "diferencia_excel";

export interface ObligacionDif {
  id: number;
  sociedadId: number;
  categoriaId: number;
  proveedor: string;
  identificador: string;
  dia: number | null;
  diaEditado: boolean;
  frecuencia: string;
  activa: boolean;
  origen: string;
  /** tiene algún vencimiento pagado: una obligación nueva con pagos no es «nueva» (no se sugiere como pareja) */
  conPagos: boolean;
}

export interface FilaExcel {
  sociedadId: number;
  categoriaId: number;
  proveedor: string;
  identificador: string;
  dia: number | null;
}

export interface Diferencia {
  /** identificador estable de la diferencia en la API: «r-{vieja}-{nueva}», «y-{id}» o «d-{id}» */
  clave: string;
  tipo: TipoDiferencia;
  sociedadId: number;
  /** la obligación a la que se ancla la decisión (la vieja en un renombre) */
  obligacionId: number;
  /** la obligación nueva (solo en un renombre) */
  nuevaId: number | null;
  huella: string;
  /** lo que dice la plataforma y lo que dice el Excel, para la tabla (el identificador se enmascara al responder) */
  plataforma: { proveedor: string; identificador: string; dia: number | null };
  excel: { proveedor: string; identificador: string; dia: number | null } | null;
}

export const claveObligacion = (sociedadId: number, proveedor: string, identificador: string, categoriaId: number) =>
  `${sociedadId}|${claveNombre(proveedor)}|${identificadorClave(identificador)}|${categoriaId}`;

/** Clave única de la decisión vigente (columna `unicaObligacionPeriodo`, máximo 60 caracteres; «x|» la distingue de las demás). */
export const claveUnicaDiferencia = (d: { clave: string }) => `x|${d.clave}`;

const sha = (partes: unknown[]) => createHash("sha256").update(JSON.stringify(partes)).digest("hex");

/**
 * Calcula las diferencias. Una pareja es CLARA solo si, dentro de la misma sociedad, categoría, frecuencia y día (con día definido), hay exactamente
 * UNA obligación activa del catálogo que el Excel ya no trae y exactamente UNA que el Excel trae sin pagos todavía. Si hay más de una de cualquiera
 * de las dos, no se sugiere pareja: las viejas salen como «ya no está» y que decida una persona.
 */
export function calcularDiferencias(obligaciones: ObligacionDif[], filas: FilaExcel[]): Diferencia[] {
  const enExcel = new Map<string, FilaExcel>();
  for (const f of filas) {
    const k = claveObligacion(f.sociedadId, f.proveedor, f.identificador, f.categoriaId);
    if (!enExcel.has(k)) enExcel.set(k, f);
  }
  const delCatalogo = obligaciones.filter((o) => o.origen === "catalogo" && o.activa);
  const llave = (o: ObligacionDif) => claveObligacion(o.sociedadId, o.proveedor, o.identificador, o.categoriaId);
  const viejas = delCatalogo.filter((o) => !enExcel.has(llave(o)));
  const presentes = delCatalogo.filter((o) => enExcel.has(llave(o)));
  const salida: Diferencia[] = [];

  // posibles renombres: grupos con exactamente una vieja y una nueva
  const grupo = (o: ObligacionDif) => `${o.sociedadId}|${o.categoriaId}|${o.frecuencia}|${o.dia}`;
  const viejasPorGrupo = new Map<string, ObligacionDif[]>();
  for (const o of viejas) if (o.dia !== null) viejasPorGrupo.set(grupo(o), [...(viejasPorGrupo.get(grupo(o)) ?? []), o]);
  const nuevasPorGrupo = new Map<string, ObligacionDif[]>();
  for (const o of presentes) if (o.dia !== null && !o.conPagos) nuevasPorGrupo.set(grupo(o), [...(nuevasPorGrupo.get(grupo(o)) ?? []), o]);
  const emparejadas = new Set<number>();
  for (const [g, vs] of viejasPorGrupo) {
    const ns = nuevasPorGrupo.get(g) ?? [];
    if (vs.length !== 1 || ns.length !== 1) continue;
    const v = vs[0]!;
    const n = ns[0]!;
    const f = enExcel.get(llave(n))!;
    emparejadas.add(v.id);
    const clave = `r-${v.id}-${n.id}`;
    salida.push({
      clave, tipo: "posible_renombre", sociedadId: v.sociedadId, obligacionId: v.id, nuevaId: n.id,
      huella: sha(["r", v.id, n.id, claveNombre(v.proveedor), identificadorClave(v.identificador), claveNombre(n.proveedor), identificadorClave(n.identificador), v.dia]),
      plataforma: { proveedor: v.proveedor, identificador: v.identificador, dia: v.dia },
      excel: { proveedor: f.proveedor, identificador: f.identificador, dia: f.dia },
    });
  }
  for (const v of viejas) {
    if (emparejadas.has(v.id)) continue;
    salida.push({
      clave: `y-${v.id}`, tipo: "ya_no_esta", sociedadId: v.sociedadId, obligacionId: v.id, nuevaId: null,
      huella: sha(["y", v.id, claveNombre(v.proveedor), identificadorClave(v.identificador), v.dia]),
      plataforma: { proveedor: v.proveedor, identificador: v.identificador, dia: v.dia }, excel: null,
    });
  }
  // día distinto: solo si Tesorería editó el día a mano (si no, la reimportación ya lo igualó) y el Excel trae un día válido
  for (const o of presentes) {
    const f = enExcel.get(llave(o))!;
    if (!o.diaEditado || o.dia === null || f.dia === null || f.dia === o.dia) continue;
    salida.push({
      clave: `d-${o.id}`, tipo: "dia_distinto", sociedadId: o.sociedadId, obligacionId: o.id, nuevaId: null,
      huella: sha(["d", o.id, o.dia, f.dia]),
      plataforma: { proveedor: o.proveedor, identificador: o.identificador, dia: o.dia },
      excel: { proveedor: f.proveedor, identificador: f.identificador, dia: f.dia },
    });
  }
  return salida;
}

/** Valores del historial: antes siempre «pendiente»; después según la resolución (el proveedor de la nueva se acorta: la columna admite 100 caracteres). */
export const DESPUES_HISTORIAL: Record<AccionDiferencia, string> = {
  es_la_misma: "misma", son_distintas: "distintas", sigue_vigente: "vigente", desactivar: "desactivada", mantener_plataforma: "plataforma", usar_excel: "excel",
};
export const ACCION_HISTORIAL: Record<AccionDiferencia, string> = {
  es_la_misma: "es_la_misma", son_distintas: "son_distintas", sigue_vigente: "sigue_vigente", desactivar: "desactivar_diferencia", mantener_plataforma: "mantener_plataforma", usar_excel: "usar_excel",
};

export function lineaDeDiferencia(accion: AccionDiferencia, proveedorNueva?: string): LineaCambio {
  const base = DESPUES_HISTORIAL[accion];
  const despues = accion === "es_la_misma" && proveedorNueva ? `${base}:${proveedorNueva.slice(0, 80)}` : base;
  return { accion: ACCION_HISTORIAL[accion] as LineaCambio["accion"], campo: CAMPO_DIFERENCIA, antes: "pendiente", despues };
}
