"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { alternarTarjeta } from "./filtro-tarjetas";

/** Baja suavemente hasta el elemento; con «reducir movimiento» lo hace sin animación. */
export function desplazarSuave(el: HTMLElement | null): void {
  if (!el) return;
  const reducir = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
}

/** Tarjeta activa de una pantalla (solo una a la vez) y la tabla o lista hasta donde baja la vista al activarla. */
export function useFiltroTarjeta() {
  const [activa, setActiva] = useState<string | null>(null);
  const destino = useRef<HTMLElement | null>(null);
  const alternar = useCallback((clave: string) => setActiva((a) => alternarTarjeta(a, clave)), []);
  const limpiar = useCallback(() => setActiva(null), []);
  useEffect(() => {
    if (activa !== null) desplazarSuave(destino.current);
  }, [activa]);
  return { activa, alternar, limpiar, destino };
}
