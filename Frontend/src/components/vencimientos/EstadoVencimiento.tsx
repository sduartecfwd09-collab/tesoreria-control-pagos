import type { ReactNode } from "react";
import { nombreFecha } from "@/lib/formato";
import type { EstadoVencimiento, Vencimiento } from "@/lib/tipos";
import { Etiqueta, type Tono } from "../ui";

// Cada estado lleva etiqueta de texto e icono propios además del color: nunca se distingue solo por el color.
const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
);

const ICONOS: Record<EstadoVencimiento, ReactNode> = {
  // calendario
  proyectado: (
    <Svg>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 7h12M5 1.5v3M11 1.5v3" />
    </Svg>
  ),
  // reloj
  por_vencer: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </Svg>
  ),
  // triángulo de alerta
  vencido: (
    <Svg>
      <path d="M8 2 14.5 13.5h-13z" />
      <path d="M8 6.5v3.2M8 11.8v.1" />
    </Svg>
  ),
  // marca de verificación
  pagado: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.2 8.2 2 2 3.6-4" />
    </Svg>
  ),
  // marca con aviso
  pagado_con_inconsistencia: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8v3.8M8 11v.1" />
    </Svg>
  ),
  // signo de interrogación
  sin_informacion: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.3a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.4M8 11.6v.1" />
    </Svg>
  ),
  // lupa
  por_revisar: (
    <Svg>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </Svg>
  ),
};

export const ESTADO: Record<EstadoVencimiento, { texto: string; tono: Tono; extra?: string }> = {
  proyectado: { texto: "Proyectado", tono: "suave" },
  por_vencer: { texto: "Por vencer", tono: "ambar" },
  vencido: { texto: "Vencido", tono: "rojo", extra: "border border-rojo" },
  pagado: { texto: "Pagado", tono: "verde" },
  pagado_con_inconsistencia: { texto: "Pagado con inconsistencia", tono: "ambar", extra: "border-2 border-ambar-texto" },
  sin_informacion: { texto: "Sin información", tono: "ambar", extra: "border border-dashed border-ambar-texto" },
  por_revisar: { texto: "Por revisar", tono: "verde", extra: "border-2 border-texto" },
};

export function EtiquetaEstado({ estado }: { estado: EstadoVencimiento }) {
  const e = ESTADO[estado] ?? { texto: estado, tono: "suave" as const };
  return (
    <Etiqueta tono={e.tono} extra={e.extra} icono={ICONOS[estado]}>
      {e.texto}
    </Etiqueta>
  );
}

/** Explicación que acompaña al estado cuando hace falta (vencido sin confirmar, sin información, inconsistencia, por revisar). */
export function detalleDeEstado(v: Pick<Vencimiento, "estado" | "fecha" | "sinInfoHasta" | "textoEstado" | "motivo">): string | null {
  if (v.estado === "sin_informacion") {
    return v.sinInfoHasta
      ? `Venció el ${nombreFecha(v.fecha)}; no hay estado de cuenta cargado después del ${nombreFecha(v.sinInfoHasta)}`
      : `Venció el ${nombreFecha(v.fecha)}; no hay estado de cuenta cargado de esa fecha`;
  }
  if (v.estado === "vencido" && v.motivo?.includes("sin estado de cuenta")) return "Sin estado de cuenta que lo confirme";
  if (v.estado === "pagado_con_inconsistencia" || v.estado === "por_revisar") return v.textoEstado ?? v.motivo;
  return null;
}
