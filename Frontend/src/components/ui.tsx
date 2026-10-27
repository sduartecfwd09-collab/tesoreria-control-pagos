"use client";
// Piezas visuales compartidas. Los estados siempre llevan texto además del color.
import { useEffect, useRef, type ReactNode } from "react";

export type Tono = "ambar" | "rojo" | "suave" | "verde";

const TONOS: Record<Tono, string> = {
  ambar: "bg-ambar-fondo text-ambar-texto",
  rojo: "bg-rojo-fondo text-rojo",
  suave: "bg-fondo-suave text-suave border border-divisor",
  verde: "bg-acento text-sobre-acento",
};

export function Etiqueta({ children, tono, titulo, icono, extra = "" }: { children: ReactNode; tono: Tono; titulo?: string; icono?: ReactNode; extra?: string }) {
  return (
    <span title={titulo} className={`${icono ? "inline-flex items-center gap-1" : "inline-block"} whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONOS[tono]} ${extra}`}>
      {icono}
      {children}
    </span>
  );
}

export function CajaError({ mensaje, alReintentar }: { mensaje: string; alReintentar?: () => void }) {
  return (
    <div role="alert" className="mt-6 border-2 border-rojo bg-rojo-fondo text-rojo rounded p-4">
      <p className="font-semibold">{mensaje}</p>
      {alReintentar && (
        <button type="button" onClick={alReintentar} className="mt-3 bg-acento text-sobre-acento font-semibold rounded px-4 py-2">
          Reintentar
        </button>
      )}
    </div>
  );
}

export const claseControl = "border-2 border-control bg-fondo rounded px-3 py-2 text-base";
export const claseBoton = "bg-acento text-sobre-acento font-semibold rounded px-4 py-2 disabled:bg-fondo-suave disabled:text-suave disabled:cursor-not-allowed";
export const claseBotonSecundario = "border-2 border-control bg-fondo text-texto font-semibold rounded px-4 py-2 hover:bg-fondo-suave disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Final de una lista que continúa hacia abajo: al acercarse al final del scroll pide más filas (sin botones de página).
 * `cantidad` es cuántas filas hay cargadas: al cambiar se vuelve a observar, así sigue cargando si el final aún es visible.
 */
export function FinDeLista({ cantidad, total, unidad, hayMas, cargando, alLlegar }: { cantidad: number; total: number; unidad: string; hayMas: boolean; cargando: boolean; alLlegar: () => void }) {
  const marca = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = marca.current;
    if (!el || !hayMas) return;
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && alLlegar(), { rootMargin: "400px" });
    o.observe(el);
    return () => o.disconnect();
  }, [alLlegar, hayMas, cantidad]);
  return (
    <div ref={marca} className="mt-4 text-sm text-suave" aria-live="polite">
      {cargando ? "Cargando más…" : `${cantidad.toLocaleString("es-CR")} de ${total.toLocaleString("es-CR")} ${unidad}`}
    </div>
  );
}

/** Nombre largo de una sociedad en tablas: peso normal, letra pequeña y hasta 3 líneas, con el nombre completo al pasar el cursor. */
export function NombreSociedad({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span title={nombre} className={`line-clamp-3 text-xs ${className}`}>
      {nombre}
    </span>
  );
}

/** Campo de formulario con etiqueta, ayuda visible y error, enlazados por aria-describedby. */
export function Campo({ id, etiqueta, ayuda, error, children, extra }: { id: string; etiqueta: string; ayuda?: ReactNode; error?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="font-semibold">
        {etiqueta}
      </label>
      {extra}
      <div className="mt-1">{children}</div>
      {ayuda && (
        <p id={`${id}-ayuda`} className="mt-1 text-sm text-suave">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-rojo">
          {error}
        </p>
      )}
    </div>
  );
}

/** Valor para aria-describedby de un control dentro de <Campo>. */
export const describir = (id: string, ayuda: boolean, error: boolean) => [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
