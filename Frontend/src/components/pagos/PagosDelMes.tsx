"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MESES } from "@/lib/formato";
import { primerDia, textoEntre, tipoDeVacio, ultimoDia, type Rango } from "@/lib/fechas";
import { guardarPeriodo, leerPeriodo } from "@/lib/periodo-guardado";
import { contarPorTarjeta, filtrarPorTarjeta, TARJETAS_PAGOS } from "@/lib/filtro-tarjetas";
import { useFiltroTarjeta } from "@/lib/useFiltroTarjeta";
import type { Alcance, AvisoDatos, EstadoVencimiento, LimitesFechas, Vencimiento } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { FiltroFechasActivo, SelectorFechas } from "../SelectorFechas";
import { CajaError } from "../ui";
import { DetallePago } from "./DetallePago";
import { Icono, Insignia, Tarjeta } from "./TarjetaEstado";
import { ORDEN } from "./EstadoPago";
import { TablaPagos, useFiltrosPagos } from "./TablaPagos";

type Pestana = "atencion" | "pagados" | "programados" | "todos";
/** La pestaña donde vive cada tarjeta: al tocarla se abre esa pestaña y se filtra además por el estado de la tarjeta. */
const PESTANA_DE_TARJETA: Record<string, Pestana> = { vencidos: "atencion", por_vencer: "atencion", sin_informacion: "atencion", pagados: "pagados" };
const PESTANAS: { clave: Pestana; texto: string; estados: EstadoVencimiento[] | null }[] = [
  { clave: "atencion", texto: "Requiere atención", estados: ["vencido", "por_vencer", "por_revisar", "sin_informacion"] },
  { clave: "pagados", texto: "Pagados", estados: ["pagado", "pagado_con_inconsistencia"] },
  { clave: "programados", texto: "Programados", estados: ["proyectado"] },
  { clave: "todos", texto: "Todos", estados: null },
];

