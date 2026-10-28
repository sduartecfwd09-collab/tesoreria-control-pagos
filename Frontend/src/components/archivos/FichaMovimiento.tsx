"use client";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { montoPagado, nombreFecha } from "@/lib/formato";
import type { DetalleMovimientoSinObligacion } from "@/lib/tipos";
import { Ficha } from "../Ficha";
import { AccionesArchivo } from "./AccionesArchivo";

/** Detalle de un pago sin obligación (solo lectura): cada pago del grupo con lo que dice el banco y su archivo de origen. */
export function FichaMovimiento({ clave, proveedor, alCerrar }: { clave: string; proveedor: string; alCerrar: () => void }) {
  const [d, setD] = useState<DetalleMovimientoSinObligacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api.movimientoSinObligacionDetalle(clave).then((r) => vigente && setD(r)).catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar la información del pago"));
    return () => {
      vigente = false;
    };
  }, [clave]);

  const fila = (k: string, v: ReactNode) => (
    <>
      <dt className="text-suave">{k}</dt>
      <dd className="font-semibold break-words">{v}</dd>
    </>
  );

  return (
    <Ficha etiqueta="Pago sin obligación" titulo={d ? d.proveedor : proveedor} idTitulo="titulo-movimiento" alCerrar={alCerrar} ancho={760}>
      {error && <p role="alert" className="font-semibold text-rojo">{error}</p>}
      {!d && !error && <p role="status" className="text-suave">Cargando la información…</p>}
      {d && (
        <ol className="space-y-5">
          {d.pagos.map((p, i) => (
            <li key={i} className={i === 0 ? "" : "border-t border-linea pt-4"}>
              {d.pagos.length > 1 && <h3 className="mb-2 text-sm font-bold">Pago {i + 1} de {d.pagos.length}</h3>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {fila("Fecha", nombreFecha(p.fecha))}
                {fila("Monto del débito", <span className="tabular-nums">{montoPagado(p.monto, p.moneda)}</span>)}
                {fila("Banco", p.banco ?? "Sin dato")}
                {fila("Cuenta", <span className="font-mono">{p.cuenta}</span>)}
                {fila("Sociedad", p.sociedad)}
                {fila("Lo que dice el banco", p.descripcion ?? "Sin descripción")}
                {fila("Referencia", p.referencia ?? "Sin referencia")}
                {fila("Número de servicio", <span className="font-mono">{p.identificador}</span>)}
                {fila("Cómo se obtuvo", p.comoSeExtrajo)}
                {fila("Archivo", p.archivo ? p.archivo.nombre : "Sin archivo")}
                {fila("Hoja", p.hoja ?? "Sin dato")}
                {fila("Fila", p.fila === null ? "Sin dato" : p.fila.toLocaleString("es-CR"))}
              </dl>
              {p.archivo && <AccionesArchivo rutaRelativa={p.archivo.rutaRelativa} />}
            </li>
          ))}
        </ol>
      )}
    </Ficha>
  );
}
