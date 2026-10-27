"use client";
import { useMemo, useState } from "react";
import { montoPagado, nombreFecha } from "@/lib/formato";
import type { Vencimiento } from "@/lib/tipos";
import { claseControl } from "../ui";
import { SelectorSociedad } from "../SelectorSociedad";
import { EstadoPago } from "./EstadoPago";

/** «Hace N días» / «En N días» / «Vence hoy», calculado en el servidor con su reloj (campo `dias`). */
export function cuando(v: Vencimiento): string | null {
  if (v.estado === "pagado" || v.estado === "pagado_con_inconsistencia") return v.pago ? `Pagado el ${nombreFecha(v.pago.fecha)}` : null;
  if (v.estado === "vencido") return v.dias === 0 ? "Vence hoy" : `Hace ${-v.dias} ${v.dias === -1 ? "día" : "días"}`;
  if (v.estado === "por_vencer") return v.dias === 0 ? "Vence hoy" : `En ${v.dias} ${v.dias === 1 ? "día" : "días"}`;
  return null;
}

const plano = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Búsqueda (proveedor, servicio), sociedad y categoría sobre las filas ya cargadas. */
export function useFiltrosPagos(datos: Vencimiento[]) {
  const [texto, setTexto] = useState("");
  const [sociedad, setSociedad] = useState("");
  const [categoria, setCategoria] = useState("");
  const sociedades = useMemo(() => [...new Set(datos.map((v) => v.sociedad))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })), [datos]);
  const categorias = useMemo(() => [...new Set(datos.map((v) => v.categoria))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })), [datos]);
  const aplicar = (xs: Vencimiento[]) => {
    const q = plano(texto.trim());
    return xs.filter(
      (v) => (!sociedad || v.sociedad === sociedad) && (!categoria || v.categoria === categoria) && (!q || plano(`${v.proveedor} ${v.identificador}`).includes(q)),
    );
  };
  const controles = (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="flex min-w-60 max-w-sm flex-1 items-center gap-2 rounded-[10px] border border-control px-3 py-1.5 text-suave">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar proveedor o servicio" aria-label="Buscar proveedor o servicio" className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none" />
      </label>
      <div className="w-72">
        <SelectorSociedad id="filtro-sociedad" opciones={sociedades.map((s) => ({ valor: s, nombre: s }))} valor={sociedad} alCambiar={setSociedad} textoTodas="Todas las sociedades" />
      </div>
      <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${claseControl} text-sm`}>
        <option value="">Todas las categorías</option>
        {categorias.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
  return { aplicar, controles };
}

export function TablaPagos({ datos, vacio, alGestionar }: { datos: Vencimiento[]; vacio: string; alGestionar: (id: number) => void }) {
  const th = "px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-suave";
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <caption className="sr-only">Pagos</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>Estado</th>
            <th scope="col" className={th}>Vence</th>
            <th scope="col" className={th}>Proveedor</th>
            <th scope="col" className={th}>Sociedad</th>
            <th scope="col" className={th}>Servicio</th>
            <th scope="col" className={th}>Responsable</th>
            <th scope="col" className={`${th} text-right`}>Monto pagado</th>
            <th scope="col" className={th}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {datos.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3.5 py-8 text-center text-suave">{vacio}</td>
            </tr>
          )}
          {datos.map((v) => {
            const c = cuando(v);
            return (
              <tr
                key={v.id}
                tabIndex={0}
                aria-label={`Gestionar ${v.proveedor} ${v.identificador}`}
                onClick={() => alGestionar(v.id)}
                onKeyDown={(e) => e.key === "Enter" && alGestionar(v.id)}
                className="cursor-pointer border-t border-linea hover:bg-fondo-suave"
              >
                <td className="px-3.5 py-4 align-top"><EstadoPago estado={v.estado} /></td>
                <td className="px-3.5 py-4 align-top">
                  <span className="block font-semibold whitespace-nowrap">{nombreFecha(v.fecha)}</span>
                  {c && <span className="mt-0.5 block text-xs text-suave whitespace-nowrap">{c}</span>}
                  {v.fechaOriginal && <span className="mt-0.5 block text-xs text-suave whitespace-nowrap">Original: {nombreFecha(v.fechaOriginal)}</span>}
                </td>
                <td className="px-3.5 py-4 align-top">
                  <span className="block font-semibold">{v.proveedor}</span>
                  <span className="mt-0.5 block text-xs text-suave">{v.categoria}</span>
                </td>
                <td className="px-3.5 py-4 align-top"><span title={v.sociedad} className="line-clamp-3 max-w-64 text-xs">{v.sociedad}</span></td>
                <td className="px-3.5 py-4 align-top font-mono text-[13px] text-suave whitespace-nowrap">{v.identificador}</td>
                <td className={`px-3.5 py-4 align-top ${v.responsableEfectivo ? "" : "text-suave"}`}>{v.responsableEfectivo ?? "—"}</td>
                <td className="px-3.5 py-4 align-top text-right whitespace-nowrap tabular-nums">
                  {v.pago ? <b>{montoPagado(v.pago.monto, v.pago.moneda)}</b> : <span className="text-suave">—</span>}
                </td>
                <td className="px-3.5 py-4 align-top text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      alGestionar(v.id);
                    }}
                    className="whitespace-nowrap rounded-lg border border-texto bg-fondo px-3.5 py-2 text-[13px] font-semibold hover:bg-fondo-suave"
                  >
                    Gestionar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
