"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Identidad } from "@/lib/tipos";
import { guardarUsuarioActual, obtenerUsuarioActual } from "@/lib/usuario-actual";
import { claseControl } from "./ui";

/**
 * Franja delgada sobre el contenido para elegir con qué tesorero se actúa. Solo aparece si el servidor lo permite
 * (modoPruebas). Al cambiar de tesorero se recarga la pantalla para que todos los datos se pidan con la nueva identidad.
 */
export function BarraIdentidad() {
  const [identidad, setIdentidad] = useState<Identidad | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    api
      .obtenerIdentidad()
      .then((i) => {
        if (!vigente) return;
        const guardado = obtenerUsuarioActual();
        // Si el id guardado ya no existe en la lista, se descarta para no enviar una identidad inválida.
        const valido = guardado !== null && i.tesoreros.some((t) => t.id === guardado) ? guardado : null;
        if (guardado !== null && valido === null) guardarUsuarioActual(null);
        setElegido(valido);
        setIdentidad(i);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  if (!identidad?.modoPruebas) return null;

  const actual = identidad.tesoreros.find((t) => t.id === elegido);

  function cambiar(valor: string) {
    guardarUsuarioActual(valor === "" ? null : Number(valor));
    window.location.reload();
  }

  return (
    <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divisor pb-3 text-sm md:-mt-3">
      <p role="status" className="font-medium">
        {actual ? <>Actuando como: <strong>{actual.nombre}</strong></> : "Elija con qué tesorero actúa"}
      </p>
      <label className="flex items-center gap-2">
        <span className="text-suave">Cambiar a</span>
        <select className={`${claseControl} py-1 text-sm`} value={elegido ?? ""} onChange={(e) => cambiar(e.target.value)}>
          <option value="">Elija un tesorero…</option>
          {identidad.tesoreros.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
