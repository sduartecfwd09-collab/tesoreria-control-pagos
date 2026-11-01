"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { nombreFecha, nombrePeriodo } from "@/lib/formato";
import { aplanarAvisos, contarPorTarjeta, filtrarPorTarjeta, TARJETAS_AVISOS } from "@/lib/filtro-tarjetas";
import { useFiltroTarjeta } from "@/lib/useFiltroTarjeta";
import type { Avisos, ClaveGrupoAviso, EstadoVencimiento } from "@/lib/tipos";
import { LineaAlcance } from "../LineaAlcance";
import { CajaError } from "../ui";
import { DetallePago } from "./DetallePago";
import { EstadoPago, IconoEstado } from "./EstadoPago";
import { ACENTO_ESTADO, TarjetaDeEstado } from "./TarjetaEstado";

/** Cada grupo de avisos toma el estado que ya se usa en Pagos del mes. */
const ESTADO_DEL_GRUPO: Record<ClaveGrupoAviso, EstadoVencimiento> = { vencidos: "vencido", por_vencer: "por_vencer", por_revisar: "por_revisar", sin_informacion: "sin_informacion" };

const th = "px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-suave";

/** Pantalla de solo lectura: los avisos del servidor por grupo, con «Gestionar» que abre la misma ficha de Pagos del mes. */
export function PanelAvisos() {
  const [datos, setDatos] = useState<Avisos | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const { activa: tarjetaActiva, alternar: alternarTarjeta, destino: destinoTarjeta } = useFiltroTarjeta();
  const planas = useMemo(() => aplanarAvisos(datos?.grupos ?? []), [datos]);
  const visibles = useMemo(() => filtrarPorTarjeta(planas, TARJETAS_AVISOS, tarjetaActiva), [planas, tarjetaActiva]);

  useEffect(() => {
    let vigente = true;
    api.obtenerAvisos().then((r) => vigente && (setDatos(r), setError(null))).catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  if (error) return <CajaError mensaje={error} alReintentar={() => (setError(null), setIntento((n) => n + 1))} />;
  if (datos === null) return <p className="mt-8 text-suave" role="status">Cargando avisos…</p>;

  // El número de cada tarjeta y las filas que deja su filtro salen de la misma lista y la misma regla (lib/filtro-tarjetas).
  const porTarjeta = contarPorTarjeta(planas, TARJETAS_AVISOS);
  // el servidor solo envía el responsable a Jefatura: sin ese dato no hay columna
  const conResponsable = datos.grupos.some((g) => g.filas.some((f) => f.responsableEfectivo !== undefined));
  const grupos = datos.grupos.map((g) => ({ ...g, filas: visibles.filter((x) => x.clave === g.clave).map((x) => x.fila) }));

  return (
    <>
      <LineaAlcance alcance={datos.alcance} detalle={datos.alcance.tipo === "mio" ? `Con tu aviso de ${datos.diasAviso} días` : undefined} estadosCalculadosEn={datos.estadosCalculadosEn} />

      <section aria-label="Resumen de avisos" className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {datos.grupos.map((g) => (
          <TarjetaDeEstado key={g.clave} estado={ESTADO_DEL_GRUPO[g.clave]} titulo={g.titulo} filtro={{ activa: tarjetaActiva === g.clave, alTocar: () => alternarTarjeta(g.clave) }}>{porTarjeta[g.clave]!.toLocaleString("es-CR")}</TarjetaDeEstado>
        ))}
      </section>

      {datos.total === 0 && (
        <p className="mt-8 text-suave" role="status">{datos.alcance.tipo === "mio" ? "Nada por atender con tus días de aviso" : "Nada por atender."}</p>
      )}

      <section ref={destinoTarjeta} aria-hidden="true" className="scroll-mt-4" />
      {tarjetaActiva !== null && visibles.length === 0 && datos.total > 0 && <p className="mt-8 text-suave" role="status">No hay avisos en este grupo.</p>}
      {grupos.filter((g) => g.filas.length > 0).map((g) => (
        <section key={g.clave} className="mt-8" aria-labelledby={`aviso-${g.clave}`}>
          <h2 id={`aviso-${g.clave}`} className="flex items-center gap-2.5 text-xl font-bold">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${ACENTO_ESTADO[ESTADO_DEL_GRUPO[g.clave]]} ${["vencido", "sin_informacion"].includes(ESTADO_DEL_GRUPO[g.clave]) ? "text-fondo" : "text-texto"}`}>
              <IconoEstado estado={ESTADO_DEL_GRUPO[g.clave]} />
            </span>
            {g.titulo} <span className="font-normal text-suave">({g.filas.length.toLocaleString("es-CR")})</span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <caption className="sr-only">{g.titulo}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Sociedad</th>
                  <th scope="col" className={th}>Proveedor</th>
                  <th scope="col" className={th}>Identificador</th>
                  <th scope="col" className={th}>Mes</th>
                  <th scope="col" className={th}>Fecha habitual de pago</th>
                  {conResponsable && <th scope="col" className={th}>Responsable</th>}
                  <th scope="col" className={th}>Estado</th>
                  <th scope="col" className={th}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr key={f.id} className="border-t border-linea">
                    <td className="px-3.5 py-4 align-top"><span title={f.sociedad} className="line-clamp-3 max-w-64 text-xs">{f.sociedad}</span></td>
                    <td className="px-3.5 py-4 align-top font-semibold">{f.proveedor}</td>
                    <td className="px-3.5 py-4 align-top font-mono text-[13px] text-suave whitespace-nowrap">{f.identificador}</td>
                    <td className="px-3.5 py-4 align-top whitespace-nowrap">{nombrePeriodo(f.periodo)}</td>
                    <td className="px-3.5 py-4 align-top whitespace-nowrap">{nombreFecha(f.fecha)}</td>
                    {conResponsable && <td className="px-3.5 py-4 align-top">{f.responsableEfectivo ?? <span className="text-suave">—</span>}</td>}
                    <td className="px-3.5 py-4 align-top">
                      <EstadoPago estado={f.estado} />
                      <span className="mt-1 block max-w-72 text-xs text-suave">{f.textoEstado}</span>
                    </td>
                    <td className="px-3.5 py-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => setAbierto(f.id)}
                        aria-label={`Gestionar ${f.proveedor} ${f.identificador}`}
                        className="whitespace-nowrap rounded-lg border border-texto bg-fondo px-3.5 py-2 text-[13px] font-semibold hover:bg-fondo-suave"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {abierto !== null && <DetallePago id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}
