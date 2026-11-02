"use client";
import { useId, useState, type ReactNode } from "react";
import { api, ErrorApi } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { fraseRevisada, identificadorEnmascarado, MESES } from "@/lib/formato";
import type { EstadoObligacion, Frecuencia, Obligacion } from "@/lib/tipos";
import { Ficha } from "../Ficha";
import { IconoEstado } from "../pagos/EstadoPago";
import { Campo, claseBoton, claseBotonSecundario, claseControl, Etiqueta, type Tono } from "../ui";

const ESTADO: Record<EstadoObligacion, { texto: string; tono: Tono }> = {
  activa: { texto: "Activa", tono: "verde" },
  inactiva: { texto: "Inactiva", tono: "suave" },
  en_revision: { texto: "En revisión", tono: "ambar" },
  revisada: { texto: "Revisada", tono: "suave" },
};
const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };
const MENSAJE_NOTA = "Escriba la nota (entre 3 y 300 caracteres)";
const MENSAJE_MOTIVO = "Indique el motivo (entre 3 y 300 caracteres)";
const largoValido = (t: string) => t.trim().length >= 3 && t.trim().length <= 300;

/** La etiqueta de estado de una obligación; «Revisada» lleva además un ícono (nunca solo color). */
export function EtiquetaEstadoObligacion({ estado }: { estado: EstadoObligacion }) {
  const e = ESTADO[estado];
  return (
    <Etiqueta tono={e.tono} icono={estado === "revisada" ? <IconoEstado estado="pagado" /> : undefined}>
      {e.texto}
    </Etiqueta>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Ficha de una obligación («Gestionar»): sus datos (el identificador enmascarado), su estado, las causas de la revisión y la revisión vigente.
 * Una obligación «En revisión» se puede marcar como revisada con una nota; una «Revisada», quitar la revisión con un motivo. La nota explica:
 * no corrige el dato. Las acciones solo aparecen si el servidor dice que hay una posible para esta persona.
 */
export function FichaObligacion({ o, alCerrar, alCambiar }: { o: Obligacion; alCerrar: () => void; alCambiar: () => void }) {
  const [modo, setModo] = useState<"ninguno" | "marcar" | "quitar">("ninguno");
  const puedeMarcar = o.puedeGestionar && o.estado === "en_revision";
  const puedeQuitar = o.puedeGestionar && o.estado === "revisada";
  const terminar = (texto: string) => {
    avisar.exito(texto);
    alCambiar();
    alCerrar();
  };

  const fila = (k: string, v: ReactNode) => (
    <>
      <dt className="text-suave">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </>
  );

  return (
    <Ficha etiqueta="Obligación" titulo={`${o.proveedor} · ${o.categoria}`} idTitulo="titulo-obligacion" alCerrar={alCerrar}>
      <p className="flex flex-wrap items-center gap-2">
        <EtiquetaEstadoObligacion estado={o.estado} />
      </p>
      {o.revision && !o.revision.sinEfecto && o.estado === "revisada" && <p className="mt-3 font-semibold">{fraseRevisada(o.revision)}</p>}
      {o.etiquetas.length > 0 && (
        <Seccion titulo="Observaciones">
          <ul className="mt-2 space-y-1 text-sm">
            {o.etiquetas.map((e) => (
              <li key={e.codigo}>
                <strong>{e.texto}.</strong> {e.ayuda}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {modo === "marcar" && puedeMarcar && <PanelMarcar id={o.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Obligación marcada como revisada.")} />}
      {modo === "quitar" && puedeQuitar && <PanelQuitar id={o.id} alCancelar={() => setModo("ninguno")} alTerminar={() => terminar("Revisión quitada.")} />}
      {modo === "ninguno" && (puedeMarcar || puedeQuitar) && (
        <div className="mt-5 flex flex-wrap gap-3">
          {puedeMarcar && <button type="button" onClick={() => setModo("marcar")} className={claseBotonSecundario}>Marcar como revisada</button>}
          {puedeQuitar && <button type="button" onClick={() => setModo("quitar")} className={claseBotonSecundario}>Quitar revisión</button>}
        </div>
      )}

      <Seccion titulo="Datos">
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {fila("Proveedor", o.proveedor)}
          {fila("Número de servicio", <span className="font-mono">{identificadorEnmascarado(o.identificador)}</span>)}
          {fila("Sociedad", o.sociedad)}
          {fila("Día de pago", o.diaEsperadoPago !== null ? `Día ${o.diaEsperadoPago}` : "Sin día")}
          {fila("Frecuencia", <>{NOMBRE_FRECUENCIA[o.frecuencia]}{o.frecuencia !== "mensual" && o.mesArranque !== null && <span className="block text-xs font-normal text-suave">desde {MESES[o.mesArranque - 1]}</span>}</>)}
        </dl>
      </Seccion>
    </Ficha>
  );
}

function PanelMarcar({ id, alCancelar, alTerminar }: { id: number; alCancelar: () => void; alTerminar: () => void }) {
  const campo = useId();
  const [nota, setNota] = useState("");
  const [error, setError] = useState<{ nota?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);

  async function marcar() {
    if (!largoValido(nota)) return setError({ nota: MENSAJE_NOTA });
    setError({});
    setGuardando(true);
    try {
      await api.marcarRevisada(id, nota.trim());
      alTerminar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo marcar como revisada";
      setError(e instanceof ErrorApi && e.campo === "nota" ? { nota: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Marcar como revisada</h3>
      <div className="mt-3">
        <Campo id={`${campo}-nota`} etiqueta="Nota" error={error.nota}>
          <input id={`${campo}-nota`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-invalid={error.nota ? true : undefined} />
        </Campo>
      </div>
      {error.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{error.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={marcar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Marcar como revisada"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}

function PanelQuitar({ id, alCancelar, alTerminar }: { id: number; alCancelar: () => void; alTerminar: () => void }) {
  const campo = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<{ motivo?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);

  async function quitar() {
    if (!largoValido(motivo)) return setError({ motivo: MENSAJE_MOTIVO });
    setError({});
    setGuardando(true);
    try {
      await api.quitarRevision(id, motivo.trim());
      alTerminar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo quitar la revisión";
      setError(e instanceof ErrorApi && e.campo === "motivo" ? { motivo: mensaje } : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm font-bold">Quitar revisión</h3>
      <div className="mt-3">
        <Campo id={`${campo}-motivo`} etiqueta="Motivo" error={error.motivo}>
          <input id={`${campo}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-invalid={error.motivo ? true : undefined} />
        </Campo>
      </div>
      {error.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{error.general}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={quitar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : "Quitar revisión"}</button>
        <button type="button" onClick={alCancelar} className={claseBotonSecundario}>Cancelar</button>
      </div>
    </section>
  );
}
