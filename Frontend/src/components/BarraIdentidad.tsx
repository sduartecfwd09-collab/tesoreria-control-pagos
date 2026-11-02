"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Identidad } from "@/lib/tipos";
import { guardarUsuarioActual, obtenerUsuarioActual } from "@/lib/usuario-actual";
import { claseControl } from "./ui";

/**
 * Franja delgada sobre el contenido para elegir con qué persona se actúa. Solo aparece si el servidor lo permite
 * (modoPruebas). Si no hay una persona guardada válida, se arranca con la primera de Jefatura. Al cambiar de persona se
 * recarga la pantalla para que todos los datos se pidan con la nueva identidad.
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
        let valido = guardado !== null && i.usuarios.some((u) => u.id === guardado) ? guardado : null;
        if (valido === null && i.modoPruebas) {
          // Sin persona guardada válida: se arranca con la primera de Jefatura y se guarda. La pantalla ya pidió sus datos
          // sin identidad, así que se recarga una sola vez para que se pidan con la persona elegida.
          const primera = i.usuarios.find((u) => u.rol === "Jefatura") ?? i.usuarios[0];
          if (primera) {
            guardarUsuarioActual(primera.id);
            // Si el navegador no puede guardar la elección, no se recarga (evita un ciclo) y solo se muestra.
            if (obtenerUsuarioActual() === primera.id) {
              window.location.reload();
              return;
            }
            valido = primera.id;
          }
        }
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

  const actual = identidad.usuarios.find((u) => u.id === elegido);

  function cambiar(valor: string) {
    guardarUsuarioActual(Number(valor));
    window.location.reload();
  }

  return (
    <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divisor pb-3 text-sm md:-mt-3">
      <p role="status" className="font-medium">
        Actuando como: <strong>{actual?.nombre ?? ""}</strong>
      </p>
      <label className="flex items-center gap-2">
        <span className="text-suave">Cambiar a</span>
        <select className={`${claseControl} py-1 text-sm`} value={elegido ?? ""} onChange={(e) => cambiar(e.target.value)}>
          {identidad.usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre} — {u.rol}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
