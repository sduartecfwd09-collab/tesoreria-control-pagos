"use client";
import { useId, useMemo, useState, type ReactNode } from "react";
import { ContextoMensajeFiltros } from "./SelectorFechas";

/**
 * Recuadro de fondo suave con todos los filtros en una fila (baja a otra solo si no caben), alineados por su base.
 * Los mensajes del selector de fechas salen en una línea propia debajo de TODA la fila, a todo el ancho del recuadro: así nunca
 * mueven ni desalinean los controles. `derecha` pone contenido al extremo derecho, centrado verticalmente (en pantalla angosta pasa a
 * otra línea). `completa` estira el recuadro a todo el ancho; por defecto se ajusta al contenido.
 */
export function CajaFiltros({ etiqueta, children, derecha, completa = false }: { etiqueta: string; children: ReactNode; derecha?: ReactNode; completa?: boolean }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const idMensaje = useId();
  const contexto = useMemo(() => ({ ponerMensaje: setMensaje, idMensaje }), [idMensaje]);
  return (
    <ContextoMensajeFiltros.Provider value={contexto}>
      <section aria-label={etiqueta} className={`mt-5 flex ${completa ? "w-full" : "w-fit"} max-w-full flex-wrap items-end gap-x-4 gap-y-3 rounded-[14px] border border-divisor bg-tinte-filtros p-4`}>
        {children}
        {derecha && <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1 self-center">{derecha}</div>}
        {mensaje && <p id={idMensaje} role="alert" className="basis-full text-sm font-semibold text-rojo">{mensaje}</p>}
      </section>
    </ContextoMensajeFiltros.Provider>
  );
}
