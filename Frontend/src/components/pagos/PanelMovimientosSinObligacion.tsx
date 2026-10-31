"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nombreFecha } from "@/lib/formato";
import { limitesDeNavegacion, opcionesDePeriodo, type IdAtajo, type Rango } from "@/lib/fechas";
import type { LimitesFechas, MovimientoSinObligacion, MovimientosSinObligacion } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { SelectorPeriodo } from "../SelectorFechas";
import { CajaError } from "../ui";
import { FichaMovimiento } from "../archivos/FichaMovimiento";

const OPCIONES: IdAtajo[] = ["ultimos_12_meses", "mes", "mes_anterior", "ultimos_3_meses", "anio"];
const th = "px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-suave";

/** Pantalla de solo lectura: pagos del banco con número que no está en el catálogo. */
export function PanelMovimientosSinObligacion() {
  const [datos, setDatos] = useState<MovimientosSinObligacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<MovimientoSinObligacion | null>(null);
  const [intento, setIntento] = useState(0);
  const [rango, setRango] = useState<Rango | null>(null); // null = todas las fechas
  const [limites, setLimites] = useState<LimitesFechas | null>(null);

  useEffect(() => {
    api.limitesFechas().then(setLimites).catch(() => setLimites(null));
  }, [intento]);

  useEffect(() => {
    let vigente = true;
    api.movimientosSinObligacion({ desde: rango?.desde, hasta: rango?.hasta }).then((r) => vigente && (setDatos(r), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento, rango]);

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (datos === null) return <p className="mt-8 text-suave" role="status">Cargando movimientos…</p>;

  const n = (x: number) => x.toLocaleString("es-CR");
  const navegable = limites ? limitesDeNavegacion(limites) : undefined;
  return (
    <>
      <LineaAlcance alcance={datos.alcance} />
      {navegable && (
        <div className="mt-4">
          <SelectorPeriodo etiqueta="Período" opciones={opcionesDePeriodo(OPCIONES, limites!.hoy, navegable, true)} inicial="todo" rangoActual={rango} limites={navegable} alCambiar={setRango} />
        </div>
      )}
      <section aria-label="Resumen" aria-live="polite" className="mt-4 max-w-xl rounded-[14px] border border-divisor bg-fondo-suave p-5">
        {datos.totalGrupos === 0 ? (
          <p className="font-semibold">No hay movimientos sin obligación.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <span><b className="text-[44px] font-extrabold leading-none tabular-nums">{n(datos.totalGrupos)}</b> <span className="text-sm text-suave">{datos.totalGrupos === 1 ? "número sin obligación" : "números sin obligación"}</span></span>
            <span><b className="text-[44px] font-extrabold leading-none tabular-nums">{n(datos.totalPagos)}</b> <span className="text-sm text-suave">{datos.totalPagos === 1 ? "pago" : "pagos"}</span></span>
          </div>
        )}
      </section>
      {datos.totalGrupos > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <caption className="sr-only">Movimientos sin obligación</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>Proveedor</th>
                <th scope="col" className={th}>Identificador</th>
                <th scope="col" className={`${th} text-right`}>Pagos</th>
                <th scope="col" className={th}>Primera fecha</th>
                <th scope="col" className={th}>Última fecha</th>
                <th scope="col" className={th}>Sociedad</th>
                <th scope="col" className={th}>Cuenta</th>
                <th scope="col" className={th}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((m, i) => (
                <tr key={`${m.clave}-${i}`} className="border-t border-linea">
                  <td className="px-3.5 py-4 align-top font-semibold">{m.proveedor}</td>
                  <td className="px-3.5 py-4 align-top font-mono text-[13px] text-suave whitespace-nowrap">{m.identificador}</td>
                  <td className="px-3.5 py-4 align-top text-right tabular-nums">{n(m.pagos)}</td>
                  <td className="px-3.5 py-4 align-top whitespace-nowrap">{nombreFecha(m.primeraFecha)}</td>
                  <td className="px-3.5 py-4 align-top whitespace-nowrap">{nombreFecha(m.ultimaFecha)}</td>
                  <td className="px-3.5 py-4 align-top text-xs">{m.sociedades.map((s) => <span key={s} className="block">{s}</span>)}</td>
                  <td className="px-3.5 py-4 align-top font-mono text-[13px] text-suave whitespace-nowrap">{m.cuentas.map((c) => <span key={c} className="block">{c}</span>)}</td>
                  <td className="px-3.5 py-4 align-top text-right">
                    <button type="button" onClick={() => setAbierto(m)} aria-label={`Ver información completa de ${m.proveedor} ${m.identificador}`} className="whitespace-nowrap rounded-lg border border-texto bg-fondo px-3.5 py-2 text-[13px] font-semibold hover:bg-fondo-suave">Ver información completa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abierto && <FichaMovimiento clave={abierto.clave} proveedor={abierto.proveedor} periodo={rango} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
