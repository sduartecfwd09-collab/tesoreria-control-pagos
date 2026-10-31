"use client";
import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { avisar, cerrar, reemplazar } from "@/lib/avisos";
import type { MiConfiguracion } from "@/lib/tipos";
import { ConfirmarCambio, type CambioPendiente } from "./ConfirmarCambio";
import { CajaError } from "./ui";
import { fechaHoraCR } from "@/lib/formato";
import { fraseDeAviso, fraseDeEspera } from "@/lib/fechas";

const textoDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Entero entre 0 y max, o null si el texto no lo es. */
function entero(texto: string, max: number): number | null {
  if (!/^\d+$/.test(texto.trim())) return null;
  const n = Number(texto);
  return n <= max ? n : null;
}

function CampoDias({
  id, titulo, ayuda, ejemplo, valor, max, alCambiar, error,
}: {
  id: string; titulo: string; ayuda: string; ejemplo: string; valor: string; max: number; alCambiar: (v: string) => void; error?: string;
}) {
  return (
    <div className="border-b border-divisor py-5">
      <label htmlFor={id} className="font-semibold">{titulo}</label>
      <p id={`${id}-ayuda`} className="mt-1 text-sm text-suave">{ayuda} Valores permitidos: de 0 a {max}.</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          max={max}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          className="w-24 rounded border-2 border-control bg-fondo px-3 py-2 text-base"
        />
        <span className="text-sm font-medium">días</span>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-rojo">{error}</p>}
      <p className="mt-3 text-sm">{ejemplo}</p>
    </div>
  );
}

