"use client";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { fraseAsociadoAMano, fraseJustificado, montoPagado, nombreFecha } from "@/lib/formato";
import type { DetalleVencimiento, EstadoVencimiento, MovimientoDetalle } from "@/lib/tipos";
import { Ficha } from "../Ficha";
import { AccionesPago, EtiquetaAsociadoAMano } from "./AccionesPago";
import { EstadoPago } from "./EstadoPago";

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
                {m.delPago && <span className="block text-xs text-suave">Pago encontrado en el banco</span>}
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
export function DetallePago({ id, alCerrar, acciones }: { id: number; alCerrar: () => void; /** solo Pagos del mes pide las acciones (asociar o quitar un pago a mano); alCambiar actualiza la lista */ acciones?: { alCambiar: () => void } }) {
  const [d, setD] = useState<DetalleVencimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0); // vuelve a pedir el detalle después de una acción

  useEffect(() => {
    let vigente = true;
    api.detalleVencimiento(id).then((r) => vigente && (setD(r), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar el detalle"));
    return () => {
      vigente = false;
    };
  }, [id, recarga]);

  const fila = (k: string, v: ReactNode) => (
    <>
      <dt className="text-suave">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </>
  );

  return (
    <Ficha etiqueta="Detalle del pago" titulo={d ? `${d.proveedor} · ${d.categoria}` : "Cargando…"} idTitulo="titulo-detalle" alCerrar={alCerrar}>
        {error && <p role="alert" className="font-semibold text-rojo">{error}</p>}
        {!d && !error && <p role="status" className="text-suave">Cargando el detalle…</p>}
        {d && (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <EstadoPago estado={d.estado} />
              {d.asociadoAMano && !d.sinEfecto && <EtiquetaAsociadoAMano />}
            </p>
            {d.textos.resumen !== "" && <p className="mt-3 font-semibold">{d.textos.resumen}</p>}
            {d.justificado && <p className="mt-3 font-semibold">{fraseJustificado(d.justificado)}</p>}
            {d.asociadoAMano && !d.sinEfecto && <p className="mt-2 text-sm">{fraseAsociadoAMano(d.asociadoAMano)}</p>}
            {d.sinEfecto && <p role="status" className="mt-3 rounded border-l-4 border-acento bg-fondo-suave p-3 text-sm font-semibold">El pago asociado ya no aparece en los estados de cuenta.</p>}
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

            {acciones && <AccionesPago d={d} alCambiar={() => (setRecarga((n) => n + 1), acciones.alCambiar())} />}

            <Seccion titulo="Datos">
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {fila("Proveedor", d.proveedor)}
                {fila("Número de servicio", <span className="font-mono">{d.identificador}</span>)}
                {fila("Sociedad", d.sociedad)}
                {fila("Vence", <>{nombreFecha(d.fecha)}{d.movida && <span className="block text-xs font-normal text-suave">Antes: {nombreFecha(d.fechaOriginal)}{d.fechaMovidaPor ? ` · lo cambió ${d.fechaMovidaPor}` : ""}</span>}</>)}
                {d.responsableEfectivo !== undefined && fila("Responsable", d.responsableEfectivo ?? "Sin responsable")}
              </dl>
            </Seccion>
          </>
        )}
    </Ficha>
  );
}
