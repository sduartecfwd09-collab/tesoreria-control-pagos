"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Ficha flotante de la aplicación (la misma de «Gestionar»): diálogo nativo con cabecera negra, que cierra con Escape, con el
 * botón o al pulsar fuera. El navegador mueve el foco al abrir, lo mantiene dentro y lo devuelve al botón que la abrió.
 */
export function Ficha({ etiqueta, titulo, idTitulo, alCerrar, ancho = 680, children }: { etiqueta: string; titulo: string; idTitulo: string; alCerrar: () => void; ancho?: number; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogo.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
      aria-labelledby={idTitulo}
      style={{ width: `min(${ancho}px, calc(100% - 32px))` }}
      className="m-auto max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border-0 p-0 text-texto shadow-2xl backdrop:bg-black/45"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-cabecera px-6 py-5 text-sobre-cabecera">
        <div>
          <span className="text-xs font-light uppercase tracking-[0.2em]">{etiqueta}</span>
          <h2 id={idTitulo} className="mt-1 text-xl font-extrabold">{titulo}</h2>
        </div>
        <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar" className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-suave focus-visible:outline-acento">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="px-6 pb-6 pt-5">
        {children}
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => dialogo.current?.close()} className="rounded-lg border border-texto bg-fondo px-4 py-2 text-sm font-semibold hover:bg-fondo-suave">
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}