/** «Hoy · lunes 27 de octubre de 2026», con la fecha de hoy del servidor. */
const textoHoy = (hoy: string) =>
  new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${hoy}T00:00:00Z`));

export function PagosDelMes() {
  const [hoy, setHoy] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [rango, setRango] = useState<Rango | null>(null);
  const [limites, setLimites] = useState<LimitesFechas | null>(null);
  const [mes, setMes] = useState<{ clave: string; datos: Vencimiento[]; alcance: Alcance; calculado: string | null } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("atencion");
  const [abierto, setAbierto] = useState<number | null>(null);
  const { activa: tarjetaActiva, alternar: alternarTarjeta, limpiar: limpiarTarjeta, destino: destinoTarjeta } = useFiltroTarjeta();
  const [pestanaPrevia, setPestanaPrevia] = useState<Pestana>("atencion");
  const [avisos, setAvisos] = useState<AvisoDatos[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  // el mes y el día o rango opcional dentro de él identifican lo que se pidió: un resultado viejo no se muestra
  const clave = `${periodo ?? ""}|${rango?.desde ?? ""}|${rango?.hasta ?? ""}`;

  // Abre en el mes de hoy según el reloj del servidor.
  useEffect(() => {
    let vigente = true;
    api.hoy().then((h) => {
      if (!vigente) return;
      const guardado = leerPeriodo<{ periodo: string; rango: Rango | null }>("pagos");
      setHoy(h);
      setPeriodo((p) => p ?? guardado?.periodo ?? h.slice(0, 7));
      setRango((r) => r ?? guardado?.rango ?? null);
    }).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    let vigente = true;
    api.limitesFechas().then((l) => vigente && setLimites(l)).catch(() => vigente && setLimites(null));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    if (periodo) guardarPeriodo("pagos", { periodo, rango });
  }, [periodo, rango]);

  useEffect(() => {
    let vigente = true;
    api.avisosDatos().then((a) => vigente && setAvisos(a)).catch(() => vigente && setAvisos([]));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    if (!periodo) return;
    let vigente = true;
    api.listarTodosVencimientos({ periodo, fechaDesde: rango?.desde, fechaHasta: rango?.hasta }).then((r) => vigente && (setMes({ clave, datos: r.datos, alcance: r.alcance, calculado: r.estadosCalculadosEn }), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [periodo, rango, intento]); // eslint-disable-line react-hooks/exhaustive-deps

  const datos = useMemo(() => (mes && mes.clave === clave ? mes.datos : null), [mes, clave]);
  const filtros = useFiltrosPagos(datos ?? []);

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (!hoy || !periodo) return <p className="mt-8 text-suave" role="status">Cargando pagos…</p>;

  const nombreMes = MESES[Number(periodo.slice(5, 7)) - 1]!;
  const cambiarMes = (nuevo: string) => (setPeriodo(nuevo), setRango(null)); // el día o rango es de un mes: al cambiar de mes se quita
  const todos = datos ?? [];
  const vacioDe = tipoDeVacio(rango ?? { desde: primerDia(periodo), hasta: ultimoDia(periodo) }, hoy, limites?.movimientos ?? null);
  const textoVacio = vacioDe === "futuro" ? "Todavía no hay vencimientos para estas fechas." : vacioDe === "sin_informacion" ? "Sin información: todavía no hay estados de cuenta de estas fechas." : rango ? `No hay vencimientos con fecha de vencimiento entre ${textoEntre(rango)}.` : `No hay pagos de ${nombreMes}.`;
  const cuenta = (...e: EstadoVencimiento[]) => todos.filter((v) => e.includes(v.estado)).length;
  // El número de cada tarjeta y las filas que deja su filtro salen de la misma lista y la misma regla (lib/filtro-tarjetas).
  const porTarjeta = contarPorTarjeta(todos, TARJETAS_PAGOS);
  const N = todos.length;
  const pagados = porTarjeta.pagados!;
  const pct = N ? Math.round((pagados / N) * 100) : 0;
  const tocarTarjeta = (clave: string) => {
    if (tarjetaActiva === clave) {
      setPestana(pestanaPrevia);
    } else {
      if (tarjetaActiva === null) setPestanaPrevia(pestana);
      setPestana(PESTANA_DE_TARJETA[clave]!);
    }
    alternarTarjeta(clave);
  };
  const filtroDe = (clave: string) => ({ activa: tarjetaActiva === clave, alTocar: () => tocarTarjeta(clave) });
  const filas = filtrarPorTarjeta(filtros.aplicar(todos), TARJETAS_PAGOS, tarjetaActiva)
    .filter((v) => PESTANAS.find((p) => p.clave === pestana)!.estados?.includes(v.estado) ?? true)
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.fecha.localeCompare(b.fecha) || a.id - b.id);

  return (
    <>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-light uppercase tracking-[0.24em] text-suave">Hoy · {textoHoy(hoy)}</span>
          <h1 className="mt-1.5 text-[32px] font-extrabold">Pagos de {nombreMes}</h1>
        </div>
        <SelectorFechas modo="mes" valor={periodo} onChange={cambiarMes} limites={limites?.ventana} hoy={hoy} />
      </header>
      <LineaAlcance alcance={mes?.alcance} estadosCalculadosEn={mes?.calculado} />

      <section aria-label="Afinar por día" className="mt-5">
        <SelectorFechas modo="rango" valor={rango} onChange={setRango} limites={limites?.ventana} hoy={hoy} atajos={["hoy", "semana"]} etiqueta="Vence entre" restringidoAMes={periodo} />
        {rango && (
          <div className="mt-2">
            <FiltroFechasActivo rotulo="Vence entre" rango={rango} alQuitar={() => setRango(null)} />
          </div>
        )}
      </section>

      {avisos.length > 0 && (
        <section role="status" aria-label="Datos desactualizados" className="mt-6 max-w-3xl rounded-xl border-2 border-texto bg-ambar-fondo p-4 text-texto">
          <h2 className="font-bold">Datos desactualizados</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {avisos.map((a) => (
              <li key={a.sociedadId}>{a.texto}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={rango ? "Resumen del período elegido" : "Resumen del mes"} className="mt-7 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Tarjeta titulo="Vencidos" filtro={filtroDe("vencidos")} acento="bg-rojo" detalle="Sin pago encontrado" icono={<Icono><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icono>}
          insignia={<Insignia clase="bg-rojo text-fondo">Atender hoy</Insignia>}>{porTarjeta.vencidos}</Tarjeta>
        <Tarjeta titulo="Por vencer" filtro={filtroDe("por_vencer")} acento="bg-ambar" detalle="Dentro de los días de aviso" icono={<Icono><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icono>}
          insignia={<Insignia clase="bg-ambar text-texto">Próximos</Insignia>}>{porTarjeta.por_vencer}</Tarjeta>
        <Tarjeta titulo="Pagados" filtro={filtroDe("pagados")} acento="bg-acento" barra={pct} icono={<Icono><path d="M20 6L9 17l-5-5" /></Icono>} insignia={<Insignia clase="bg-acento text-sobre-acento">de {N}</Insignia>}>
          {pagados}
        </Tarjeta>
        <Tarjeta titulo="Sin información" filtro={filtroDe("sin_informacion")} acento="bg-suave" detalle="Faltan estados de cuenta" icono={<Icono><circle cx="12" cy="12" r="10" /><path d="M9.5 9.2a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.9M12 17h.01" /></Icono>}
          insignia={<Insignia clase="bg-ambar-fondo text-texto border border-dashed border-texto">Revisar datos</Insignia>}>{porTarjeta.sin_informacion}</Tarjeta>
      </section>

      <section ref={destinoTarjeta} aria-label="Lista de pagos" className="mt-7 scroll-mt-4">
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
                onClick={() => (limpiarTarjeta(), setPestana(p.clave))}
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
          <TablaPagos datos={filas} alGestionar={setAbierto} vacio={N === 0 ? textoVacio : "No hay pagos que coincidan."} />
        )}
      </section>
      {abierto !== null && <DetallePago id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
