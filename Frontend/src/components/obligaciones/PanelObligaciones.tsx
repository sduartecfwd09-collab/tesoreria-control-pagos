"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ordenarSociedades } from "@/lib/formato";
import { useListaInfinita } from "@/lib/useListaInfinita";
import { desplazarSuave } from "@/lib/useFiltroTarjeta";
import type {
  CambiosObligacion, Categoria, FiltroObligaciones, Frecuencia, Obligacion, Regeneracion,
  ResultadoImportacionCatalogo, ResumenCatalogo, Sociedad,
} from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { CajaError, claseBoton, claseBotonSecundario, claseControl, FinDeLista } from "../ui";
import { SelectorSociedad } from "../SelectorSociedad";
import { FormularioObligacion } from "./FormularioObligacion";
import { FichaObligacion } from "./FichaObligacion";
import { ResumenCalidad } from "./ResumenCalidad";
import { TablaObligaciones } from "./TablaObligaciones";

const POR_PAGINA = 100;
const TEXTO_FALTA = { monto: "falta monto", cuenta: "falta cuenta de pago", responsable: "sin responsable", dia: "falta día", frecuencia: "frecuencia sin confirmar" } as const;
type Filtro = Omit<FiltroObligaciones, "porPagina" | "pagina">;
const FILTRO_INICIAL: Filtro = { activa: true };

interface Catalogos {
  sociedades: Sociedad[];
  categorias: Categoria[];
  frecuenciaDefecto: Frecuencia;
}

function textoRegeneracion(r: Regeneracion | null): string {
  if (!r) return "";
  const partes = [
    r.creados && `${r.creados} creados`,
    r.actualizados && `${r.actualizados} ajustados`,
    r.eliminados && `${r.eliminados} eliminados`,
    r.protegidos && `${r.protegidos} sin tocar por estar pagados o con aviso`,
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
  const [gestionando, setGestionando] = useState<Obligacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importacion, setImportacion] = useState<ResultadoImportacionCatalogo | null>(null);

  const destinoLista = useRef<HTMLElement | null>(null);
  const previo = useRef<{ filtro: Filtro; texto: string } | null>(null);

  const cambiarFiltro = useCallback((f: Partial<Filtro>) => setFiltro((x) => ({ ...x, ...f })), []);

  // Al activar una tarjeta baja la vista hasta la lista.
  useEffect(() => {
    if (filtro.falta) desplazarSuave(destinoLista.current);
  }, [filtro.falta]);

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

  /** El cambio permanente del día ya se guardó (con o sin otros cambios): se cierra la edición y se actualiza la lista. */
  function terminarCambioDeDia(o: Obligacion) {
    setAviso(`Día de pago cambiado: ${o.proveedor} (${o.sociedad}).`);
    setEditando(null);
    recargar();
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

  function quitarTarjeta() {
    const p = previo.current;
    previo.current = null;
    setTexto(p?.texto ?? "");
    setFiltro(p ? { ...p.filtro, falta: undefined } : { ...filtro, falta: undefined });
  }

  const mensajeError = error ?? lista.error;
  if (mensajeError) return <CajaError mensaje={mensajeError} alReintentar={() => (setError(null), recargar())} />;
  if (!catalogos || !resumen || !lista.datos)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando obligaciones…
      </p>
    );

  const hayOtrosFiltros = filtro.sociedadId || filtro.categoria || filtro.activa !== true || filtro.q;
  // M: el total del catálogo en el alcance, según se muestren activas, inactivas o ambas
  const totalCatalogo = filtro.activa === true ? resumen.activas : filtro.activa === false ? resumen.inactivas : resumen.total;

  return (
    <>
      <LineaAlcance alcance={lista.alcance} />
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
          // los contadores de las tarjetas cuentan solo obligaciones activas: el filtro también, para que N coincida con la tarjeta
          // y quita los otros filtros para que el total de la lista sea el de la tarjeta; el segundo toque los restaura
          alFiltrarFalta={(falta) => {
            if (filtro.falta === falta) return quitarTarjeta();
            if (!filtro.falta) previo.current = { filtro, texto };
            setTexto("");
            setFiltro({ activa: true, falta });
          }}
        />
      )}

      {importacion && (
        <p role="status" className="mt-4 text-sm">
          Importación: {importacion.creadas} creadas, {importacion.actualizadas} actualizadas, {importacion.sinCambios} sin cambios.
          {importacion.problemas.length > 0 && ` ${importacion.problemas.length} filas con problemas (ver consola del Backend: npm run catalogo).`}
        </p>
      )}

      <section ref={destinoLista} aria-labelledby="h-lista" className="mt-10 scroll-mt-4">
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
              placeholder={lista.alcance?.tipo === "mio" ? "Proveedor o identificador" : "Proveedor, identificador o responsable"}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span aria-live="polite">
            {lista.total === 0
              ? "Ninguna obligación coincide con los filtros."
              : filtro.falta
                ? `Mostrando ${lista.total.toLocaleString("es-CR")} de ${totalCatalogo.toLocaleString("es-CR")} obligaciones: ${TEXTO_FALTA[filtro.falta]}`
                : `${lista.total.toLocaleString("es-CR")} obligaciones`}
          </span>
          {filtro.falta && (
            <button type="button" className={`${claseBotonSecundario} py-1 text-sm`} onClick={quitarTarjeta}>
              Quitar filtro
            </button>
          )}
          {hayOtrosFiltros && (
            <button
              type="button"
              className={`${claseBotonSecundario} py-1 text-sm`}
              onClick={() => {
                previo.current = null;
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
            <TablaObligaciones
              datos={lista.datos}
              alEditar={setEditando}
              alGestionar={setGestionando}
            />
            <FinDeLista cantidad={lista.datos.length} total={lista.total} unidad="obligaciones" hayMas={lista.hayMas} cargando={lista.cargandoMas} alLlegar={lista.cargarMas} />
          </>
        )}
        <p className="mt-4 text-sm text-suave">
          <strong>Observaciones</strong> señala solo problemas reales: un identificador repetido o con formato de IBAN, y la falta del día de pago o del mes de arranque, sin los cuales no se
          generan vencimientos. Pase el cursor sobre una observación para ver el detalle.
        </p>
      </section>

      {gestionando && <FichaObligacion o={gestionando} alCerrar={() => setGestionando(null)} alCambiar={recargar} />}
      {editando && (
        <FormularioObligacion
          key={editando === "nueva" ? "nueva" : editando.id}
          obligacion={editando === "nueva" ? null : editando}
          {...catalogos}
          alGuardar={guardar}
          alCambiarDia={terminarCambioDeDia}
          alCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
