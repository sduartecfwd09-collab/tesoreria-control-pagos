"use client";
import { useId, useMemo, useState, type ReactNode } from "react";
import { ContextoMensajeFiltros } from "./SelectorFechas";

/**
 * Recuadro de fondo suave con todos los filtros en una fila (baja a otra solo si no caben), alineados por su base.
 * Los mensajes del selector de fechas salen en una línea propia debajo de TODA la fila, a todo el ancho del recuadro: así nunca
 * mueven ni desalinean los controles. El recuadro se ajusta al tamaño de su contenido. `margen` es el margen superior (por defecto
 * mt-5); una pantalla que lo coloca dentro de una fila propia lo deja vacío y pone el margen en la fila. Con `mensajeSinAncho`
 * el mensaje no cuenta para el ancho del recuadro (ocupa el ancho que ya tiene y, si es más largo, baja a otra línea): así un mensaje
 * no ensancha el recuadro ni mueve lo que hay a su derecha.
 */
export function CajaFiltros({ etiqueta, children, margen = "mt-5", mensajeSinAncho = false }: { etiqueta: string; children: ReactNode; margen?: string; mensajeSinAncho?: boolean }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const idMensaje = useId();
  const contexto = useMemo(() => ({ ponerMensaje: setMensaje, idMensaje }), [idMensaje]);
  return (
    <ContextoMensajeFiltros.Provider value={contexto}>
      <section aria-label={etiqueta} className={`${margen} flex w-fit max-w-full flex-wrap items-end gap-x-4 gap-y-3 rounded-[14px] border border-divisor bg-tinte-filtros p-4`}>
        {children}
        {mensaje && <p id={idMensaje} role="alert" className={`${mensajeSinAncho ? "w-0 min-w-full" : "basis-full"} text-sm font-semibold text-rojo`}>{mensaje}</p>}
      </section>
    </ContextoMensajeFiltros.Provider>
  );
}
