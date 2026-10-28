import type { ReactNode } from "react";
import type { EstadoVencimiento } from "@/lib/tipos";
import { EstadoPago, IconoEstado } from "./EstadoPago";

// Tarjeta de resumen de «Pagos del mes» (maqueta aprobada), compartida con Avisos para que ambas pantallas se vean igual.
export const Icono = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    {children}
  </svg>
);

export function Tarjeta({ titulo, icono, insignia, detalle, acento, barra, children }: { titulo: string; icono: ReactNode; insignia?: ReactNode; detalle?: string; acento: string; barra?: number; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-divisor bg-fondo p-5 text-left">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-suave">
        {icono}
        {titulo}
      </span>
      <span className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[44px] font-extrabold leading-none">{children}</span>
        {insignia}
      </span>
      {detalle && <span className="text-[13px] text-suave">{detalle}</span>}
      {barra !== undefined && (
        <div className="h-2 overflow-hidden rounded-full bg-[#eeeeee]" role="img" aria-label={`${barra} % pagado`}>
          <div className="h-2 rounded-full bg-acento" style={{ width: `${barra}%` }} />
        </div>
      )}
      <div className={`mt-auto h-[3px] rounded-full ${acento}`} />
    </div>
  );
}

export const Insignia = ({ clase, children }: { clase: string; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${clase}`}>{children}</span>
);

/** Barra de acento de la tarjeta según el estado (los mismos colores de las etiquetas de estado). */
export const ACENTO_ESTADO: Record<EstadoVencimiento, string> = {
  vencido: "bg-rojo",
  por_vencer: "bg-ambar",
  por_revisar: "bg-acento",
  sin_informacion: "bg-suave",
  pagado: "bg-acento",
  pagado_con_inconsistencia: "bg-acento",
  proyectado: "bg-divisor",
};

/** Tarjeta de contador de un estado: ícono, etiqueta del estado, número y barra de acento. */
export function TarjetaDeEstado({ estado, titulo, children }: { estado: EstadoVencimiento; titulo: string; children: ReactNode }) {
  return (
    <Tarjeta titulo={titulo} acento={ACENTO_ESTADO[estado]} icono={<IconoEstado estado={estado} />} insignia={<EstadoPago estado={estado} />}>
      {children}
    </Tarjeta>
  );
}
