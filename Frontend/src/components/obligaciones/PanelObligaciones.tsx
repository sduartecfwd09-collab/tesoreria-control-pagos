"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MESES, ordenarSociedades } from "@/lib/formato";
import { useListaInfinita } from "@/lib/useListaInfinita";
import type {
  CambiosObligacion, Categoria, FiltroObligaciones, Frecuencia, Obligacion, Regeneracion,
  ResultadoImportacionCatalogo, ResumenCatalogo, Sociedad,
} from "@/lib/tipos";
import { CajaError, claseBoton, claseBotonSecundario, claseControl, FinDeLista } from "../ui";
import { ConfirmarCambio, type CambioPendiente } from "../ConfirmarCambio";
import { SelectorSociedad } from "../SelectorSociedad";
import { FormularioObligacion } from "./FormularioObligacion";
import { ResumenCalidad } from "./ResumenCalidad";
import { TablaObligaciones } from "./TablaObligaciones";

const POR_PAGINA = 100;
type Filtro = Omit<FiltroObligaciones, "porPagina" | "pagina">;
const FILTRO_INICIAL: Filtro = { activa: true };

interface Catalogos {
  sociedades: Sociedad[];
  categorias: Categoria[];
  frecuenciaDefecto: Frecuencia;
}

const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

const textoFrecuencia = (f: Frecuencia, mes: number | null) => (f === "mensual" || mes === null ? NOMBRE_FRECUENCIA[f] : `${NOMBRE_FRECUENCIA[f]}, desde ${MESES[mes - 1]}`);

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CR")} ${n === 1 ? uno : varios}`;

function textoCalendario(c: Regeneracion): string {
  const partes = [
    c.creados && `se crearon ${plural(c.creados, "vencimiento", "vencimientos")}`,
    c.actualizados && `se ajustaron ${plural(c.actualizados, "vencimiento", "vencimientos")}`,
    c.eliminados && `se eliminaron ${plural(c.eliminados, "vencimiento", "vencimientos")} que ya no corresponden`,
    c.protegidos && `${plural(c.protegidos, "vencimiento quedó", "vencimientos quedaron")} sin tocar por tener un pago conciliado`,
  ].filter(Boolean);
  return partes.length ? ` Calendario: ${partes.join("; ")}.` : " No hubo que ajustar el calendario.";
}

function sumar(total: Regeneracion, c: Regeneracion): Regeneracion {
  return { creados: total.creados + c.creados, actualizados: total.actualizados + c.actualizados, eliminados: total.eliminados + c.eliminados, protegidos: total.protegidos + c.protegidos };
}

function resumenActual(filas: Obligacion[]): string {
  const por = new Map<string, number>();
  for (const o of filas) {
    const k = textoFrecuencia(o.frecuencia, o.mesArranque);
    por.set(k, (por.get(k) ?? 0) + 1);
  }
  return [...por.entries()].map(([k, n]) => `${n.toLocaleString("es-CR")} con ${k.toLowerCase()}`).join("\n");
}

function textoRegeneracion(r: Regeneracion | null): string {
  if (!r) return "";
  const partes = [
    r.creados && `${r.creados} creados`,
    r.actualizados && `${r.actualizados} ajustados`,
    r.eliminados && `${r.eliminados} eliminados`,
    r.protegidos && `${r.protegidos} sin tocar por tener pago conciliado`,
  ].filter(Boolean);
  return partes.length ? ` Vencimientos futuros: ${partes.join(", ")}.` : " No hubo que ajustar vencimientos futuros.";
}

