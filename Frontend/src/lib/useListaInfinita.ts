"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pagina } from "./tipos";

/**
 * Lista que continúa hacia abajo: pide la primera página cuando cambia `cargar` (la función que trae una página con el
 * filtro vigente; debe cambiar solo cuando cambia el filtro) o `intento` (recarga), y las siguientes con `cargarMas`,
 * que la pantalla llama al llegar al final del scroll. Sin botones de página. Con `cargar` null no hace nada.
 */
export function useListaInfinita<T>(cargar: ((pagina: number) => Promise<Pagina<T>>) | null, intento: number) {
  const [datos, setDatos] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [siguiente, setSiguiente] = useState<number | null>(null); // próxima página por pedir; null = no hay más
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generacion = useRef(0); // descarta respuestas de un filtro anterior
  const ocupado = useRef(false);

  useEffect(() => {
    if (!cargar) return;
    const g = ++generacion.current;
    ocupado.current = false;
    cargar(1)
      .then((p) => {
        if (g !== generacion.current) return;
        setDatos(p.datos);
        setTotal(p.total);
        setSiguiente(p.pagina < p.paginas ? p.pagina + 1 : null);
        setCargandoMas(false);
        setError(null);
      })
      .catch((e) => g === generacion.current && setError(e instanceof Error ? e.message : "Error desconocido"));
  }, [cargar, intento]);

  const cargarMas = useCallback(() => {
    if (siguiente === null || ocupado.current || !cargar) return;
    const g = generacion.current;
    ocupado.current = true;
    setCargandoMas(true);
    cargar(siguiente)
      .then((p) => {
        if (g !== generacion.current) return;
        setDatos((d) => [...(d ?? []), ...p.datos]);
        setTotal(p.total);
        setSiguiente(p.pagina < p.paginas ? p.pagina + 1 : null);
      })
      .catch((e) => g === generacion.current && setError(e instanceof Error ? e.message : "Error desconocido"))
      .finally(() => {
        if (g === generacion.current) {
          ocupado.current = false;
          setCargandoMas(false);
        }
      });
  }, [cargar, siguiente]);

  return { datos, total, cargandoMas, error, cargarMas, hayMas: siguiente !== null };
}
