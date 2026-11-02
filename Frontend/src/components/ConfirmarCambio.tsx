"use client";
import { useState } from "react";
import { claseBoton, claseBotonSecundario } from "./ui";

export interface CambioPendiente {
  titulo: string;
  antes: string;
  despues: string;
  ejecutar: () => Promise<void>;
}

/** Confirmación de un cambio manual: muestra el valor de antes y el de después. */
export function ConfirmarCambio({ cambio, alCerrar }: { cambio: CambioPendiente; alCerrar: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setGuardando(true);
    setError(null);
    try {
      await cambio.ejecutar();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="confirmar-titulo" className="w-full max-w-lg rounded border-2 border-control bg-fondo p-6">
        <h2 id="confirmar-titulo" className="text-lg font-bold">{cambio.titulo}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded border border-divisor bg-fondo-suave p-3">
            <dt className="text-suave">Antes</dt>
            <dd className="mt-1 font-semibold whitespace-pre-line">{cambio.antes}</dd>
          </div>
          <div className="rounded border-2 border-control p-3">
            <dt className="text-suave">Después</dt>
            <dd className="mt-1 font-semibold whitespace-pre-line">{cambio.despues}</dd>
          </div>
        </dl>
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-rojo">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={claseBotonSecundario} onClick={alCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className={claseBoton} onClick={confirmar} disabled={guardando}>
            {guardando ? "Guardando…" : "Confirmar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aviso al intentar cerrar una ventana con cambios sin guardar. */
export function ConfirmarSalida({ alSalir, alSeguir }: { alSalir: () => void; alSeguir: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="salir-titulo" className="w-full max-w-md rounded border-2 border-control bg-fondo p-6">
        <h2 id="salir-titulo" className="text-lg font-bold">Hay cambios sin guardar. ¿Salir sin guardar?</h2>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={claseBotonSecundario} onClick={alSalir}>
            Salir sin guardar
          </button>
          <button type="button" className={claseBoton} onClick={alSeguir} autoFocus>
            Seguir editando
          </button>
        </div>
      </div>
    </div>
  );
}
