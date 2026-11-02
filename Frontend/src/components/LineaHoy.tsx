"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fijarAnioEnCurso, textoHoy } from "@/lib/formato";

const CADA_MS = 5 * 60 * 1000; // SUPUESTO: se refresca cada 5 minutos y al volver a la pestaña

/** «HOY · SÁBADO, 31 DE OCTUBRE DE 2026», con la fecha del servidor (zona de Costa Rica), en el encabezado común de todas las pantallas. */
export function LineaHoy() {
  const [hoy, setHoy] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () => api.hoy().then((h) => (fijarAnioEnCurso(h), vigente && setHoy(h))).catch(() => undefined);
    cargar();
    const reloj = setInterval(cargar, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vigente = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  if (!hoy) return null;
  return <p className="mb-3 text-xs font-light uppercase tracking-[0.24em] text-suave">Hoy · {textoHoy(hoy)}</p>;
}