export function PanelObligaciones() {
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [resumen, setResumen] = useState<ResumenCatalogo | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [editando, setEditando] = useState<Obligacion | "nueva" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [seleccion, setSeleccion] = useState<Map<number, Obligacion>>(new Map());
  const [confirmacion, setConfirmacion] = useState<CambioPendiente | null>(null);
  const [masFrecuencia, setMasFrecuencia] = useState<Frecuencia>("mensual");
  const [masMes, setMasMes] = useState("");
  const [importacion, setImportacion] = useState<ResultadoImportacionCatalogo | null>(null);

  const cambiarFiltro = useCallback((f: Partial<Filtro>) => setFiltro((x) => ({ ...x, ...f })), []);

  // Búsqueda: espera 300 ms después de la última tecla para no consultar en cada letra.
  useEffect(() => {
    const t = setTimeout(() => setFiltro((x) => (x.q === (texto.trim() || undefined) ? x : { ...x, q: texto.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let vigente = true;
    Promise.all([api.listarSociedades(), api.listarCategorias(), api.listarParametros(), api.resumenCatalogo()])
      .then(([sociedades, categorias, parametros, r]) => {
        if (!vigente) return;
        const fd = parametros.find((p) => p.clave === "frecuencia_defecto")?.valor as Frecuencia | undefined;
        setCatalogos({ sociedades: ordenarSociedades(sociedades), categorias, frecuenciaDefecto: fd ?? "mensual" });
        setResumen(r);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  const cargar = useCallback((p: number) => api.listarObligaciones({ ...filtro, pagina: p, porPagina: POR_PAGINA }), [filtro]);
  const lista = useListaInfinita(cargar, intento);

  const recargar = () => setIntento((n) => n + 1);

  async function guardar(cambios: CambiosObligacion) {
    if (editando === "nueva") {
      const r = await api.crearObligacion(cambios);
      setAviso(`Se creó la obligación de ${r.datos.proveedor} en ${r.datos.sociedad}.${textoRegeneracion(r.regeneracion)}`);
    } else if (editando) {
      const r = await api.editarObligacion(editando.id, cambios);
      setAviso(`Se guardaron los cambios de ${r.datos.proveedor} (${r.datos.sociedad}).${textoRegeneracion(r.regeneracion)}`);
    }
    setEditando(null);
    recargar();
  }

  const alternar = useCallback((o: Obligacion) => {
    setSeleccion((s) => {
      const n = new Map(s);
      if (n.has(o.id)) n.delete(o.id);
      else n.set(o.id, o);
      return n;
    });
  }, []);

  const datosCargados = lista.datos;
  const alternarTodas = useCallback(() => {
    setSeleccion((s) => {
      const filas = datosCargados ?? [];
      const todas = filas.length > 0 && filas.every((o) => s.has(o.id));
      const n = new Map(s);
      for (const o of filas) {
        if (todas) n.delete(o.id);
        else n.set(o.id, o);
      }
      return n;
    });
  }, [datosCargados]);

  /** Cambio de frecuencia de una fila: pide confirmación con el antes y el después. */
  const cambiarUna = useCallback((o: Obligacion, f: Frecuencia, mes: number | null) => {
    setConfirmacion({
      titulo: `Cambiar la frecuencia de ${o.proveedor} (${o.sociedad})`,
      antes: textoFrecuencia(o.frecuencia, o.mesArranque),
      despues: textoFrecuencia(f, mes),
      ejecutar: async () => {
        const r = await api.editarObligacion(o.id, { frecuencia: f, mesArranque: f === "mensual" ? null : mes });
        setAviso(`Se guardó la frecuencia de ${r.datos.proveedor} (${r.datos.sociedad}).${r.regeneracion ? textoCalendario(r.regeneracion) : ""}`);
        setIntento((n) => n + 1);
      },
    });
  }, []);

  /** Confirmar la frecuencia actual de una fila (sin cambiarla). */
  const confirmarUna = useCallback((o: Obligacion) => {
    setConfirmacion({
      titulo: `Confirmar la frecuencia de ${o.proveedor} (${o.sociedad})`,
      antes: `${textoFrecuencia(o.frecuencia, o.mesArranque)}\nSin confirmar`,
      despues: `${textoFrecuencia(o.frecuencia, o.mesArranque)}\nConfirmada`,
      ejecutar: async () => {
        const r = await api.editarObligacion(o.id, { frecuencia: o.frecuencia, mesArranque: o.frecuencia === "mensual" ? null : o.mesArranque });
        setAviso(`Se confirmó la frecuencia de ${r.datos.proveedor} (${r.datos.sociedad}).${r.regeneracion ? textoCalendario(r.regeneracion) : ""}`);
        setIntento((n) => n + 1);
      },
    });
  }, []);

  function cambiarSeleccionadas() {
    const filas = [...seleccion.values()];
    const mes = masFrecuencia === "mensual" || masMes === "" ? null : Number(masMes);
    if (filas.length === 0) return;
    if (masFrecuencia !== "mensual" && mes === null) {
      setAviso("Indique el mes de arranque: en qué mes toca el primer pago de esta frecuencia.");
      return;
    }
    setConfirmacion({
      titulo: `Cambiar la frecuencia de ${plural(filas.length, "obligación seleccionada", "obligaciones seleccionadas")}`,
      antes: resumenActual(filas),
      despues: `${plural(filas.length, "obligación", "obligaciones")} con ${textoFrecuencia(masFrecuencia, mes).toLowerCase()}`,
      ejecutar: async () => {
        const r = await api.cambiarFrecuencia(filas.map((o) => o.id), masFrecuencia, mes);
        setAviso(`Se cambió la frecuencia de ${plural(r.actualizadas, "obligación", "obligaciones")}.${textoCalendario(r.calendario)}`);
        setSeleccion(new Map());
        setIntento((n) => n + 1);
      },
    });
  }

  function confirmarSeleccionadas() {
    const filas = [...seleccion.values()];
    if (filas.length === 0) return;
    // La frecuencia confirmada es la que cada fila ya tiene: se agrupa por frecuencia y mes de arranque.
    const grupos = new Map<string, { f: Frecuencia; mes: number | null; ids: number[] }>();
    const aConfirmar: Obligacion[] = [];
    for (const o of filas) {
      if (o.frecuencia !== "mensual" && o.mesArranque === null) continue;
      aConfirmar.push(o);
      const mes = o.frecuencia === "mensual" ? null : o.mesArranque;
      const k = `${o.frecuencia}-${mes}`;
      const g = grupos.get(k) ?? { f: o.frecuencia, mes, ids: [] };
      g.ids.push(o.id);
      grupos.set(k, g);
    }
    const omitidas = filas.length - aConfirmar.length;
    setConfirmacion({
      titulo: `Confirmar la frecuencia de ${plural(aConfirmar.length, "obligación seleccionada", "obligaciones seleccionadas")}`,
      antes: `${resumenActual(aConfirmar)}\nSin confirmar${omitidas ? `\n(${plural(omitidas, "obligación se omite", "obligaciones se omiten")} por no tener mes de arranque)` : ""}`,
      despues: `${resumenActual(aConfirmar)}\nConfirmada`,
      ejecutar: async () => {
        let total: Regeneracion = { creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 };
        let n = 0;
        for (const g of grupos.values()) {
          const r = await api.cambiarFrecuencia(g.ids, g.f, g.mes);
          total = sumar(total, r.calendario);
          n += r.actualizadas;
        }
        setAviso(`Se confirmó la frecuencia de ${plural(n, "obligación", "obligaciones")}.${textoCalendario(total)}`);
        setSeleccion(new Map());
        setIntento((n) => n + 1);
      },
    });
  }

  async function importar() {
    setImportando(true);
    try {
      setImportacion(await api.importarCatalogo());
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImportando(false);
    }
  }

  const seleccionIds = new Set(seleccion.keys());
  const mensajeError = error ?? lista.error;
  if (mensajeError) return <CajaError mensaje={mensajeError} alReintentar={() => (setError(null), recargar())} />;
  if (!catalogos || !resumen || !lista.datos)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando obligaciones…
      </p>
    );

  const hayFiltros = filtro.sociedadId || filtro.categoria || filtro.activa !== true || filtro.q || filtro.falta;

  return (
    <>
      {aviso && (
        <div role="status" className="mt-6 flex flex-wrap items-start justify-between gap-3 rounded border-2 border-control bg-fondo-suave p-4">
          <p>
            {aviso}
          </p>
          <button type="button" className="text-sm underline" onClick={() => setAviso(null)}>
            Cerrar aviso
          </button>
        </div>
      )}

      {resumen.total === 0 ? (
        <div className="mt-8 max-w-2xl rounded border border-divisor bg-fondo-suave p-6">
          <p className="font-semibold">El catálogo de obligaciones está vacío.</p>
          <p className="mt-2 text-sm text-suave">
            Se carga desde la tabla de pagos frecuentes configurada en el servidor (CATALOGO_FILE). El archivo solo se lee; nunca se modifica.
          </p>
          <button type="button" className={`${claseBoton} mt-4`} onClick={importar} disabled={importando}>
            {importando ? "Importando…" : "Importar tabla de pagos"}
          </button>
        </div>
      ) : (
        <ResumenCalidad
          r={resumen}
          faltaActiva={filtro.falta}
          alFiltrarFalta={(falta) => cambiarFiltro({ falta: filtro.falta === falta ? undefined : falta })}
          alBuscar={(sociedad, q) => {
            setTexto(q);
            // El aviso de calidad trae la sociedad como texto (abreviatura o nombre largo): se busca su identificador.
            const encontrada = catalogos?.sociedades.find((s) => s.nombreLargo === sociedad);
            cambiarFiltro({ sociedadId: encontrada?.id, q, activa: true, falta: undefined, categoria: undefined });
          }}
        />
      )}

      {importacion && (
        <p role="status" className="mt-4 text-sm">
          Importación: {importacion.creadas} creadas, {importacion.actualizadas} actualizadas, {importacion.sinCambios} sin cambios.
          {importacion.problemas.length > 0 && ` ${importacion.problemas.length} filas con problemas (ver consola del Backend: npm run catalogo).`}
        </p>
      )}

      <section aria-labelledby="h-lista" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-acento pb-1">
          <h2 id="h-lista" className="text-lg font-bold">Lista de obligaciones</h2>
          <button type="button" className={claseBoton} onClick={() => setEditando("nueva")}>
            + Nueva obligación
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_2fr]">
          <div className="text-sm font-medium">
            <label htmlFor="filtro-sociedad">Sociedad</label>
            <div className="mt-1">
              <SelectorSociedad
                id="filtro-sociedad"
                opciones={catalogos.sociedades.map((s) => ({ valor: String(s.id), nombre: s.nombreLargo }))}
                valor={filtro.sociedadId ? String(filtro.sociedadId) : ""}
                alCambiar={(v) => cambiarFiltro({ sociedadId: v ? Number(v) : undefined })}
                textoTodas="Todas"
              />
            </div>
          </div>
          <label className="text-sm font-medium">
            Categoría
            <select className={`${claseControl} mt-1 w-full`} value={filtro.categoria ?? ""} onChange={(e) => cambiarFiltro({ categoria: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Todas</option>
              {catalogos.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Mostrar
            <select
              className={`${claseControl} mt-1 w-full`}
              value={filtro.activa === undefined ? "" : String(filtro.activa)}
              onChange={(e) => cambiarFiltro({ activa: e.target.value === "" ? undefined : e.target.value === "true" })}
            >
              <option value="true">Solo activas</option>
              <option value="false">Solo inactivas</option>
              <option value="">Activas e inactivas</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Buscar
            <input
              type="search"
              className={`${claseControl} mt-1 w-full`}
              placeholder="Proveedor, identificador o responsable"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span aria-live="polite">
            {lista.total === 0 ? "Ninguna obligación coincide con los filtros." : `${lista.total.toLocaleString("es-CR")} obligaciones`}
            {filtro.falta && ` · filtrando: ${{ monto: "falta monto", responsable: "sin responsable", dia: "falta día" }[filtro.falta]}`}
          </span>
          {hayFiltros && (
            <button
              type="button"
              className={`${claseBotonSecundario} py-1 text-sm`}
              onClick={() => {
                setTexto("");
                setFiltro(FILTRO_INICIAL);
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>

        {lista.datos.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-divisor bg-fondo-suave p-3 text-sm">
              <span className="font-medium" aria-live="polite">
                {seleccion.size === 0
                  ? "Marque las casillas para cambiar la frecuencia de varias obligaciones a la vez."
                  : plural(seleccion.size, "obligación seleccionada", "obligaciones seleccionadas")}
              </span>
              <label className="font-medium">
                Frecuencia
                <select
                  className={`${claseControl} ml-2 py-1`}
                  value={masFrecuencia}
                  onChange={(e) => {
                    const f = e.target.value as Frecuencia;
                    setMasFrecuencia(f);
                    if (f === "mensual") setMasMes("");
                  }}
                >
                  {(Object.keys(NOMBRE_FRECUENCIA) as Frecuencia[]).map((f) => (
                    <option key={f} value={f}>
                      {NOMBRE_FRECUENCIA[f]}
                    </option>
                  ))}
                </select>
              </label>
              {masFrecuencia !== "mensual" && (
                <label className="font-medium">
                  Mes de arranque
                  <select className={`${claseControl} ml-2 py-1`} value={masMes} onChange={(e) => setMasMes(e.target.value)}>
                    <option value="">Elija el mes</option>
                    {MESES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className={claseBoton} disabled={seleccion.size === 0 || (masFrecuencia !== "mensual" && masMes === "")} onClick={cambiarSeleccionadas}>
                Cambiar frecuencia de las seleccionadas
              </button>
              <button type="button" className={claseBotonSecundario} disabled={seleccion.size === 0} onClick={confirmarSeleccionadas}>
                Confirmar frecuencia de las seleccionadas
              </button>
              {seleccion.size > 0 && (
                <button type="button" className="underline" onClick={() => setSeleccion(new Map())}>
                  Quitar selección
                </button>
              )}
            </div>
            <TablaObligaciones
              datos={lista.datos}
              alEditar={setEditando}
              seleccion={seleccionIds}
              alAlternar={alternar}
              alAlternarTodas={alternarTodas}
              alCambiarFrecuencia={cambiarUna}
              alConfirmarFrecuencia={confirmarUna}
            />
            <FinDeLista cantidad={lista.datos.length} total={lista.total} unidad="obligaciones" hayMas={lista.hayMas} cargando={lista.cargandoMas} alLlegar={lista.cargarMas} />
          </>
        )}
        <p className="mt-4 text-sm text-suave">
          <strong>Observaciones</strong> señala solo problemas reales: un identificador repetido o con formato de IBAN, y la falta del día de pago o del mes de arranque, sin los cuales no se
          generan vencimientos. Pase el cursor sobre una observación para ver el detalle.
        </p>
      </section>

      {confirmacion && <ConfirmarCambio cambio={confirmacion} alCerrar={() => setConfirmacion(null)} />}

      {editando && (
        <FormularioObligacion
          key={editando === "nueva" ? "nueva" : editando.id}
          obligacion={editando === "nueva" ? null : editando}
          {...catalogos}
          alGuardar={guardar}
          alCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
