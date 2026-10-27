"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nombrePeriodo, ordenarSociedades, periodoActual } from "@/lib/formato";
import type { Categoria, FiltroVencimientos, Sociedad } from "@/lib/tipos";
import { useListaInfinita } from "@/lib/useListaInfinita";
import { CajaError, claseControl, FinDeLista } from "../ui";
import { GenerarVencimientos } from "./GenerarVencimientos";
import { TablaVencimientos } from "./TablaVencimientos";

const POR_PAGINA = 100;
type Filtro = Omit<FiltroVencimientos, "porPagina" | "pagina">;

interface Base {
  sociedades: Sociedad[];
  categorias: Categoria[];
  activas: number;
  periodos: { periodo: string; total: number }[];
}

export function PanelVencimientos() {
  const [base, setBase] = useState<Base | null>(null);
  const [filtro, setFiltro] = useState<Filtro | null>(null); // null hasta saber qué periodos hay
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    Promise.all([api.listarSociedades(), api.listarCategorias(), api.resumenCatalogo(), api.periodosGenerados()])
      .then(([sociedades, categorias, r, periodos]) => {
        if (!vigente) return;
        setBase({ sociedades: ordenarSociedades(sociedades), categorias, activas: r.activas, periodos });
        // Por defecto se muestra el mes actual si ya está generado; si no, el último generado.
        setFiltro((f) => {
          if (f && (!f.periodo || periodos.some((p) => p.periodo === f.periodo))) return f;
          const actual = periodoActual();
          const periodo = periodos.some((p) => p.periodo === actual) ? actual : periodos.at(-1)?.periodo;
          return { ...f, periodo };
        });
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f && f.q !== (texto.trim() || undefined) ? { ...f, q: texto.trim() || undefined } : f)), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useCallback((p: number) => api.listarVencimientos({ ...filtro, pagina: p, porPagina: POR_PAGINA }), [filtro]);
  const lista = useListaInfinita(filtro ? cargar : null, intento);

  const cambiar = (f: Partial<Filtro>) => setFiltro((x) => ({ ...x, ...f }));

  const mensajeError = error ?? lista.error;
  if (mensajeError) return <CajaError mensaje={mensajeError} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (!base || !filtro)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando vencimientos…
      </p>
    );

  return (
    <>
      <div className="mt-6 rounded border-l-4 border-control bg-fondo-suave p-4 text-sm max-w-3xl">
        <p>
          <strong>Estados:</strong> por ahora todos los vencimientos están en estado <strong>Proyectado</strong> (se espera el pago en esa fecha). Los estados
          Por vencer, Vencido, Pagado, Pagado con inconsistencia y Sin información llegan con el cruce de pagos (Hito 4).
        </p>
      </div>

      <GenerarVencimientos
        activas={base.activas}
        alGenerar={(r) => {
          setFiltro((f) => ({ ...f, periodo: r.desde }));
          setIntento((n) => n + 1);
        }}
      />

      <section aria-labelledby="h-venc" className="mt-10">
        <h2 id="h-venc" className="text-lg font-bold border-b-2 border-acento pb-1">Vencimientos por periodo</h2>
        {base.periodos.length === 0 ? (
          <p className="mt-4 rounded border border-divisor bg-fondo-suave p-6 max-w-2xl">
            Aún no hay vencimientos. Elija los meses arriba y pulse <strong>Generar vencimientos</strong>.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_2fr]">
              <label className="text-sm font-medium">
                Periodo
                <select className={`${claseControl} mt-1 w-full`} value={filtro.periodo ?? ""} onChange={(e) => cambiar({ periodo: e.target.value || undefined })}>
                  {base.periodos.map((p) => (
                    <option key={p.periodo} value={p.periodo}>
                      {nombrePeriodo(p.periodo)} ({p.total})
                    </option>
                  ))}
                  <option value="">Todos los periodos</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Sociedad
                <select className={`${claseControl} mt-1 w-full`} title={base.sociedades.find((x) => x.id === filtro.sociedadId)?.nombreLargo} value={filtro.sociedadId ?? ""} onChange={(e) => cambiar({ sociedadId: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Todas</option>
                  {base.sociedades.map((s) => (
                    <option key={s.id} value={s.id} title={s.nombreLargo}>{s.nombreLargo}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Categoría
                <select className={`${claseControl} mt-1 w-full`} value={filtro.categoria ?? ""} onChange={(e) => cambiar({ categoria: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Todas</option>
                  {base.categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Buscar
                <input type="search" className={`${claseControl} mt-1 w-full`} placeholder="Proveedor o identificador" value={texto} onChange={(e) => setTexto(e.target.value)} />
              </label>
            </div>
            {lista.datos && (
              <>
                <p className="mt-3 text-sm" aria-live="polite">
                  {lista.total === 0 ? "Ningún vencimiento coincide con los filtros." : `${lista.total.toLocaleString("es-CR")} vencimientos`}
                </p>
                {lista.datos.length > 0 && (
                  <>
                    <TablaVencimientos datos={lista.datos} />
                    <FinDeLista cantidad={lista.datos.length} total={lista.total} unidad="vencimientos" hayMas={lista.hayMas} cargando={lista.cargandoMas} alLlegar={lista.cargarMas} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
