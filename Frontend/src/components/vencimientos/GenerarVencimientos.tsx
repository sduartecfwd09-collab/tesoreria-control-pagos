"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { nombrePeriodo, periodoActual, sumarMeses } from "@/lib/formato";
import type { ResumenGeneracion } from "@/lib/tipos";
import { claseBoton, claseBotonSecundario, claseControl } from "../ui";

const MAX_MESES = 24;
const mesesEntre = (desde: string, hasta: string) =>
  (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7)) + 1;

type Paso = "elegir" | "confirmar" | "generando";

export function GenerarVencimientos({ activas, alGenerar }: { activas: number; alGenerar: (r: ResumenGeneracion) => void }) {
  const opciones = useMemo(() => {
    const actual = periodoActual();
    return Array.from({ length: 37 }, (_, i) => sumarMeses(actual, i - 12)); // 12 meses atrás y 24 adelante
  }, []);
  const [desde, setDesde] = useState(() => periodoActual());
  const [hasta, setHasta] = useState(() => sumarMeses(periodoActual(), 1));
  const [paso, setPaso] = useState<Paso>("elegir");
  const [resultado, setResultado] = useState<ResumenGeneracion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meses = mesesEntre(desde, hasta);
  const problema = meses < 1 ? "El mes inicial no puede ser posterior al mes final." : meses > MAX_MESES ? `Se pueden generar como máximo ${MAX_MESES} meses a la vez.` : null;
  const rango = meses === 1 ? nombrePeriodo(desde) : `${nombrePeriodo(desde)} a ${nombrePeriodo(hasta)}`;

  async function generar() {
    setPaso("generando");
    setError(null);
    try {
      const r = await api.generarVencimientos(desde, hasta);
      setResultado(r);
      alGenerar(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar");
    } finally {
      setPaso("elegir");
    }
  }

  return (
    <section aria-labelledby="h-generar" className="mt-6 rounded border-2 border-control p-5">
      <h2 id="h-generar" className="text-lg font-bold">Generar vencimientos</h2>
      <p className="mt-1 text-sm text-suave max-w-3xl">
        Crea un vencimiento por cada obligación activa y cada mes que le corresponda según su frecuencia. Se puede repetir sin riesgo: los que ya existen no se
        duplican ni se modifican.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Desde
          <select className={`${claseControl} mt-1 block`} value={desde} disabled={paso !== "elegir"} onChange={(e) => (setDesde(e.target.value), setResultado(null))}>
            {opciones.map((p) => (
              <option key={p} value={p}>{nombrePeriodo(p)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Hasta
          <select className={`${claseControl} mt-1 block`} value={hasta} disabled={paso !== "elegir"} onChange={(e) => (setHasta(e.target.value), setResultado(null))}>
            {opciones.map((p) => (
              <option key={p} value={p}>{nombrePeriodo(p)}</option>
            ))}
          </select>
        </label>
        {paso === "elegir" && (
          <button type="button" className={claseBoton} disabled={!!problema} onClick={() => setPaso("confirmar")}>
            Generar vencimientos…
          </button>
        )}
      </div>
      {problema && (
        <p role="alert" className="mt-2 text-sm font-medium text-rojo">
          {problema}
        </p>
      )}

      {paso !== "elegir" && (
        <div role="region" aria-label="Confirmar generación" className="mt-4 rounded border-2 border-control bg-fondo-suave p-4">
          <p className="font-semibold">¿Generar los vencimientos de {rango}?</p>
          <p className="mt-1 text-sm">
            Se revisarán {activas.toLocaleString("es-CR")} obligaciones activas en {meses} {meses === 1 ? "mes" : "meses"}. Se crean solo los que falten, en estado «Proyectado».
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={claseBoton} onClick={generar} disabled={paso === "generando"} autoFocus>
              {paso === "generando" ? "Generando…" : "Sí, generar"}
            </button>
            <button type="button" className={claseBotonSecundario} onClick={() => setPaso("elegir")} disabled={paso === "generando"}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">
          {error}
        </p>
      )}

      {resultado && (
        <div role="status" className="mt-4">
          <p className="font-semibold">
            <span aria-hidden="true">✓ </span>
            Listo: {resultado.creados.toLocaleString("es-CR")} creados · {resultado.yaExistentes.toLocaleString("es-CR")} ya existían
          </p>
          <table className="mt-2 text-sm">
            <caption className="sr-only">Resultado por mes</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className="pr-6 font-semibold">Mes</th>
                <th scope="col" className="pr-6 font-semibold">Creados</th>
                <th scope="col" className="font-semibold">Ya existían</th>
              </tr>
            </thead>
            <tbody>
              {resultado.porPeriodo.map((p) => (
                <tr key={p.periodo}>
                  <td className="pr-6">{nombrePeriodo(p.periodo)}</td>
                  <td className="pr-6">{p.creados}</td>
                  <td>{p.yaExistentes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resultado.omitidas.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold">{resultado.omitidas.length} obligaciones no se pudieron generar (complételas en Obligaciones):</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {resultado.omitidas.map((o) => (
                  <li key={o.obligacionId}>
                    {o.sociedad} · {o.proveedor} · <span className="font-mono">{o.identificador}</span>: {o.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
