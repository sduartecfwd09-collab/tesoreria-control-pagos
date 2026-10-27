"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { montoPagado, nombreFecha, nombrePeriodo } from "@/lib/formato";
import type { DetalleVencimiento, EstadoVencimiento, MovimientoDetalle } from "@/lib/tipos";
import { ESTADO, EstadoPago } from "./EstadoPago";

const ESTADOS: EstadoVencimiento[] = ["proyectado", "por_vencer", "vencido", "pagado", "pagado_con_inconsistencia", "sin_informacion", "por_revisar"];

function TablaMovimientos({ movimientos, conSociedad }: { movimientos: MovimientoDetalle[]; conSociedad: boolean }) {
  return (
    <div className="mt-2 overflow-x-auto rounded border border-linea">
      <table className="w-full text-sm">
        <caption className="sr-only">Movimientos del banco</caption>
        <thead className="bg-fondo-suave text-left text-xs uppercase tracking-wide text-suave">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Fecha</th>
            <th scope="col" className="px-3 py-2 font-semibold">Banco y cuenta</th>
            {conSociedad && <th scope="col" className="px-3 py-2 font-semibold">Sociedad</th>}
            <th scope="col" className="px-3 py-2 font-semibold text-right">Monto</th>
            <th scope="col" className="px-3 py-2 font-semibold">Lo que dice el banco</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m, i) => (
            <tr key={i} className="border-t border-linea align-top">
              <td className="px-3 py-2 whitespace-nowrap">
                {nombreFecha(m.fecha)}
                {m.delPago && <span className="block text-xs text-suave">Pago tomado</span>}
              </td>
              <td className="px-3 py-2">
                {m.banco ?? "Banco sin dato"}
                <span className="block text-xs text-suave">Cuenta {m.cuenta}</span>
              </td>
              {conSociedad && <td className="px-3 py-2 text-xs">{m.sociedad}</td>}
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{montoPagado(m.monto, m.moneda)}</td>
              <td className="px-3 py-2 text-xs break-words">{m.descripcion ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Obligaciones de la misma sociedad que comparten el número de servicio, con el estado de su vencimiento del mes. */
function TablaGrupo({ grupo }: { grupo: DetalleVencimiento["grupo"] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded border border-linea">
      <table className="w-full text-sm">
        <caption className="sr-only">Obligaciones con el mismo número de servicio</caption>
        <thead className="bg-fondo-suave text-left text-xs uppercase tracking-wide text-suave">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Proveedor</th>
            <th scope="col" className="px-3 py-2 font-semibold">Categoría</th>
            <th scope="col" className="px-3 py-2 font-semibold">Día de pago</th>
            <th scope="col" className="px-3 py-2 font-semibold">Estado este mes</th>
          </tr>
        </thead>
        <tbody>
          {grupo.map((g, i) => (
            <tr key={i} className="border-t border-linea align-top">
              <td className="px-3 py-2 font-semibold">{g.proveedor}</td>
              <td className="px-3 py-2">{g.categoria}</td>
              <td className="px-3 py-2">{g.diaPago === null ? "Sin día" : `Día ${g.diaPago}`}</td>
              <td className="px-3 py-2">{g.estado && ESTADOS.includes(g.estado as EstadoVencimiento) ? <EstadoPago estado={g.estado as EstadoVencimiento} /> : "Sin vencimiento este mes"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Detalle de solo lectura de un pago: se abre con «Gestionar» o tocando la fila. Sin acciones: cuenta qué pasó, por qué y
 * qué hacer con los datos reales. Los textos los arma el servidor. Cierra con Escape, con el botón o al pulsar fuera.
 */
export function DetallePago({ id, alCerrar }: { id: number; alCerrar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [d, setD] = useState<DetalleVencimiento | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);
  useEffect(() => {
    let vigente = true;
    api.detalleVencimiento(id).then((r) => vigente && setD(r)).catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar el detalle"));
    return () => {
      vigente = false;
    };
  }, [id]);

  const fila = (k: string, v: ReactNode) => (
    <>
      <dt className="text-suave">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </>
  );

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
      aria-labelledby="titulo-detalle"
      className="m-auto w-[min(680px,calc(100%-32px))] max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border-0 p-0 text-texto shadow-2xl backdrop:bg-black/45"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-cabecera px-6 py-5 text-sobre-cabecera">
        <div>
          <span className="text-xs font-light uppercase tracking-[0.2em]">Detalle del pago</span>
          <h2 id="titulo-detalle" className="mt-1 text-xl font-extrabold">{d ? `${d.proveedor} · ${d.categoria}` : "Cargando…"}</h2>
        </div>
        <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar" className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-suave focus-visible:outline-acento">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="px-6 pb-6 pt-5">
        {error && <p role="alert" className="font-semibold text-rojo">{error}</p>}
        {!d && !error && <p role="status" className="text-suave">Cargando el detalle…</p>}
        {d && (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <EstadoPago estado={d.estado} />
            </p>
            <p className="mt-3 font-semibold">{d.textos.resumen}</p>
            {d.textos.parrafos.map((p, i) => (
              <p key={i} className="mt-2 text-sm">{p}</p>
            ))}
            {d.textos.queHacer && <p className="mt-3 rounded border-l-4 border-acento bg-fondo-suave p-3 text-sm font-semibold">{d.textos.queHacer}</p>}

            {d.grupo.length > 1 && (
              <Seccion titulo="Obligaciones con el mismo número de servicio en esta sociedad">
                <TablaGrupo grupo={d.grupo} />
              </Seccion>
            )}
            {d.movimientos.length > 0 && (
              <Seccion titulo={d.movimientos.length === 1 ? "Movimiento del banco" : `Movimientos del banco (${d.movimientos.length})`}>
                <TablaMovimientos movimientos={d.movimientos} conSociedad={d.estado === "por_revisar" || d.estado === "pagado_con_inconsistencia"} />
              </Seccion>
            )}

            <Seccion titulo="Datos">
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {fila("Proveedor", d.proveedor)}
                {fila("Número de servicio", <span className="font-mono">{d.identificador}</span>)}
                {fila("Sociedad", d.sociedad)}
                {fila("Período", nombrePeriodo(d.periodo))}
                {fila("Fecha original", nombreFecha(d.fechaOriginal))}
                {fila("Fecha vigente", d.movida ? `${nombreFecha(d.fecha)} (se movió solo este mes)` : nombreFecha(d.fecha))}
                {fila("Responsable", d.responsableEfectivo ?? "Sin responsable")}
                {fila("Estado", ESTADO[d.estado]?.texto ?? "Sin definir")}
              </dl>
            </Seccion>
          </>
        )}
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => dialogo.current?.close()} className="rounded-lg border border-texto bg-fondo px-4 py-2 text-sm font-semibold hover:bg-fondo-suave">
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}
