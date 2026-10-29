"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { textoEntre, type Rango } from "@/lib/fechas";
import { montoPagado, nombreFecha, nombrePeriodo } from "@/lib/formato";
import { useListaInfinita } from "@/lib/useListaInfinita";
import type { Categoria, EstadoVencimiento, LimitesFechas, RespuestaHistorico, Sociedad } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { FiltroFechasActivo, SelectorFechas } from "../SelectorFechas";
import { SelectorSociedad } from "../SelectorSociedad";
import { CajaError, claseControl, FinDeLista, NombreSociedad } from "../ui";
import { DetallePago } from "./DetallePago";
import { ESTADO, EstadoPago, ORDEN } from "./EstadoPago";

const POR_PAGINA = 50;
const ESTADOS = (Object.keys(ESTADO) as EstadoVencimiento[]).sort((a, b) => ORDEN[a] - ORDEN[b]);
const th = "px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-suave";

/**
 * Histórico: los vencimientos de las obligaciones del catálogo con su pago cruzado, por fecha de vencimiento. El filtro y la paginación
 * se hacen en el servidor. Si el período no tiene estados de cuenta cargados no se muestra una tabla vacía (se leería como «no hubo
 * pagos»): se dice «Sin información en este período».
 */
export function Historico() {
  const [rango, setRango] = useState<Rango | null>(null); // null = el período por defecto que define el servidor
  const [sociedad, setSociedad] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState("");
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [limites, setLimites] = useState<LimitesFechas | null>(null);
  const [sociedades, setSociedades] = useState<Sociedad[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [meta, setMeta] = useState<RespuestaHistorico | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    api.limitesFechas().then(setLimites).catch(() => setLimites(null));
    api.listarSociedades().then(setSociedades).catch(() => setSociedades([]));
    api.listarCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, [intento]);

  // la búsqueda por texto espera a que se deje de escribir
  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useMemo(
    () =>
      (pagina: number) =>
        api
          .historico({ desde: rango?.desde, hasta: rango?.hasta, sociedadId: sociedad ? Number(sociedad) : undefined, categoria: categoria ? Number(categoria) : undefined, estado, q, pagina, porPagina: POR_PAGINA })
          .then((r) => (pagina === 1 && setMeta(r), r)),
    [rango, sociedad, categoria, estado, q],
  );
  const lista = useListaInfinita(cargar, intento);
  const alAbrir = useCallback((id: number) => setAbierto(id), []);

  if (lista.error) return <CajaError mensaje={lista.error} alReintentar={() => setIntento((n) => n + 1)} />;

  const aplicado = meta?.rango ?? null;
  // el Histórico es el pasado: no se elige después de hoy
  const limitesHistorico = limites ? { primera: limites.ventana.primera, ultima: limites.hoy } : undefined;
  const hayFiltros = Boolean(sociedad || categoria || estado || q);
  const vacio = lista.datos !== null && lista.datos.length === 0 && aplicado;

  return (
    <>
      <LineaAlcance alcance={lista.alcance} />

      <section aria-label="Filtros del histórico" className="mt-5">
        <SelectorFechas modo="rango" valor={rango ?? aplicado} onChange={setRango} limites={limitesHistorico} hoy={limites?.hoy ?? aplicado?.hasta ?? ""}
          atajos={["ultimos_12_meses", "mes", "mes_anterior", "ultimos_3_meses", "anio"]} etiqueta="Vence entre" />
        {rango && (
          <div className="mt-2">
            <FiltroFechasActivo rotulo="Vence entre" rango={rango} alQuitar={() => setRango(null)} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-60 max-w-sm flex-1 items-center gap-2 rounded-[10px] border border-control px-3 py-1.5 text-suave">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar proveedor o servicio" aria-label="Buscar proveedor o servicio" className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none" />
          </label>
          <div className="w-72">
            <SelectorSociedad id="historico-sociedad" opciones={sociedades.map((s) => ({ valor: String(s.id), nombre: s.nombreLargo }))} valor={sociedad} alCambiar={setSociedad} textoTodas="Todas las sociedades" />
          </div>
          <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${claseControl} text-sm`}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={`${claseControl} text-sm`}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{ESTADO[e].texto}</option>
            ))}
          </select>
        </div>
      </section>

      {lista.datos === null ? (
        <p className="mt-8 text-suave" role="status">Cargando el histórico…</p>
      ) : vacio && meta?.cobertura.sinInformacion ? (
        <p className="mt-8 text-suave" role="status">Sin información: todavía no hay estados de cuenta de estas fechas.</p>
      ) : vacio ? (
        <p className="mt-8 text-suave" role="status">
          No hay vencimientos con fecha de vencimiento entre {textoEntre(aplicado)}{hayFiltros ? " que coincidan con los filtros" : ""}.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <caption className="sr-only">Histórico de vencimientos</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Sociedad</th>
                  <th scope="col" className={th}>Proveedor y categoría</th>
                  <th scope="col" className={th}>Fecha de vencimiento</th>
                  <th scope="col" className={th}>Estado</th>
                  <th scope="col" className={th}>Fecha de pago</th>
                  <th scope="col" className={th}>Cuenta</th>
                  <th scope="col" className={`${th} text-right`}>Monto del pago</th>
                  <th scope="col" className={th}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.datos.map((v) => (
                  <tr key={v.id} tabIndex={0} aria-label={`Ver ${v.proveedor} ${nombrePeriodo(v.periodo)}`} onClick={() => alAbrir(v.id)} onKeyDown={(e) => e.key === "Enter" && alAbrir(v.id)} className="cursor-pointer border-t border-linea hover:bg-fondo-suave">
                    <td className="px-3.5 py-4 align-top"><NombreSociedad nombre={v.sociedad} /></td>
                    <td className="px-3.5 py-4 align-top">
                      <span className="block font-semibold">{v.proveedor}</span>
                      <span className="mt-0.5 block text-xs text-suave">{v.categoria}</span>
                    </td>
                    <td className="px-3.5 py-4 align-top whitespace-nowrap font-semibold">{nombreFecha(v.fecha)}</td>
                    <td className="px-3.5 py-4 align-top"><EstadoPago estado={v.estado} /></td>
                    <td className="px-3.5 py-4 align-top whitespace-nowrap">{v.pago ? nombreFecha(v.pago.fecha) : <span className="text-suave">—</span>}</td>
                    <td className="px-3.5 py-4 align-top whitespace-nowrap">
                      {v.pago ? (
                        <>
                          <span className="block font-mono text-[13px]">{v.pago.cuenta}</span>
                          {v.pago.banco && <span className="mt-0.5 block text-xs text-suave">{v.pago.banco}</span>}
                        </>
                      ) : (
                        <span className="text-suave">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-4 align-top text-right whitespace-nowrap tabular-nums">{v.pago ? <b>{montoPagado(v.pago.monto, v.pago.moneda)}</b> : <span className="text-suave">—</span>}</td>
                    <td className="px-3.5 py-4 align-top text-right">
                      <button type="button" onClick={(e) => (e.stopPropagation(), alAbrir(v.id))} className="rounded border-2 border-control px-3 py-1.5 text-xs font-semibold hover:bg-fondo-suave">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FinDeLista cantidad={lista.datos.length} total={lista.total} unidad="vencimientos" hayMas={lista.hayMas} cargando={lista.cargandoMas} alLlegar={lista.cargarMas} />
        </>
      )}
      {abierto !== null && <DetallePago id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
