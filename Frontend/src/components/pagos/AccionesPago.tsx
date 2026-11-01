"use client";
import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { ESTADOS_ASOCIABLES, montoPagado, nombreFecha } from "@/lib/formato";
import type { CandidatoPago, DetalleVencimiento } from "@/lib/tipos";
import { Campo, claseBoton, claseBotonSecundario, claseControl } from "../ui";

/** Etiqueta de texto de un pago asociado a mano (junto al estado Pagado). */
export function EtiquetaAsociadoAMano() {
  return <span className="inline-block rounded-full border border-divisor bg-fondo-suave px-2 py-0.5 text-xs font-bold text-suave">Asociado a mano</span>;
}

const MENSAJE_MOTIVO = "Indique el motivo (entre 3 y 300 caracteres)";
const motivoValido = (m: string) => m.trim().length >= 3 && m.trim().length <= 300;

/**
 * Acciones que una persona puede hacer sobre un pago: «Asociar pago» (vencimientos por revisar, vencidos o sin información) y, si ya hay un
 * pago asociado a mano, «Quitar asociación». Solo se muestra si hay una acción posible para quien mira (lo decide el servidor, que además
 * vuelve a comprobar el permiso). `alCambiar` avisa a la pantalla para que actualice la fila.
 */
export function AccionesPago({ d, alCambiar }: { d: DetalleVencimiento; alCambiar: () => void }) {
  const [modo, setModo] = useState<"ninguno" | "asociar" | "quitar">("ninguno");
  const puedeAsociar = ESTADOS_ASOCIABLES.includes(d.estado) && d.asociadoAMano === null;
  const puedeQuitar = d.asociadoAMano !== null;
  if (!d.puedeGestionar || (!puedeAsociar && !puedeQuitar)) return null;

  const terminar = (texto: string) => {
    avisar.exito(texto);
    setModo("ninguno");
    alCambiar();
  };

  if (modo === "asociar") return <PanelAsociar id={d.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Pago asociado a mano.")} />;
  if (modo === "quitar") return <PanelQuitar id={d.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Asociación quitada.")} />;
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {puedeAsociar && <button type="button" onClick={() => setModo("asociar")} className={claseBotonSecundario}>Asociar pago</button>}
      {puedeQuitar && <button type="button" onClick={() => setModo("quitar")} className={claseBotonSecundario}>Quitar asociación</button>}
    </div>
  );
}

function CampoMotivo({ valor, alCambiar, error }: { valor: string; alCambiar: (v: string) => void; error?: string }) {
  return (
    <div className="mt-4">
      <Campo id="motivo-pago" etiqueta="Motivo" error={error}>
        <input id="motivo-pago" value={valor} onChange={(e) => alCambiar(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-describedby={error ? "motivo-pago-error" : undefined} aria-invalid={error ? true : undefined} />
      </Campo>
    </div>
  );
}

function PanelAsociar({ id, alCancelar, alTerminar }: { id: number; alCancelar: () => void; alTerminar: () => void }) {
  const [candidatos, setCandidatos] = useState<CandidatoPago[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<{ pago?: string; motivo?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api.pagosCandidatos(id).then((r) => vigente && setCandidatos(r)).catch((e) => vigente && setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar la lista"));
    return () => {
      vigente = false;
    };
  }, [id]);

  async function asociar() {
    const nuevos: typeof errores = {};
    if (elegido === null) nuevos.pago = "Elija un pago de la lista";
    if (!motivoValido(motivo)) nuevos.motivo = MENSAJE_MOTIVO;
    setErrores(nuevos);
    if (elegido === null || nuevos.motivo) return;
    setGuardando(true);
    try {
      await api.asociarPago(id, elegido, motivo.trim());
      alTerminar();
    } catch (e) {
      const campo = e instanceof ErrorApi ? e.campo : undefined;
      const mensaje = e instanceof Error ? e.message : "No se pudo asociar el pago";
      setErrores(campo === "motivo" ? { motivo: mensaje } : campo === "movimiento" ? { pago: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Asociar pago</h3>
      {errorCarga && <p role="alert" className="mt-2 font-semibold text-rojo">{errorCarga}</p>}
      {!candidatos && !errorCarga && <p role="status" className="mt-2 text-suave">Cargando…</p>}
      {candidatos && candidatos.length === 0 && <p className="mt-2 text-sm">No hay pagos disponibles cerca de esta fecha.</p>}
      {candidatos && candidatos.length > 0 && (
        <>
          <div role="radiogroup" aria-label="Pagos disponibles" aria-describedby={errores.pago ? "pago-error" : undefined} className="mt-2 max-h-72 overflow-y-auto rounded border border-linea">
            {candidatos.map((c) => (
              <label key={c.movimientoId} className="flex cursor-pointer items-start gap-3 border-t border-linea px-3 py-2 text-sm first:border-t-0 hover:bg-tinte-resalte has-[:checked]:bg-tinte-resalte">
                <input type="radio" name="pago" value={c.movimientoId} checked={elegido === c.movimientoId} onChange={() => setElegido(c.movimientoId)} className="mt-1 h-4 w-4" />
                <span className="grid flex-1 gap-x-4 gap-y-0.5 sm:grid-cols-[5rem_1fr_auto]">
                  <span className="font-semibold whitespace-nowrap">{nombreFecha(c.fecha)}</span>
                  <span className="break-words">
                    {c.descripcion ?? "—"}
                    <span className="block text-xs text-suave">{c.banco ? `${c.banco} · ` : ""}<span className="font-mono">{c.cuenta}</span></span>
                  </span>
                  <span className="font-bold tabular-nums whitespace-nowrap sm:text-right">{montoPagado(c.monto, c.moneda)}</span>
                </span>
              </label>
            ))}
          </div>
          {errores.pago && <p id="pago-error" role="alert" className="mt-1 text-sm font-medium text-rojo">{errores.pago}</p>}
          <CampoMotivo valor={motivo} alCambiar={setMotivo} error={errores.motivo} />
        </>
      )}
      {errores.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{errores.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {candidatos && candidatos.length > 0 && <button type="button" onClick={asociar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Asociar"}</button>}
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}

function PanelQuitar({ id, alCancelar, alTerminar }: { id: number; alCancelar: () => void; alTerminar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<{ motivo?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);

  async function quitar() {
    if (!motivoValido(motivo)) return setError({ motivo: MENSAJE_MOTIVO });
    setError({});
    setGuardando(true);
    try {
      await api.quitarAsociacion(id, motivo.trim());
      alTerminar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo quitar la asociación";
      setError(e instanceof ErrorApi && e.campo === "motivo" ? { motivo: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Quitar asociación</h3>
      <CampoMotivo valor={motivo} alCambiar={setMotivo} error={error.motivo} />
      {error.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{error.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={quitar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Quitar asociación"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}
