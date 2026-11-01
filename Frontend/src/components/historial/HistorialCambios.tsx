"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { limitesDeNavegacion, opcionesDePeriodo, type IdAtajo, type Rango } from "@/lib/fechas";
import { cambioEnPalabras, fechaHoraDeCambio, rotuloDeCampo } from "@/lib/formato";
import { useListaInfinita } from "@/lib/useListaInfinita";
import type { LimitesFechas, RespuestaHistorial } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { SelectorPeriodo } from "../SelectorFechas";
import { SelectorSociedad } from "../SelectorSociedad";
import { CajaError, claseControl, FinDeLista, NombreSociedad } from "../ui";
import { CajaFiltros, claseCelda, claseContenedorTabla, claseEncabezadoTabla, claseFila, claseTabla, claseTh, FiltroConEtiqueta } from "../estilo-tabla";

const OPCIONES: IdAtajo[] = ["ultimos_12_meses", "mes", "mes_anterior", "ultimos_3_meses", "anio"];
const th = claseTh;
const celda = claseCelda;

/**
 * Historial de cambios: una fila por cada dato que una persona cambió en una obligación, del más reciente al más antiguo. El alcance, los
 * filtros y la paginación los hace el servidor. Es solo lectura: las filas no abren nada y no hay botones.
 */
export function HistorialCambios() {
  const [rango, setRango] = useState<Rango | null>(null); // null = todas las fechas
  const [sociedad, setSociedad] = useState("");
  const [persona, setPersona] = useState("");
  const [campo, setCampo] = useState("");
  const [limites, setLimites] = useState<LimitesFechas | null>(null);
  const [meta, setMeta] = useState<RespuestaHistorial | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    api.limitesFechas().then(setLimites).catch(() => setLimites(null));
  }, [intento]);

  const cargar = useMemo(
    () =>
      (pagina: number) =>
        api
          .historialCambios({ desde: rango?.desde, hasta: rango?.hasta, sociedadId: sociedad ? Number(sociedad) : undefined, usuarioId: persona ? Number(persona) : undefined, campo, pagina })
          .then((r) => (pagina === 1 && setMeta(r), r)),
    [rango, sociedad, persona, campo],
  );
  const lista = useListaInfinita(cargar, intento);

  if (lista.error) return <CajaError mensaje={lista.error} alReintentar={() => setIntento((n) => n + 1)} />;

  // el historial es el pasado: no se elige después de hoy (ni en «Elegir fechas»)
  const navegable = limites ? limitesDeNavegacion(limites, true) : undefined;
  const opciones = meta?.opciones;
  const hayFiltros = Boolean(rango || sociedad || persona || campo);

  return (
    <>
      <LineaAlcance alcance={lista.alcance} />

      <CajaFiltros etiqueta="Filtros del historial">
        {navegable && limites && (
          <SelectorPeriodo etiqueta="Período" opciones={opcionesDePeriodo(OPCIONES, limites.hoy, navegable, true)} inicial="todo" rangoActual={rango} limites={navegable} alCambiar={setRango} />
        )}
        {/* un filtro con una sola opción no deja elegir nada: no se muestra */}
        {opciones && opciones.sociedades.length > 1 && (
          <FiltroConEtiqueta id="historial-sociedad" etiqueta="Sociedad">
            <div className="w-72">
              <SelectorSociedad id="historial-sociedad" opciones={opciones.sociedades.map((s) => ({ valor: String(s.id), nombre: s.nombre }))} valor={sociedad} alCambiar={setSociedad} textoTodas="Todas las sociedades" />
            </div>
          </FiltroConEtiqueta>
        )}
        {opciones && opciones.personas.length > 1 && (
          <FiltroConEtiqueta id="historial-quien" etiqueta="Quién">
            <select id="historial-quien" value={persona} onChange={(e) => setPersona(e.target.value)} className={`${claseControl} text-sm`}>
              <option value="">Todas las personas</option>
              {opciones.personas.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </FiltroConEtiqueta>
        )}
        {opciones && opciones.campos.length > 1 && (
          <FiltroConEtiqueta id="historial-campo" etiqueta="Qué cambió">
            <select id="historial-campo" value={campo} onChange={(e) => setCampo(e.target.value)} className={`${claseControl} text-sm`}>
              <option value="">Todo lo que cambió</option>
              {opciones.campos.map((c) => (
                <option key={c} value={c}>{rotuloDeCampo(c)}</option>
              ))}
            </select>
          </FiltroConEtiqueta>
        )}
      </CajaFiltros>

      {lista.datos === null ? (
        <p className="mt-8 text-suave" role="status">Cargando el historial…</p>
      ) : lista.datos.length === 0 ? (
        <p className="mt-8 text-suave" role="status">{hayFiltros ? "No hay cambios con estos filtros." : "Todavía no hay cambios registrados."}</p>
      ) : (
        <>
          <div className={claseContenedorTabla}>
            <table className={`${claseTabla} min-w-[1000px]`}>
              <caption className="sr-only">Historial de cambios de las obligaciones</caption>
              <thead className={claseEncabezadoTabla}>
                <tr>
                  <th scope="col" className={th}>Fecha y hora</th>
                  <th scope="col" className={th}>Sociedad</th>
                  <th scope="col" className={th}>Obligación</th>
                  <th scope="col" className={th}>Qué cambió</th>
                  <th scope="col" className={th}>Antes → Después</th>
                  <th scope="col" className={th}>Quién</th>
                  <th scope="col" className={th}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {lista.datos.map((f) => {
                  const cambio = cambioEnPalabras(f);
                  return (
                    <tr key={f.id} className={claseFila}>
                      <td className={`${celda} whitespace-nowrap`}>{fechaHoraDeCambio(f.creadoEn) ?? "—"}</td>
                      <td className={celda}><NombreSociedad nombre={f.sociedad} /></td>
                      <td className={celda}>
                        {f.obligacion && (
                          <>
                            <span className="block font-semibold">{f.obligacion.proveedor}</span>
                            <span className="mt-0.5 block text-xs text-suave">{f.obligacion.categoria}</span>
                            <span className="mt-0.5 block font-mono text-xs text-suave">{f.obligacion.identificador}</span>
                          </>
                        )}
                      </td>
                      {cambio.tipo === "alta" ? (
                        <td colSpan={2} className={`${celda} font-semibold`}>Se creó la obligación</td>
                      ) : (
                        <>
                          <td className={`${celda} font-semibold`}>{rotuloDeCampo(f.campo)}</td>
                          <td className={celda}>{cambio.tipo === "sin_valores" ? (
                              "Cambió"
                            ) : (
                              <>
                                <span className="text-suave">{cambio.antes}</span> → <span className="font-semibold text-texto">{cambio.despues}</span>
                              </>
                            )}</td>
                        </>
                      )}
                      <td className={celda}>
                        {f.nombreUsuario}
                        {f.modoPruebas && <span className="ml-2 inline-block rounded-full border border-divisor bg-fondo-suave px-2 py-0.5 text-xs font-bold text-suave">Prueba</span>}
                      </td>
                      <td className={celda}>{f.motivo ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <FinDeLista cantidad={lista.datos.length} total={lista.total} unidad="cambios" hayMas={lista.hayMas} cargando={lista.cargandoMas} alLlegar={lista.cargarMas} />
        </>
      )}
    </>
  );
}