export function PanelConfiguracion() {
  const [datos, setDatos] = useState<MiConfiguracion | null>(null);
  const [error, setError] = useState<{ texto: string; sinUsuario: boolean } | null>(null);
  const [intento, setIntento] = useState(0);
  const [aviso, setAviso] = useState("");
  const [espera, setEspera] = useState("");
  const [confirmacion, setConfirmacion] = useState<CambioPendiente | null>(null);
  const [errorCampos, setErrorCampos] = useState<{ aviso?: string; espera?: string }>({});
  const [actualizando, setActualizando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [modoPruebas, setModoPruebas] = useState<boolean | null>(null);

  useEffect(() => {
    let vigente = true;
    api
      .obtenerIdentidad()
      .then((i) => vigente && setModoPruebas(i.modoPruebas))
      .catch((e) => vigente && (setModoPruebas(true), setError({ texto: e instanceof Error ? e.message : "No se pudo cargar su configuración.", sinUsuario: false })));
    return () => {
      vigente = false;
    };
  }, [intento]);

  useEffect(() => {
    if (modoPruebas !== true) return;
    let vigente = true;
    api
      .obtenerMiConfiguracion()
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        setAviso(String(d.diasAviso));
        setEspera(String(d.diasEspera));
        setError(null);
      })
      .catch((e) => vigente && setError({ texto: e instanceof Error ? e.message : "No se pudo cargar su configuración.", sinUsuario: e instanceof ErrorApi && e.estado === 401 }));
    return () => {
      vigente = false;
    };
  }, [intento, modoPruebas]);

  if (modoPruebas === false)
    return (
      <p role="status" className="mt-8 max-w-2xl rounded border-2 border-control bg-fondo-suave p-4 font-semibold">
        Esta pantalla estará disponible cuando exista el inicio de sesión.
      </p>
    );
  if (error)
    return error.sinUsuario ? (
      <div role="alert" className="mt-8 max-w-2xl rounded border-2 border-control bg-fondo-suave p-4">
        <p className="font-semibold">{error.texto}</p>
        <p className="mt-2 text-sm text-suave">Elija su nombre en el selector «Actuando como» de la parte superior de la pantalla y esta página se actualizará con sus datos.</p>
      </div>
    ) : (
      <CajaError mensaje={error.texto} alReintentar={() => setIntento((n) => n + 1)} />
    );
  if (!datos)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando su configuración…
      </p>
    );

  const nAviso = entero(aviso, 60);
  const nEspera = entero(espera, 15);
  const cambiado = nAviso !== datos.diasAviso || nEspera !== datos.diasEspera;

  // Un pago de ejemplo que vence el 20 del mes en curso; las frases cambian mientras se escribe.
  const hoy = new Date();
  const pago = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-20`;
  const ejemploAviso = nAviso === null ? "Escriba un número de días para ver un ejemplo." : fraseDeAviso(nAviso, pago);
  const ejemploEspera = nEspera === null ? "Escriba un número de días para ver un ejemplo." : fraseDeEspera(nEspera, pago);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setErrorGuardado(null);
    setErrorCampos({
      aviso: nAviso === null ? "Indique un número entero de días entre 0 y 60." : undefined,
      espera: nEspera === null ? "Indique un número entero de días entre 0 y 15." : undefined,
    });
    if (nAviso === null || nEspera === null || !datos) return;
    const antes = datos;
    setConfirmacion({
      titulo: "Cambiar su configuración",
      antes: `Avisarme con ${textoDias(antes.diasAviso)} de anticipación\nMarcar Vencido si pasan ${textoDias(antes.diasEspera)} sin pago`,
      despues: `Avisarme con ${textoDias(nAviso)} de anticipación\nMarcar Vencido si pasan ${textoDias(nEspera)} sin pago`,
      // Se cierra la confirmación de inmediato: guardar recalcula los estados y puede tardar unos segundos; el avance se ve en el panel.
      ejecutar: async () => {
        setActualizando(true);
        const idAviso = avisar.informacion("Actualizando…", { fijo: true });
        api
          .guardarMiConfiguracion(nAviso, nEspera)
          .then((nuevo) => {
            setDatos(nuevo);
            setAviso(String(nuevo.diasAviso));
            setEspera(String(nuevo.diasEspera));
            const f = nuevo.estadosCalculadosEn ? fechaHoraCR(nuevo.estadosCalculadosEn) : null;
            const texto = f ? `Listo: los estados se calcularon el ${f}` : "Listo: sus cambios quedaron guardados.";
            reemplazar(idAviso, "exito", texto);
          })
          .catch((e) => {
            const mensaje = e instanceof Error && e.message ? e.message : "No se pudo guardar.";
            setErrorGuardado(mensaje);
            reemplazar(idAviso, "error", `${mensaje} Sus valores anteriores siguen vigentes.`);
          })
          .finally(() => {
            setActualizando(false);
            cerrar(idAviso);
          });
      },
    });
  }

  return (
    <div className="mt-8 max-w-[640px]">
    <form onSubmit={guardar} noValidate>
      <fieldset disabled={actualizando} className="contents">
      <section aria-labelledby="h-mis-reglas">
        <h2 id="h-mis-reglas" className="text-lg font-bold border-b-2 border-acento pb-1">
          Sus avisos y sus plazos
        </h2>
        <CampoDias
          id="mi-aviso"
          titulo="Avisarme con N días de anticipación"
          ayuda="Cuántos días antes de la fecha de pago quiere que el sistema le avise de un vencimiento."
          ejemplo={ejemploAviso}
          valor={aviso}
          max={60}
          alCambiar={setAviso}
          error={errorCampos.aviso}
        />
        <CampoDias
          id="mi-espera"
          titulo="Marcar Vencido si pasan N días sin pago"
          ayuda="Cuántos días espera el sistema, después de la fecha de pago, antes de marcar el pago como Vencido."
          ejemplo={ejemploEspera}
          valor={espera}
          max={15}
          alCambiar={setEspera}
          error={errorCampos.espera}
        />
      </section>
      </fieldset>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!cambiado || actualizando}
          className="rounded bg-acento px-6 py-2.5 font-bold text-sobre-acento disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actualizando ? "Actualizando…" : "Guardar"}
        </button>
        <span role="status" aria-live="polite" className="text-sm text-suave">
          {actualizando ? "Se están recalculando sus pagos con los valores nuevos" : !cambiado ? "Cambie algún valor para guardar" : ""}
        </span>
      </div>
      {errorGuardado && !actualizando && (
        <p role="alert" className="mt-3 text-sm font-medium text-rojo">
          {errorGuardado} Sus valores anteriores siguen vigentes.
        </p>
      )}
      {confirmacion && <ConfirmarCambio cambio={confirmacion} alCerrar={() => setConfirmacion(null)} />}
    </form>
    </div>
  );
}
