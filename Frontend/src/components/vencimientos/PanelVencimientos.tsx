"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { nombrePeriodo, ordenarSociedades, periodoActual } from "@/lib/formato";
import type { AvisoDatos, Categoria, FiltroVencimientos, Sociedad } from "@/lib/tipos";
import { useListaInfinita } from "@/lib/useListaInfinita";
import { CajaError, claseControl, FinDeLista } from "../ui";
import { SelectorSociedad } from "../SelectorSociedad";
import { ESTADO, EtiquetaEstado } from "./EstadoVencimiento";
import { TablaVencimientos } from "./TablaVencimientos";

const POR_PAGINA = 100;
type Filtro = Omit<FiltroVencimientos, "porPagina" | "pagina" | "estado" | "pendientesAnteriores">;

// Tarjetas de arriba: cada una agrupa uno o dos estados y, al pulsarla, filtra la lista.
type Grupo = "atencion" | "por_vencer" | "por_revisar" | "pagado" | "inconsistencia" | "proyectado";
const GRUPOS: { clave: Grupo; titulo: string; estados: string[]; ayuda?: string }[] = [
  { clave: "atencion", titulo: "Requieren atención", estados: ["vencido", "sin_informacion"], ayuda: "Vencidos y sin información" },
  { clave: "por_vencer", titulo: "Por vencer", estados: ["por_vencer"] },
  { clave: "por_revisar", titulo: "Por revisar", estados: ["por_revisar"] },
  { clave: "pagado", titulo: "Pagados", estados: ["pagado"] },
  { clave: "inconsistencia", titulo: "Pagados con inconsistencia", estados: ["pagado_con_inconsistencia"] },
  { clave: "proyectado", titulo: "Proyectados", estados: ["proyectado"] },
];

const EXPLICACION: [keyof typeof ESTADO, string][] = [
  ["proyectado", "Todavía falta tiempo: aún no se espera el pago."],
  ["por_vencer", "La fecha de pago está dentro de los días de aviso."],
  ["pagado", "El pago aparece en un estado de cuenta de la sociedad."],
  ["pagado_con_inconsistencia", "Se pagó, pero por otra sociedad o más de una vez."],
  ["vencido", "Pasó la fecha sin pago, y los estados de cuenta cargados lo confirman."],
  ["sin_informacion", "Pasó la fecha, pero falta el estado de cuenta que permita saber si se pagó. Requiere atención."],
  ["por_revisar", "El pago no se pudo asignar con certeza a un solo vencimiento."],
];

interface Base {
  sociedades: Sociedad[];
  categorias: Categoria[];
  periodos: { periodo: string; total: number }[];
  avisos: AvisoDatos[];
}

function AvisoDeDatos({ avisos }: { avisos: AvisoDatos[] }) {
  if (avisos.length === 0) return null;
  return (
    <section role="status" aria-label="Datos desactualizados" className="mt-6 max-w-3xl rounded border-2 border-ambar-texto bg-ambar-fondo p-4 text-ambar-texto">
      <h2 className="font-bold">Datos desactualizados</h2>
      <p className="mt-1 text-sm">Estas sociedades no tienen estados de cuenta recientes: sus pagos pueden aparecer sin confirmar.</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {avisos.map((a) => (
          <li key={a.sociedadId}>{a.texto}</li>
        ))}
      </ul>
    </section>
  );
}

