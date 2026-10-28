"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Alcance, Vencimiento } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { CajaError } from "../ui";
import { DetallePago } from "./DetallePago";
import { TablaPagos, useFiltrosPagos } from "./TablaPagos";

/** Solo los vencidos, de todos los meses, del más antiguo al más reciente (el servidor los entrega ya en ese orden). */
export function Vencidos() {
  const [datos, setDatos] = useState<Vencimiento[] | null>(null);
  const [alcance, setAlcance] = useState<Alcance | undefined>(undefined);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    api.listarTodosVencimientos({ estado: "vencido" }).then((r) => vigente && (setDatos(r.datos), setAlcance(r.alcance), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  const filtros = useFiltrosPagos(datos ?? []);
  const filas = filtros.aplicar(datos ?? []);

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (datos === null) return <p className="mt-8 text-suave" role="status">Cargando vencidos…</p>;

  return (
    <>
      <LineaAlcance alcance={alcance} />
      <p className="mt-3 text-sm" aria-live="polite">
        {datos.length === 0 ? "No hay pagos vencidos." : filas.length === datos.length ? `${datos.length.toLocaleString("es-CR")} vencidos` : `${filas.length.toLocaleString("es-CR")} de ${datos.length.toLocaleString("es-CR")} vencidos`}
      </p>
      {filtros.controles}
      <TablaPagos datos={filas} alGestionar={setAbierto} vacio={datos.length === 0 ? "No hay pagos vencidos." : "No hay pagos que coincidan."} />
      {abierto !== null && <DetallePago id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
