"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cerrar, publicar, suscribir, type Aviso, type OpcionesAviso, type TipoAviso } from "@/lib/avisos";
import { IconoEstado } from "./pagos/EstadoPago";

/** Milisegundos que dura un aviso de éxito o de información antes de cerrarse solo. El error no se cierra solo. */
const DURACION_MS = 5000;

const IconoInformacion = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2V11M8 4.9v.1" />
  </svg>
);

/** Cada tipo lleva ícono, rótulo de texto y color (los de Pagado, Vencido y Programado): nunca solo color. */
const TIPOS: Record<TipoAviso, { rotulo: string; clase: string; icono: ReactNode }> = {
  exito: { rotulo: "Éxito", clase: "bg-acento text-sobre-acento border-2 border-texto", icono: <IconoEstado estado="pagado" /> },
  error: { rotulo: "Error", clase: "bg-rojo text-fondo border-2 border-rojo", icono: <IconoEstado estado="vencido" /> },
  informacion: { rotulo: "Información", clase: "bg-fondo text-texto border-2 border-dashed border-control", icono: IconoInformacion },
};

function ItemAviso({ aviso }: { aviso: Aviso }) {
  const [pausado, setPausado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = TIPOS[aviso.tipo];
  const seCierraSolo = aviso.tipo !== "error" && !aviso.fijo;

  useEffect(() => {
    if (!seCierraSolo || pausado) return;
    temporizador.current = setTimeout(() => cerrar(aviso.id), DURACION_MS);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = null;
    };
  }, [seCierraSolo, pausado, aviso.id]);

  return (
    <div
      role={aviso.tipo === "error" ? "alert" : "status"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm shadow-lg ${t.clase}`}
    >
      <span className="mt-0.5">{t.icono}</span>
      <p className="min-w-0 flex-1 break-words">
        <span className="font-bold">{t.rotulo}: </span>
        {aviso.texto}
      </p>
      <button
        type="button"
        onClick={() => cerrar(aviso.id)}
        aria-label="Cerrar aviso"
        className="-mr-1 -mt-0.5 shrink-0 rounded p-1 font-bold leading-none hover:underline"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

/** Proveedor único (se monta una vez en el diseño general): dos regiones siempre presentes, una cortés y una asertiva. */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  useEffect(() => suscribir(setAvisos), []);
  return (
    <>
      {children}
      {/* Arriba a la derecha, debajo de la franja «Actuando como»; el menú queda a la izquierda. */}
      <div className="pointer-events-none fixed inset-x-4 top-20 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96 sm:max-w-[24rem]">
        <div aria-live="polite" className="flex w-full flex-col gap-2">
          {avisos.filter((a) => a.tipo !== "error").map((a) => (
            <ItemAviso key={a.id} aviso={a} />
          ))}
        </div>
        <div aria-live="assertive" className="flex w-full flex-col gap-2">
          {avisos.filter((a) => a.tipo === "error").map((a) => (
            <ItemAviso key={a.id} aviso={a} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Para avisar desde un componente: `const aviso = useToast(); aviso.exito("Ruta copiada")`. */
export function useToast() {
  const exito = useCallback((texto: string, o?: OpcionesAviso) => publicar("exito", texto, o), []);
  const error = useCallback((texto: string, o?: OpcionesAviso) => publicar("error", texto, o), []);
  const informacion = useCallback((texto: string, o?: OpcionesAviso) => publicar("informacion", texto, o), []);
  return { exito, error, informacion, cerrar };
}