function Explicacion() {
  return (
    <details open className="mt-6 max-w-3xl rounded border-l-4 border-control bg-fondo-suave p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Qué significa cada estado</summary>
      <dl className="mt-3 space-y-2">
        {EXPLICACION.map(([estado, texto]) => (
          <div key={estado} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-start">
            <dt>
              <EtiquetaEstado estado={estado} />
            </dt>
            <dd>{texto}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-suave">La tarjeta «Requieren atención» reúne los vencidos y los que no tienen información. Al cargar el estado de cuenta que falta, el estado se actualiza solo.</p>
    </details>
  );
}

export function PanelVencimientos() {
  const [base, setBase] = useState<Base | null>(null);
  const [filtro, setFiltro] = useState<Filtro | null>(null); // null hasta saber qué periodos hay
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [resumen, setResumen] = useState<Record<string, number> | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    Promise.all([api.listarSociedades(), api.listarCategorias(), api.periodosGenerados(), api.avisosDatos().catch(() => [] as AvisoDatos[])])
      .then(([sociedades, categorias, periodos, avisos]) => {
        if (!vigente) return;
        setBase({ sociedades: ordenarSociedades(sociedades), categorias, periodos, avisos });
        // Por defecto se muestra el mes actual si tiene vencimientos; si no, el último.
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

  // El periodo elegido incluye siempre los pendientes (vencidos, sin información y por revisar) de meses anteriores.
  const consulta = useMemo(() => (filtro ? { ...filtro, pendientesAnteriores: filtro.periodo ? true : undefined } : null), [filtro]);
  const estados = grupo ? GRUPOS.find((g) => g.clave === grupo)!.estados.join(",") : undefined;

  useEffect(() => {
    if (!consulta) return;
    let vigente = true;
    api.listarVencimientos({ ...consulta, pagina: 1, porPagina: 1 }).then((r) => vigente && setResumen(r.resumen)).catch(() => vigente && setResumen(null));
    return () => {
      vigente = false;
    };
  }, [consulta, intento]);

  const cargar = useCallback((p: number) => api.listarVencimientos({ ...consulta, estado: estados, pagina: p, porPagina: POR_PAGINA }), [consulta, estados]);
  const lista = useListaInfinita(consulta ? cargar : null, intento);

  const cambiar = (f: Partial<Filtro>) => setFiltro((x) => ({ ...x, ...f }));

  const mensajeError = error ?? lista.error;
  if (mensajeError) return <CajaError mensaje={mensajeError} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (!base || !filtro)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando vencimientos…
      </p>
    );

  const cuenta = (estados: string[]) => estados.reduce((s, e) => s + (resumen?.[e] ?? 0), 0);

  return (
    <>
      <AvisoDeDatos avisos={base.avisos} />
      <Explicacion />

      <section aria-labelledby="h-venc" className="mt-10">
        <h2 id="h-venc" className="text-lg font-bold border-b-2 border-acento pb-1">Vencimientos por periodo</h2>
        {base.periodos.length === 0 ? (
          <p className="mt-4 rounded border border-divisor bg-fondo-suave p-6 max-w-2xl">
            Aún no hay vencimientos. Se generan solos a partir de las obligaciones activas.
          </p>
        ) : (
          <>
            <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Resumen por estado">
              {GRUPOS.map((g) => {
                const activo = grupo === g.clave;
                const n = cuenta(g.estados);
                return (
                  <li key={g.clave}>
                    <button
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setGrupo(activo ? null : g.clave)}
                      className={`w-full rounded px-4 py-3 text-left bg-fondo-suave ${activo ? "border-2 border-texto" : "border border-divisor hover:border-control"}`}
                    >
                      <span className="block text-sm text-suave">{g.titulo}</span>
                      <span className={`block text-2xl font-bold ${g.clave === "atencion" && n > 0 ? "text-rojo" : ""}`}>{n.toLocaleString("es-CR")}</span>
                      {g.ayuda && <span className="block text-xs text-suave">{g.ayuda}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_2fr]">
              <label className="text-sm font-medium">
                Periodo
                <select className={`${claseControl} mt-1 w-full`} value={filtro.periodo ?? ""} onChange={(e) => cambiar({ periodo: e.target.value || undefined })}>
                  {base.periodos.map((p) => (
                    <option key={p.periodo} value={p.periodo}>
                      {nombrePeriodo(p.periodo)}
                    </option>
                  ))}
                  <option value="">Todos los periodos</option>
                </select>
              </label>
              <div className="text-sm font-medium">
                <label htmlFor="filtro-sociedad">Sociedad</label>
                <div className="mt-1">
                  <SelectorSociedad
                    id="filtro-sociedad"
                    opciones={base.sociedades.map((s) => ({ valor: String(s.id), nombre: s.nombreLargo }))}
                    valor={filtro.sociedadId ? String(filtro.sociedadId) : ""}
                    alCambiar={(v) => cambiar({ sociedadId: v ? Number(v) : undefined })}
                    textoTodas="Todas"
                  />
                </div>
              </div>
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
            {filtro.periodo && <p className="mt-2 text-sm text-suave">Se muestran los de {nombrePeriodo(filtro.periodo)} y los pendientes de meses anteriores.</p>}
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
