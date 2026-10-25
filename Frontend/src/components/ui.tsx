// Piezas visuales compartidas. Los estados siempre llevan texto además del color.
import type { ReactNode } from "react";

export type Tono = "ambar" | "rojo" | "suave" | "verde";

const TONOS: Record<Tono, string> = {
  ambar: "bg-ambar-fondo text-ambar-texto",
  rojo: "bg-rojo-fondo text-rojo",
  suave: "bg-fondo-suave text-suave border border-divisor",
  verde: "bg-acento text-sobre-acento",
};

export function Etiqueta({ children, tono, titulo }: { children: ReactNode; tono: Tono; titulo?: string }) {
  return (
    <span title={titulo} className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}>
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

export function Paginador({ pagina, paginas, total, unidad, alCambiar }: { pagina: number; paginas: number; total: number; unidad: string; alCambiar: (p: number) => void }) {
  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <button type="button" className={claseBotonSecundario} disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        Anterior
      </button>
      <span aria-live="polite">
        Página <strong>{pagina}</strong> de {paginas} · {total.toLocaleString("es-CR")} {unidad}
      </span>
      <button type="button" className={claseBotonSecundario} disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>
        Siguiente
      </button>
    </nav>
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
