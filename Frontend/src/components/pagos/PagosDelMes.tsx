"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { MESES, sumarMeses } from "@/lib/formato";
import type { EstadoVencimiento, Vencimiento } from "@/lib/tipos";
import { CajaError } from "../ui";
import { DetallePago } from "./DetallePago";
import { ORDEN } from "./EstadoPago";
import { TablaPagos, useFiltrosPagos } from "./TablaPagos";

type Pestana = "atencion" | "pagados" | "programados" | "todos";
const PESTANAS: { clave: Pestana; texto: string; estados: EstadoVencimiento[] | null }[] = [
  { clave: "atencion", texto: "Requiere atención", estados: ["vencido", "por_vencer", "por_revisar", "sin_informacion"] },
  { clave: "pagados", texto: "Pagados", estados: ["pagado", "pagado_con_inconsistencia"] },
  { clave: "programados", texto: "Programados", estados: ["proyectado"] },
  { clave: "todos", texto: "Todos", estados: null },
];

const Icono = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    {children}
  </svg>
);

function Tarjeta({ titulo, icono, insignia, detalle, acento, barra, children }: { titulo: string; icono: ReactNode; insignia?: ReactNode; detalle?: string; acento: string; barra?: number; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-divisor bg-fondo p-5 text-left">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-suave">
        {icono}
        {titulo}
      </span>
      <span className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[44px] font-extrabold leading-none">{children}</span>
        {insignia}
      </span>
      {detalle && <span className="text-[13px] text-suave">{detalle}</span>}
      {barra !== undefined && (
        <div className="h-2 overflow-hidden rounded-full bg-[#eeeeee]" role="img" aria-label={`${barra} % pagado`}>
          <div className="h-2 rounded-full bg-acento" style={{ width: `${barra}%` }} />
        </div>
      )}
      <div className={`mt-auto h-[3px] rounded-full ${acento}`} />
    </div>
  );
}

const Insignia = ({ clase, children }: { clase: string; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${clase}`}>{children}</span>
);

/** «Hoy · lunes 27 de octubre de 2026», con la fecha de hoy del servidor. */
const textoHoy = (hoy: string) =>
  new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${hoy}T00:00:00Z`));

export function PagosDelMes() {
  const [hoy, setHoy] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [mes, setMes] = useState<{ periodo: string; datos: Vencimiento[]; diasAviso: number } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("atencion");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // Abre en el mes de hoy según el reloj del servidor.
  useEffect(() => {
    let vigente = true;
    api.hoy().then((h) => vigente && (setHoy(h), setPeriodo((p) => p ?? h.slice(0, 7)))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    if (!periodo) return;
    let vigente = true;
    api.listarTodosVencimientos({ periodo }).then((r) => vigente && (setMes({ periodo, datos: r.datos, diasAviso: r.diasAviso }), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [periodo, intento]);

  const datos = useMemo(() => (mes && mes.periodo === periodo ? mes.datos : null), [mes, periodo]);
  const filtros = useFiltrosPagos(datos ?? []);

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (!hoy || !periodo) return <p className="mt-8 text-suave" role="status">Cargando pagos…</p>;

  const nombreMes = MESES[Number(periodo.slice(5, 7)) - 1]!;
  const todos = datos ?? [];
  const cuenta = (...e: EstadoVencimiento[]) => todos.filter((v) => e.includes(v.estado)).length;
  const N = todos.length;
  const pagados = cuenta("pagado", "pagado_con_inconsistencia");
  const pct = N ? Math.round((pagados / N) * 100) : 0;
  const filas = filtros
    .aplicar(todos)
    .filter((v) => PESTANAS.find((p) => p.clave === pestana)!.estados?.includes(v.estado) ?? true)
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.fecha.localeCompare(b.fecha) || a.id - b.id);

  return (
    <>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-light uppercase tracking-[0.24em] text-suave">Hoy · {textoHoy(hoy)}</span>
          <h1 className="mt-1.5 text-[32px] font-extrabold">Pagos de {nombreMes}</h1>
        </div>
        <div className="flex items-center overflow-hidden rounded-[10px] border border-control">
          <button type="button" onClick={() => setPeriodo(sumarMeses(periodo, -1))} aria-label="Mes anterior" className="flex px-3.5 py-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span aria-live="polite" className="border-x border-control px-4 py-2.5 text-sm font-semibold capitalize">{nombreMes} {periodo.slice(0, 4)}</span>
          <button type="button" onClick={() => setPeriodo(sumarMeses(periodo, 1))} aria-label="Mes siguiente" className="flex px-3.5 py-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </header>

      <section aria-label="Resumen del mes" className="mt-7 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Tarjeta titulo="Vencidos" acento="bg-rojo" detalle="Sin pago encontrado" icono={<Icono><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icono>}
          insignia={<Insignia clase="bg-rojo text-fondo">Atender hoy</Insignia>}>{cuenta("vencido")}</Tarjeta>
        <Tarjeta titulo="Por vencer" acento="bg-ambar" detalle={`En los próximos ${mes?.diasAviso ?? ""} días`} icono={<Icono><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icono>}
          insignia={<Insignia clase="bg-ambar text-texto">Próximos</Insignia>}>{cuenta("por_vencer")}</Tarjeta>
        <Tarjeta titulo="Pagados" acento="bg-acento" barra={pct} icono={<Icono><path d="M20 6L9 17l-5-5" /></Icono>} insignia={<Insignia clase="bg-acento text-sobre-acento">de {N}</Insignia>}>
          {pagados}
        </Tarjeta>
        <Tarjeta titulo="Sin información" acento="bg-suave" detalle="Falta el estado de cuenta que lo confirme" icono={<Icono><circle cx="12" cy="12" r="10" /><path d="M9.5 9.2a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.9M12 17h.01" /></Icono>}
          insignia={<Insignia clase="bg-ambar-fondo text-texto border border-dashed border-texto">Revisar datos</Insignia>}>{cuenta("sin_informacion")}</Tarjeta>
      </section>

      <section aria-label="Lista de pagos" className="mt-7">
        <div role="tablist" aria-label="Filtrar por estado" className="flex flex-wrap gap-1 border-b border-divisor">
          {PESTANAS.map((p) => {
            const n = p.estados ? cuenta(...p.estados) : N;
            const activa = pestana === p.clave;
            return (
              <button
                key={p.clave}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setPestana(p.clave)}
                className={`border-b-4 px-4 py-3 text-sm ${activa ? "border-acento font-bold text-texto" : "border-transparent font-medium text-suave"}`}
              >
                {p.texto}
                <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${activa ? "bg-texto text-fondo" : "bg-[#eeeeee] text-texto"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        {filtros.controles}
        {datos === null ? (
          <p className="mt-6 text-suave" role="status">Cargando pagos…</p>
        ) : (
          <TablaPagos datos={filas} alGestionar={setAbierto} vacio={N === 0 ? `No hay pagos de ${nombreMes}.` : "No hay pagos que coincidan."} />
        )}
      </section>
      {abierto !== null && <DetallePago id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
