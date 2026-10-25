"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  CambiosObligacion, Categoria, Cuenta, FiltroObligaciones, Frecuencia, Obligacion, Pagina, Regeneracion,
  ResultadoImportacionCatalogo, ResumenCatalogo, Sociedad,
} from "@/lib/tipos";
import { CajaError, claseBoton, claseBotonSecundario, claseControl, Paginador } from "../ui";
import { FormularioObligacion } from "./FormularioObligacion";
import { ResumenCalidad } from "./ResumenCalidad";
import { TablaObligaciones } from "./TablaObligaciones";

const POR_PAGINA = 25;
type Filtro = Omit<FiltroObligaciones, "porPagina">;
const FILTRO_INICIAL: Filtro = { activa: true, pagina: 1 };

interface Catalogos {
  sociedades: Sociedad[];
  categorias: Categoria[];
  cuentas: Cuenta[];
  frecuenciaDefecto: Frecuencia;
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
  const [pagina, setPagina] = useState<Pagina<Obligacion> | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [editando, setEditando] = useState<Obligacion | "nueva" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importacion, setImportacion] = useState<ResultadoImportacionCatalogo | null>(null);

  const cambiarFiltro = useCallback((f: Partial<Filtro>) => setFiltro((x) => ({ ...x, ...f, pagina: f.pagina ?? 1 })), []);

  // Búsqueda: espera 300 ms después de la última tecla para no consultar en cada letra.
  useEffect(() => {
    const t = setTimeout(() => setFiltro((x) => (x.q === (texto.trim() || undefined) ? x : { ...x, q: texto.trim() || undefined, pagina: 1 })), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let vigente = true;
    Promise.all([api.listarSociedades(), api.listarCategorias(), api.listarCuentas(), api.listarParametros(), api.resumenCatalogo()])
      .then(([sociedades, categorias, cuentas, parametros, r]) => {
        if (!vigente) return;
        const fd = parametros.find((p) => p.clave === "frecuencia_defecto")?.valor as Frecuencia | undefined;
        setCatalogos({ sociedades, categorias, cuentas, frecuenciaDefecto: fd ?? "mensual" });
        setResumen(r);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    let vigente = true;
    api
      .listarObligaciones({ ...filtro, porPagina: POR_PAGINA })
      .then((p) => vigente && setPagina(p))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [filtro, intento]);

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

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), recargar())} />;
  if (!catalogos || !resumen || !pagina)
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
            const encontrada = catalogos?.sociedades.find((s) => (s.codigo ?? s.nombreLargo) === sociedad);
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
          <label className="text-sm font-medium">
            Sociedad
            <select className={`${claseControl} mt-1 w-full`} value={filtro.sociedadId ?? ""} onChange={(e) => cambiarFiltro({ sociedadId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Todas</option>
              {catalogos.sociedades.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo ?? s.nombreLargo} ({s.obligaciones})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Categoría
            <select className={`${claseControl} mt-1 w-full`} value={filtro.categoria ?? ""} onChange={(e) => cambiarFiltro({ categoria: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Todas</option>
              {catalogos.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.obligaciones})
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
            {pagina.total === 0 ? "Ninguna obligación coincide con los filtros." : `${pagina.total.toLocaleString("es-CR")} obligaciones`}
            {filtro.falta && ` · filtrando: ${{ monto: "falta monto", cuenta: "falta cuenta", responsable: "sin responsable", dia: "falta día" }[filtro.falta]}`}
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

        {pagina.datos.length > 0 && (
          <>
            <TablaObligaciones datos={pagina.datos} alEditar={setEditando} />
            <Paginador pagina={pagina.pagina} paginas={pagina.paginas} total={pagina.total} unidad="obligaciones" alCambiar={(p) => cambiarFiltro({ pagina: p })} />
          </>
        )}
        <p className="mt-4 text-sm text-suave">
          Etiquetas: <strong>Falta monto</strong> y <strong>Falta cuenta</strong> son datos opcionales sin completar. <strong>Por confirmar con Tesorería</strong> marca valores supuestos o
          dudosos (pase el cursor sobre la etiqueta o abra «Editar» para ver el detalle). <strong>Falta día</strong> y <strong>Falta mes de arranque</strong> impiden generar vencimientos.
        </p>
      </section>

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
