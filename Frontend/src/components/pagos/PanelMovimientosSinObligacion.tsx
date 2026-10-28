"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nombreFecha } from "@/lib/formato";
import type { MovimientosSinObligacion } from "@/lib/tipos";
import { CajaError } from "../ui";

const th = "px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-suave";

/** Pantalla de solo lectura: pagos del banco con número que no está en el catálogo. */
export function PanelMovimientosSinObligacion() {
  const [datos, setDatos] = useState<MovimientosSinObligacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    api.movimientosSinObligacion().then((r) => vigente && (setDatos(r), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (datos === null) return <p className="mt-8 text-suave" role="status">Cargando movimientos…</p>;

  const n = (x: number) => x.toLocaleString("es-CR");
  return (
    <>
      <p className="mt-3 max-w-3xl text-sm">{datos.nota}</p>
      <p className="mt-3 text-sm" aria-live="polite">
        {datos.totalGrupos === 0
          ? "No hay movimientos sin obligación."
          : `${n(datos.totalGrupos)} ${datos.totalGrupos === 1 ? "número" : "números"} sin obligación, con ${n(datos.totalPagos)} ${datos.totalPagos === 1 ? "pago" : "pagos"}`}
      </p>
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
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((m, i) => (
                <tr key={`${m.proveedor}-${m.identificador}-${i}`} className="border-t border-linea">
                  <td className="px-3.5 py-4 align-top font-semibold">{m.proveedor}</td>
                  <td className="px-3.5 py-4 align-top font-mono text-[13px] text-suave whitespace-nowrap">{m.identificador}</td>
                  <td className="px-3.5 py-4 align-top text-right tabular-nums">{n(m.pagos)}</td>
                  <td className="px-3.5 py-4 align-top whitespace-nowrap">{nombreFecha(m.primeraFecha)}</td>
                  <td className="px-3.5 py-4 align-top whitespace-nowrap">{nombreFecha(m.ultimaFecha)}</td>
                  <td className="px-3.5 py-4 align-top text-xs">{m.sociedades.map((s) => <span key={s} className="block">{s}</span>)}</td>
                  <td className="px-3.5 py-4 align-top font-mono text-[13px] text-suave whitespace-nowrap">{m.cuentas.map((c) => <span key={c} className="block">{c}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
