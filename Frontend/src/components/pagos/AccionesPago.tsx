"use client";
import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { evaluarFechaEscrita } from "@/lib/fechas";
import { ESTADOS_ASOCIABLES, ESTADOS_JUSTIFICABLES, etiquetasDeCandidato, montoPagado, nombreFecha } from "@/lib/formato";
import type { CandidatoPago, DetalleVencimiento } from "@/lib/tipos";
import { CampoFecha } from "../SelectorFechas";
import { Campo, claseBoton, claseBotonSecundario, claseControl } from "../ui";
import { PanelJustificar, PanelQuitarJustificacion } from "./Justificar";

/** Etiqueta de texto (no solo color): la misma que «Prueba» en el Historial. */
function EtiquetaTexto({ children }: { children: string }) {
  return <span className="inline-block rounded-full border border-divisor bg-fondo-suave px-2 py-0.5 text-xs font-bold text-suave">{children}</span>;
}

/** Etiqueta de texto de un pago asociado a mano (junto al estado Pagado). */
export function EtiquetaAsociadoAMano() {
  return <EtiquetaTexto>Asociado a mano</EtiquetaTexto>;
}

const MENSAJE_MOTIVO = "Indique el motivo (entre 3 y 300 caracteres)";
const motivoValido = (m: string) => m.trim().length >= 3 && m.trim().length <= 300;

/**
 * Acciones que una persona puede hacer sobre un pago: «Asociar pago» (vencimientos por revisar, vencidos o sin información) y, si ya hay un
 * pago asociado a mano, «Quitar asociación». Solo se muestra si hay una acción posible para quien mira (lo decide el servidor, que además
 * vuelve a comprobar el permiso). `alCambiar` avisa a la pantalla para que actualice la fila.
 */
export function AccionesPago({ d, alCambiar }: { d: DetalleVencimiento; alCambiar: () => void }) {
  const [modo, setModo] = useState<"ninguno" | "asociar" | "quitar" | "justificar" | "quitar_justificacion" | "mover" | "quitar_movimiento">("ninguno");
  const puedeAsociar = ESTADOS_ASOCIABLES.includes(d.estado) && d.asociadoAMano === null;
  const puedeQuitar = d.asociadoAMano !== null;
  // un Vencido o Sin información se puede justificar; un Justificado ofrece quitar la justificación (y asociar un pago, que gana)
  const puedeJustificar = ESTADOS_JUSTIFICABLES.includes(d.estado) && d.justificado === null;
  const puedeQuitarJustificacion = d.justificado !== null;
  // «Mover fecha» (solo este mes) y devolverla a la original: lo decide el servidor según el estado y el permiso
  const puedeMover = d.puedeMoverFecha;
  const puedeQuitarMov = d.puedeQuitarMovimiento;
  if (!d.puedeGestionar || (!puedeAsociar && !puedeQuitar && !puedeJustificar && !puedeQuitarJustificacion && !puedeMover && !puedeQuitarMov)) return null;

  const terminar = (texto: string) => {
    avisar.exito(texto);
    setModo("ninguno");
    alCambiar();
  };

  if (modo === "asociar") return <PanelAsociar id={d.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Pago asociado a mano.")} />;
  if (modo === "quitar") return <PanelQuitar id={d.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Asociación quitada.")} />;
  if (modo === "justificar") {
    return <PanelJustificar motivos={d.motivosDeJustificacion} enviar={(motivo, nota) => api.justificarVencimiento(d.id, motivo, nota)} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Vencimiento justificado.")} />;
  }
  if (modo === "mover") return <PanelMover d={d} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Fecha movida.")} />;
  if (modo === "quitar_movimiento") return <PanelQuitarMovimiento id={d.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Movimiento quitado.")} />;
  if (modo === "quitar_justificacion") {
    return <PanelQuitarJustificacion enviar={(motivo) => api.quitarJustificacionDeVencimiento(d.id, motivo)} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Justificación quitada.")} />;
  }
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {puedeAsociar && <button type="button" onClick={() => setModo("asociar")} className={claseBotonSecundario}>Asociar pago</button>}
      {puedeQuitar && <button type="button" onClick={() => setModo("quitar")} className={claseBotonSecundario}>Quitar asociación</button>}
      {puedeJustificar && <button type="button" onClick={() => setModo("justificar")} className={claseBotonSecundario}>Justificar</button>}
      {puedeQuitarJustificacion && <button type="button" onClick={() => setModo("quitar_justificacion")} className={claseBotonSecundario}>Quitar justificación</button>}
      {puedeMover && <button type="button" onClick={() => setModo("mover")} className={claseBotonSecundario}>Mover fecha</button>}
      {puedeQuitarMov && <button type="button" onClick={() => setModo("quitar_movimiento")} className={claseBotonSecundario}>Quitar movimiento</button>}
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
                    {etiquetasDeCandidato(c).length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {etiquetasDeCandidato(c).map((e) => (
                          <EtiquetaTexto key={e}>{e}</EtiquetaTexto>
                        ))}
                      </span>
                    )}
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

function PanelMover({ d, alCancelar, alTerminar }: { d: DetalleVencimiento; alCancelar: () => void; alTerminar: () => void }) {
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<{ fecha?: string; motivo?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const { desde, hasta } = d.rangoMoverFecha;

  async function mover() {
    const f = evaluarFechaEscrita(texto, { minimo: desde, maximo: hasta });
    const nuevos: typeof errores = {};
    if (f.estado !== "valido") nuevos.fecha = f.mensaje;
    else if (f.fecha === d.fecha) nuevos.fecha = "Esa ya es la fecha de este vencimiento";
    if (!motivoValido(motivo)) nuevos.motivo = MENSAJE_MOTIVO;
    setErrores(nuevos);
    if (f.estado !== "valido" || nuevos.fecha || nuevos.motivo) return;
    setGuardando(true);
    try {
      await api.moverFecha(d.id, f.fecha, motivo.trim());
      alTerminar();
    } catch (e) {
      const campo = e instanceof ErrorApi ? e.campo : undefined;
      const mensaje = e instanceof Error ? e.message : "No se pudo mover la fecha";
      setErrores(campo === "nuevaFecha" ? { fecha: mensaje } : campo === "motivo" ? { motivo: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Mover fecha</h3>
      <p className="mt-1 text-sm text-suave">Solo cambia la fecha de este mes. Fecha original: {nombreFecha(d.fechaOriginal)}.</p>
      <div className="mt-3">
        <CampoFecha id="nueva-fecha" etiqueta="Nueva fecha" valor={texto} alCambiar={setTexto} error={errores.fecha} />
      </div>
      <CampoMotivo valor={motivo} alCambiar={setMotivo} error={errores.motivo} />
      {errores.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{errores.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={mover} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Mover fecha"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}

function PanelQuitarMovimiento({ id, alCancelar, alTerminar }: { id: number; alCancelar: () => void; alTerminar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<{ motivo?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);

  async function quitar() {
    if (!motivoValido(motivo)) return setError({ motivo: MENSAJE_MOTIVO });
    setError({});
    setGuardando(true);
    try {
      await api.quitarMovimiento(id, motivo.trim());
      alTerminar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo quitar el movimiento";
      setError(e instanceof ErrorApi && e.campo === "motivo" ? { motivo: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Quitar movimiento</h3>
      <CampoMotivo valor={motivo} alCambiar={setMotivo} error={error.motivo} />
      {error.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{error.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={quitar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Quitar movimiento"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}
