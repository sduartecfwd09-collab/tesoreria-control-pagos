"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nombreFecha } from "@/lib/formato";
import { limitesDeNavegacion, opcionesDePeriodo, type IdAtajo, type Rango } from "@/lib/fechas";
import type { LimitesFechas, MovimientoSinObligacion, MovimientosSinObligacion } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { SelectorPeriodo } from "../SelectorFechas";
import { CajaError } from "../ui";
import { CajaFiltros } from "../CajaFiltros";
import { claseBotonTabla, claseCelda, claseContenedorTabla, claseEncabezadoTabla, claseFila, claseTabla, claseTh } from "../estilo-tabla";
import { FichaMovimiento } from "../archivos/FichaMovimiento";

const OPCIONES: IdAtajo[] = ["ultimos_12_meses", "mes", "mes_anterior", "ultimos_3_meses", "anio"];
const th = claseTh;

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
      {/* Fila: el recuadro con solo el Período y, a su derecha, las dos cifras (solo informan; no filtran ni se pulsan). Ancho propio, espacio fijo,
          sin márgenes automáticos. Las cifras se alinean con la línea del texto del selector: arriba el borde (1) + relleno (16) del recuadro,
          la etiqueta (16) y el borde (2) + relleno (8) del selector, menos lo que el número de 24 px sube sobre la línea base (~4): 39 px.
          Van fijas desde arriba (no desde abajo) para que el mensaje del selector, que agranda el recuadro, no las mueva. En pantalla angosta
          bajan debajo del recuadro, a la izquierda, sin ese desplazamiento. */}
      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-3">
        <CajaFiltros etiqueta="Filtros de movimientos sin obligación" margen="" mensajeSinAncho>
          {navegable && (
            <SelectorPeriodo etiqueta="Período" opciones={opcionesDePeriodo(OPCIONES, limites!.hoy, navegable, true)} inicial="todo" rangoActual={rango} limites={navegable} alCambiar={setRango} />
          )}
        </CajaFiltros>
        <div role="group" aria-label="Resumen" aria-live="polite" className="flex flex-wrap items-baseline gap-x-6 gap-y-1 min-[860px]:mt-[39px]">
          {datos.totalGrupos === 0 ? (
            <p className="font-semibold">No hay movimientos sin obligación.</p>
          ) : (
            <>
              <span><b className="text-2xl font-extrabold leading-none tabular-nums">{n(datos.totalGrupos)}</b> <span className="text-sm text-suave">{datos.totalGrupos === 1 ? "número sin obligación" : "números sin obligación"}</span></span>
              <span><b className="text-2xl font-extrabold leading-none tabular-nums">{n(datos.totalPagos)}</b> <span className="text-sm text-suave">{datos.totalPagos === 1 ? "pago" : "pagos"}</span></span>
            </>
          )}
        </div>
      </div>
      {datos.totalGrupos > 0 && (
        <div className={claseContenedorTabla}>
          <table className={`${claseTabla} min-w-[900px]`}>
            <caption className="sr-only">Movimientos sin obligación</caption>
            <thead className={claseEncabezadoTabla}>
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
                <tr key={`${m.clave}-${i}`} className={claseFila}>
                  <td className={`${claseCelda} font-semibold`}>{m.proveedor}</td>
                  <td className={`${claseCelda} font-mono text-[13px] text-suave whitespace-nowrap`}>{m.identificador}</td>
                  <td className={`${claseCelda} text-right tabular-nums`}>{n(m.pagos)}</td>
                  <td className={`${claseCelda} whitespace-nowrap`}>{nombreFecha(m.primeraFecha)}</td>
                  <td className={`${claseCelda} whitespace-nowrap`}>{nombreFecha(m.ultimaFecha)}</td>
                  <td className={`${claseCelda} text-xs`}>{m.sociedades.map((s) => <span key={s} className="block">{s}</span>)}</td>
                  <td className={`${claseCelda} font-mono text-[13px] text-suave whitespace-nowrap`}>{m.cuentas.map((c) => <span key={c} className="block">{c}</span>)}</td>
                  <td className={`${claseCelda} text-right`}>
                    <button type="button" onClick={() => setAbierto(m)} aria-label={`Ver información completa de ${m.proveedor} ${m.identificador}`} className={claseBotonTabla}>Ver información completa</button>
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
