"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { limitesDeNavegacion, opcionesDePeriodo, type IdAtajo, type Rango } from "@/lib/fechas";
import type { Alcance, LimitesFechas, Vencimiento } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { SelectorPeriodo } from "../SelectorFechas";
import { CajaError } from "../ui";
import { DetallePago } from "./DetallePago";
import { TablaPagos, useFiltrosPagos } from "./TablaPagos";

const OPCIONES: IdAtajo[] = ["ultimos_12_meses", "mes", "mes_anterior", "ultimos_3_meses", "anio"];

/** Solo los vencidos, por defecto de todas las fechas, del más antiguo al más reciente (el servidor los entrega ya en ese orden). */
export function Vencidos() {
  const [datos, setDatos] = useState<Vencimiento[] | null>(null);
  const [alcance, setAlcance] = useState<Alcance | undefined>(undefined);
  const [calculado, setCalculado] = useState<string | null | undefined>(undefined);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [rango, setRango] = useState<Rango | null>(null); // null = todas las fechas
  const [limites, setLimites] = useState<LimitesFechas | null>(null);

  useEffect(() => {
    api.limitesFechas().then(setLimites).catch(() => setLimites(null));
  }, [intento]);

  useEffect(() => {
    let vigente = true;
    api.listarTodosVencimientos({ estado: "vencido", fechaDesde: rango?.desde, fechaHasta: rango?.hasta }).then((r) => vigente && (setDatos(r.datos), setAlcance(r.alcance), setCalculado(r.estadosCalculadosEn), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento, rango]);

  const filtros = useFiltrosPagos(datos ?? []);
  const filas = filtros.aplicar(datos ?? []);

  const navegable = limites ? limitesDeNavegacion(limites) : undefined;
  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (datos === null) return <p className="mt-8 text-suave" role="status">Cargando vencidos…</p>;

  return (
    <>
      <LineaAlcance alcance={alcance} estadosCalculadosEn={calculado} />
      {navegable && (
        <div className="mt-4">
          <SelectorPeriodo etiqueta="Período" opciones={opcionesDePeriodo(OPCIONES, limites!.hoy, navegable, true)} inicial="todo" rangoActual={rango} limites={navegable} alCambiar={setRango} />
        </div>
      )}
      <p className="mt-3 text-sm" aria-live="polite">
        {datos.length === 0 ? "No hay pagos vencidos." : filas.length === datos.length ? `${datos.length.toLocaleString("es-CR")} vencidos` : `${filas.length.toLocaleString("es-CR")} de ${datos.length.toLocaleString("es-CR")} vencidos`}
      </p>
      {filtros.controles}
      <TablaPagos datos={filas} alGestionar={setAbierto} vacio={datos.length === 0 ? "No hay pagos vencidos." : "No hay pagos que coincidan."} />
      {abierto !== null && <DetallePago id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
