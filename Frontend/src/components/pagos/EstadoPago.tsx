import type { ReactNode } from "react";
import type { EstadoVencimiento } from "@/lib/tipos";

// Etiquetas de estado como en la maqueta: siempre texto e icono propios, además del color (nunca solo color).
const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
);

const ICONOS: Record<EstadoVencimiento, ReactNode> = {
  proyectado: (
    <Svg>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 7h12M5 1.5v3M11 1.5v3" />
    </Svg>
  ),
  por_vencer: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </Svg>
  ),
  vencido: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
    </Svg>
  ),
  pagado: (
    <Svg>
      <path d="m3 8.5 3.2 3.2L13 4.5" />
    </Svg>
  ),
  pagado_con_inconsistencia: (
    <Svg>
      <path d="m2.5 8.5 2.7 2.7L10 6.4M13 4v5M13 11.5v.1" />
    </Svg>
  ),
  sin_informacion: (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.3a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.4M8 11.6v.1" />
    </Svg>
  ),
  por_revisar: (
    <Svg>
      <path d="M8 2 14.5 13.5h-13z" />
      <path d="M8 6.5v3.2M8 11.8v.1" />
    </Svg>
  ),
};

interface Definicion {
  texto: string;
  clase: string;
  /** aparece al pasar el cursor sobre la etiqueta */
  ayuda: string;
}

export const ESTADO: Record<EstadoVencimiento, Definicion> = {
  vencido: { texto: "Vencido", clase: "bg-rojo text-fondo", ayuda: "Pasó la fecha de pago y el pago no aparece en los estados de cuenta." },
  sin_informacion: {
    texto: "Sin información",
    clase: "bg-ambar-fondo text-texto border border-dashed border-texto",
    ayuda: "Pasó la fecha, pero falta el estado de cuenta que permita saber si se pagó. Requiere atención.",
  },
  por_revisar: { texto: "Por revisar", clase: "bg-acento text-sobre-acento border-2 border-texto", ayuda: "Hay que verificar este pago: no se pudo asignar con certeza." },
  por_vencer: { texto: "Por vencer", clase: "bg-ambar text-texto", ayuda: "La fecha de pago está dentro de los días de aviso, o pasó hace pocos días y se espera el pago." },
  pagado_con_inconsistencia: {
    texto: "Pagado con inconsistencia",
    clase: "bg-acento text-sobre-acento border-2 border-ambar",
    ayuda: "Se pagó, pero por otra sociedad o más de una vez.",
  },
  pagado: { texto: "Pagado", clase: "bg-acento text-sobre-acento", ayuda: "El pago aparece en un estado de cuenta de la sociedad." },
  proyectado: { texto: "Programado", clase: "bg-fondo text-texto border border-dashed border-control", ayuda: "Todavía falta tiempo: la fecha de pago está fuera de los días de aviso." },
};

/** Orden de las filas: primero lo que más urgencia tiene. */
export const ORDEN: Record<EstadoVencimiento, number> = {
  vencido: 0, sin_informacion: 1, por_revisar: 2, por_vencer: 3, pagado_con_inconsistencia: 4, pagado: 5, proyectado: 6,
};

export function EstadoPago({ estado }: { estado: EstadoVencimiento }) {
  const e = ESTADO[estado] ?? { texto: estado, clase: "bg-fondo-suave text-suave border border-divisor", ayuda: "" };
  return (
    <span title={e.ayuda} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${e.clase}`}>
      {ICONOS[estado]}
      {e.texto}
    </span>
  );
}

/** Solo el ícono del estado (para tarjetas y encabezados). */
export function IconoEstado({ estado }: { estado: EstadoVencimiento }) {
  return <>{ICONOS[estado]}</>;
}

/** Etiqueta con el color, el ícono y el borde de un estado, pero con un texto propio (para grupos que no son un vencimiento). */
export function EtiquetaEstado({ estado, texto, ayuda }: { estado: EstadoVencimiento; texto: string; ayuda?: string }) {
  return (
    <span title={ayuda} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${ESTADO[estado].clase}`}>
      {ICONOS[estado]}
      {texto}
    </span>
  );
}
