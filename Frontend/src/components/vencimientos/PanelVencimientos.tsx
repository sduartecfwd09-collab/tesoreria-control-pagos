"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nombrePeriodo, periodoActual } from "@/lib/formato";
import type { Categoria, FiltroVencimientos, Pagina, Sociedad, Vencimiento } from "@/lib/tipos";
import { CajaError, claseControl, Paginador } from "../ui";
import { GenerarVencimientos } from "./GenerarVencimientos";
import { TablaVencimientos } from "./TablaVencimientos";

const POR_PAGINA = 50;
type Filtro = Omit<FiltroVencimientos, "porPagina">;

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
  const [pagina, setPagina] = useState<Pagina<Vencimiento> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    Promise.all([api.listarSociedades(), api.listarCategorias(), api.resumenCatalogo(), api.periodosGenerados()])
      .then(([sociedades, categorias, r, periodos]) => {
        if (!vigente) return;
        setBase({ sociedades, categorias, activas: r.activas, periodos });
        // Por defecto se muestra el mes actual si ya está generado; si no, el último generado.
        setFiltro((f) => {
          if (f && (!f.periodo || periodos.some((p) => p.periodo === f.periodo))) return f;
          const actual = periodoActual();
          const periodo = periodos.some((p) => p.periodo === actual) ? actual : periodos.at(-1)?.periodo;
          return { ...f, periodo, pagina: 1 };
        });
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f && f.q !== (texto.trim() || undefined) ? { ...f, q: texto.trim() || undefined, pagina: 1 } : f)), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (!filtro) return;
    let vigente = true;
    api
      .listarVencimientos({ ...filtro, porPagina: POR_PAGINA })
      .then((p) => vigente && setPagina(p))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [filtro, intento]);

  const cambiar = (f: Partial<Filtro>) => setFiltro((x) => ({ ...x, ...f, pagina: f.pagina ?? 1 }));

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
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
          setFiltro((f) => ({ ...f, periodo: r.desde, pagina: 1 }));
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
                <select className={`${claseControl} mt-1 w-full`} value={filtro.sociedadId ?? ""} onChange={(e) => cambiar({ sociedadId: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Todas</option>
                  {base.sociedades.map((s) => (
                    <option key={s.id} value={s.id}>{s.codigo ?? s.nombreLargo}</option>
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
            {pagina && (
              <>
                <p className="mt-3 text-sm" aria-live="polite">
                  {pagina.total === 0 ? "Ningún vencimiento coincide con los filtros." : `${pagina.total.toLocaleString("es-CR")} vencimientos`}
                </p>
                {pagina.datos.length > 0 && (
                  <>
                    <TablaVencimientos datos={pagina.datos} />
                    <Paginador pagina={pagina.pagina} paginas={pagina.paginas} total={pagina.total} unidad="vencimientos" alCambiar={(p) => cambiar({ pagina: p })} />
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
