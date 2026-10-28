"use client";
import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import type { MiConfiguracion } from "@/lib/tipos";
import { ConfirmarCambio, type CambioPendiente } from "./ConfirmarCambio";
import { CajaError, claseBoton } from "./ui";

const textoDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const fecha = (d: Date) => d.toLocaleDateString("es-CR", { day: "numeric", month: "long" });
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

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
    <div className="py-5 border-b border-divisor grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
      <div>
        <label htmlFor={id} className="font-semibold">{titulo}</label>
        <p id={`${id}-ayuda`} className="mt-1 text-sm text-suave max-w-xl">{ayuda} Valores permitidos: de 0 a {max}.</p>
        <p className="mt-2 max-w-xl rounded border border-divisor bg-fondo-suave px-3 py-2 text-sm">
          <strong>Ejemplo:</strong> {ejemplo}
        </p>
        {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-rojo">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
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
          className="border-2 border-control bg-fondo rounded px-3 py-2 text-base w-24"
        />
        <span className="text-sm text-suave">días</span>
      </div>
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
  const [ok, setOk] = useState<string | null>(null);
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

  // Ejemplos con fechas: toman el día 20 del mes en curso como fecha de pago ilustrativa.
  const hoy = new Date();
  const pago = new Date(hoy.getFullYear(), hoy.getMonth(), 20);
  const ejemploAviso =
    nAviso === null
      ? "Escriba un número de días para ver un ejemplo."
      : nAviso === 0
        ? `Si un pago vence el ${fecha(pago)}, el aviso aparece ese mismo día.`
        : `Si un pago vence el ${fecha(pago)}, el aviso le aparece desde el ${fecha(sumarDias(pago, -nAviso))} (${textoDias(nAviso)} antes).`;
  const ejemploEspera =
    nEspera === null
      ? "Escriba un número de días para ver un ejemplo."
      : nEspera === 0
        ? `Si el pago se esperaba el ${fecha(pago)} y no aparece, el ${fecha(sumarDias(pago, 1))} se marca Vencido.`
        : `Si el pago se esperaba el ${fecha(pago)} y no aparece, hasta el ${fecha(sumarDias(pago, nEspera))} se sigue esperando; desde el ${fecha(sumarDias(pago, nEspera + 1))} se marca Vencido.`;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
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
      ejecutar: async () => {
        const nuevo = await api.guardarMiConfiguracion(nAviso, nEspera);
        setDatos(nuevo);
        setAviso(String(nuevo.diasAviso));
        setEspera(String(nuevo.diasEspera));
        setOk("Sus cambios quedaron guardados.");
      },
    });
  }

  return (
    <form onSubmit={guardar} noValidate className="mt-8">
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
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" className={claseBoton} disabled={!cambiado}>
          Guardar
        </button>
        <span role="status" aria-live="polite" className="text-sm text-suave">
          {ok ?? (!cambiado ? "Cambie algún valor para poder guardar." : "")}
        </span>
      </div>
      {confirmacion && <ConfirmarCambio cambio={confirmacion} alCerrar={() => setConfirmacion(null)} />}
    </form>
  );
}
