"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { montoPagado, nombreFecha, nombrePeriodo } from "@/lib/formato";
import type { DetalleVencimiento, MovimientoDetalle } from "@/lib/tipos";
import { ESTADO, EstadoPago } from "./EstadoPago";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

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
            <th scope="col" className="px-3 py-2 font-semibold">Descripción</th>
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

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">{titulo}</h3>
      <div className="mt-2 space-y-2 text-sm">{children}</div>
    </section>
  );
}

/** Por qué tiene este estado: lo que se buscó, hasta dónde hay estados de cuenta y los movimientos que lo explican. */
function Motivo({ d }: { d: DetalleVencimiento }) {
  const v = d.ventana;
  const ventana = (
    <p>
      Se buscó un pago con este identificador entre el {nombreFecha(v.desde)} y el {nombreFecha(v.hasta)} ({plural(v.diasAntes, "día antes", "días antes")} y {plural(v.diasDespues, "día después", "días después")} de la fecha de pago).
    </p>
  );
  const c = d.cobertura;
  switch (d.estado) {
    case "vencido":
      return (
        <Seccion titulo="Por qué está vencido">
          {ventana}
          <p>No se encontró ningún pago en esa ventana.</p>
          {c && (
            <p>
              {c.estadosHasta ? `Los estados de cuenta llegan hasta el ${nombreFecha(c.estadosHasta)}` : "Todavía no hay estados de cuenta"}, en {plural(c.cuentas, "cuenta", "cuentas")} de la sociedad.
            </p>
          )}
          {d.motivo?.includes("sin estado de cuenta") && <p className="font-semibold">Se muestra como vencido aunque ningún estado de cuenta lo confirma.</p>}
        </Seccion>
      );
    case "sin_informacion":
      return (
        <Seccion titulo="Por qué no hay información">
          <p>
            {d.sinInfoHasta
              ? `Venció el ${nombreFecha(d.fecha)}; no hay estado de cuenta cargado después del ${nombreFecha(d.sinInfoHasta)}.`
              : `Venció el ${nombreFecha(d.fecha)}; no hay estado de cuenta cargado de esa fecha.`}
          </p>
          {ventana}
          {c && (
            <>
              <p>{c.estadosHasta ? `Los estados de cuenta de la sociedad llegan hasta el ${nombreFecha(c.estadosHasta)}.` : "La sociedad no tiene estados de cuenta cargados."}</p>
              {c.cuentas === 0 ? (
                <p>No hay cuentas conocidas de esta sociedad.</p>
              ) : c.cuentasSinCobertura.length > 0 ? (
                <>
                  <p className="font-semibold">Cuentas que faltan ({c.cuentasSinCobertura.length} de {c.cuentas}):</p>
                  <ul className="list-disc pl-5">
                    {c.cuentasSinCobertura.map((x, i) => (
                      <li key={i}>
                        {x.banco ?? "Banco sin dato"}, cuenta {x.cuenta}: {x.hasta ? `sin datos después del ${nombreFecha(x.hasta)}` : "sin datos de este período"}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </Seccion>
      );
    case "por_revisar":
      return (
        <Seccion titulo="Por qué hay que revisarlo">
          <p>{d.motivo}</p>
          {d.movimientos.length > 0 ? (
            <>
              <p className="font-semibold">Movimientos encontrados ({d.movimientos.length}):</p>
              <TablaMovimientos movimientos={d.movimientos} conSociedad />
            </>
          ) : (
            <p>No hay movimientos que mostrar.</p>
          )}
        </Seccion>
      );
    case "pagado":
      return (
        <Seccion titulo="Pago encontrado">
          {d.diferenciaDias !== null && d.diferenciaDias !== 0 && (
            <p>
              Se pagó {plural(Math.abs(d.diferenciaDias), "día", "días")} {d.diferenciaDias > 0 ? "después" : "antes"} de la fecha de pago.
            </p>
          )}
          <TablaMovimientos movimientos={d.movimientos} conSociedad={false} />
        </Seccion>
      );
    case "pagado_con_inconsistencia":
      return (
        <Seccion titulo="Inconsistencia">
          <p className="font-semibold">{d.motivo}</p>
          <TablaMovimientos movimientos={d.movimientos} conSociedad />
        </Seccion>
      );
    case "por_vencer":
    case "proyectado":
    default:
      return <Seccion titulo="Estado">{<p>{ESTADO[d.estado]?.ayuda}</p>}</Seccion>;
  }
}

/**
 * Detalle de solo lectura de un pago: se abre con «Gestionar» o tocando la fila. Sin acciones: solo muestra los datos
 * y el porqué del estado. Cierra con Escape, con el botón o al pulsar fuera.
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
      className="m-auto w-[min(640px,calc(100%-32px))] max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border-0 p-0 text-texto shadow-2xl backdrop:bg-black/45"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-cabecera px-6 py-5 text-sobre-cabecera">
        <div>
          <span className="text-xs font-light uppercase tracking-[0.2em]">Detalle del pago</span>
          <h2 id="titulo-detalle" className="mt-1 text-xl font-extrabold">{d ? `${d.proveedor} · ${d.categoria}` : "Cargando…"}</h2>
        </div>
        <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar" className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-suave">
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
              <span className="text-xs text-suave">{ESTADO[d.estado]?.ayuda}</span>
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {fila("Proveedor", d.proveedor)}
              {fila("Identificador", <span className="font-mono">{d.identificador}</span>)}
              {fila("Sociedad", d.sociedad)}
              {fila("Período", nombrePeriodo(d.periodo))}
              {fila("Fecha original", nombreFecha(d.fechaOriginal))}
              {fila("Fecha vigente", d.movida ? `${nombreFecha(d.fecha)} (se movió solo este mes)` : nombreFecha(d.fecha))}
              {fila("Responsable", d.responsableEfectivo ?? "Sin responsable")}
            </dl>
            <Motivo d={d} />
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
