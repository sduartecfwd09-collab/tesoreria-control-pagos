"use client";
import { useId, useState } from "react";
import { ErrorApi } from "@/lib/api";
import type { MotivoJustificacion } from "@/lib/tipos";
import { Campo, claseBoton, claseBotonSecundario, claseControl } from "../ui";

const MENSAJE_MOTIVO = "Indique el motivo (entre 3 y 300 caracteres)";
const MENSAJE_NOTA = "Explique el motivo (entre 3 y 300 caracteres)";
const largoValido = (t: string) => t.trim().length >= 3 && t.trim().length <= 300;

/**
 * Panel para justificar (un vencimiento o un archivo): el motivo se elige de una lista fija (la entrega el Backend) y la nota es opcional u
 * obligatoria según el motivo. `enviar` hace la llamada con el motivo elegido y la nota; los errores del servidor se muestran junto al dato que falla.
 */
export function PanelJustificar({ motivos, enviar, alCancelar, alTerminar }: {
  motivos: MotivoJustificacion[];
  enviar: (motivo: string, nota: string) => Promise<unknown>;
  alCancelar: () => void;
  alTerminar: () => void;
}) {
  const id = useId();
  const [clave, setClave] = useState(motivos[0]?.clave ?? "");
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<{ motivo?: string; nota?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const elegido = motivos.find((m) => m.clave === clave);

  async function justificar() {
    if (elegido?.notaObligatoria && !largoValido(nota)) return setErrores({ nota: MENSAJE_NOTA });
    if (nota.trim().length > 300) return setErrores({ nota: "La nota admite como máximo 300 caracteres" });
    setErrores({});
    setGuardando(true);
    try {
      await enviar(clave, nota.trim());
      alTerminar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo justificar";
      const campo = e instanceof ErrorApi ? e.campo : undefined;
      setErrores(campo === "motivo" ? { motivo: mensaje } : campo === "nota" ? { nota: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Justificar</h3>
      <div className="mt-3">
        <Campo id={`${id}-motivo`} etiqueta="Motivo" error={errores.motivo}>
          <select id={`${id}-motivo`} value={clave} onChange={(e) => setClave(e.target.value)} className={`${claseControl} w-full`}>
            {motivos.map((m) => (
              <option key={m.clave} value={m.clave}>{m.texto}</option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="mt-4">
        <Campo id={`${id}-nota`} etiqueta={elegido?.notaObligatoria ? "Explique el motivo" : "Nota (opcional)"} error={errores.nota}>
          <input id={`${id}-nota`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-invalid={errores.nota ? true : undefined} />
        </Campo>
      </div>
      {errores.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{errores.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={justificar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Justificar"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}

/** Panel para quitar una justificación: pide el motivo (3 a 300 caracteres) y llama a `enviar`. */
export function PanelQuitarJustificacion({ enviar, alCancelar, alTerminar }: { enviar: (motivo: string) => Promise<unknown>; alCancelar: () => void; alTerminar: () => void }) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<{ motivo?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);

  async function quitar() {
    if (!largoValido(motivo)) return setError({ motivo: MENSAJE_MOTIVO });
    setError({});
    setGuardando(true);
    try {
      await enviar(motivo.trim());
      alTerminar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo quitar la justificación";
      setError(e instanceof ErrorApi && e.campo === "motivo" ? { motivo: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Quitar justificación</h3>
      <div className="mt-3">
        <Campo id={`${id}-motivo`} etiqueta="Motivo" error={error.motivo}>
          <input id={`${id}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-invalid={error.motivo ? true : undefined} />
        </Campo>
      </div>
      {error.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{error.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={quitar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Quitar justificación"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}
