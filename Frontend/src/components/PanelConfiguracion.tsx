"use client";
import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import type { MiConfiguracion } from "@/lib/tipos";
import { ConfirmarCambio, type CambioPendiente } from "./ConfirmarCambio";
import { CajaError } from "./ui";
import { EtiquetaEstado } from "./pagos/EstadoPago";
import type { EstadoVencimiento } from "@/lib/tipos";

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
      <p className="mt-3 rounded border border-divisor bg-fondo-suave px-3 py-2 text-sm">
        <strong>Ejemplo:</strong> {ejemplo}
      </p>
    </div>
  );
}

interface Hito {
  titulo: string;
  fecha: Date;
  estado: EstadoVencimiento;
  etiqueta: string;
  frase: string;
}

/** Un pago de ejemplo, con los dos valores escritos en los campos (no los guardados), en orden cronológico. */
function PanelEjemplo({ pago, aviso, espera }: { pago: Date; aviso: number | null; espera: number | null }) {
  const invalidos = [aviso === null && "los días de aviso (de 0 a 60)", espera === null && "los días de espera (de 0 a 15)"].filter(Boolean);
  let contenido: React.ReactNode;
  if (aviso === null || espera === null) {
    contenido = (
      <p role="status" className="mt-4 rounded border border-divisor bg-fondo-suave px-3 py-2 text-sm">
        Escriba un número entero válido en {invalidos.join(" y en ")} para ver cómo se comportaría un pago.
      </p>
    );
  } else {
    const inicio = sumarDias(pago, -aviso);
    const finEspera = sumarDias(pago, espera);
    const vence = sumarDias(pago, espera + 1);
    const hitos: Hito[] = [
      {
        titulo: "Empieza el aviso",
        fecha: inicio,
        estado: "por_vencer",
        etiqueta: "Por vencer",
        frase:
          aviso === 0
            ? "No hay días de aviso: el pago sigue Programado hasta el mismo día de pago."
            : `Del ${fecha(inicio)} al ${fecha(pago)}: Por vencer. Antes del ${fecha(inicio)} el pago sigue Programado.`,
      },
      {
        titulo: "Día de pago",
        fecha: pago,
        estado: "por_vencer",
        etiqueta: "Día de pago",
        frase: "Es la fecha habitual de pago. Si el pago aparece en el estado de cuenta, pasa a Pagado.",
      },
      {
        titulo: "Fin de la espera",
        fecha: finEspera,
        estado: "por_vencer",
        etiqueta: "En espera",
        frase:
          espera === 0
            ? "No hay días de espera: si el pago no aparece el día de pago, se marca Vencido al día siguiente."
            : `Del ${fecha(sumarDias(pago, 1))} al ${fecha(finEspera)}: se espera el pago, sigue Por vencer.`,
      },
      {
        titulo: "Pasa a Vencido",
        fecha: vence,
        estado: "vencido",
        etiqueta: "Vencido",
        frase: `Desde el ${fecha(vence)}: Vencido, si el pago no aparece.`,
      },
    ];
    contenido = (
      <ol className="mt-4">
        {hitos.map((h, i) => (
          <li key={h.titulo} className={`border-l-2 border-divisor pb-5 pl-4 ${i === hitos.length - 1 ? "!border-transparent pb-0" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{h.titulo}</span>
              <span className="text-sm text-suave">{fecha(h.fecha)}</span>
              <EtiquetaEstado estado={h.estado} texto={h.etiqueta} />
            </div>
            <p className="mt-1 text-sm">{h.frase}</p>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <aside aria-labelledby="h-ejemplo" className="rounded-[14px] border border-divisor bg-fondo p-5">
      <h2 id="h-ejemplo" className="text-lg font-bold border-b-2 border-acento pb-1">
        Así funcionará con sus valores
      </h2>
      <p className="mt-2 text-sm text-suave">
        Ejemplo con un pago cuyo día de pago es el {fecha(pago)}. Se actualiza mientras escribe, antes de guardar.
      </p>
      {contenido}
    </aside>
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
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,640px)_minmax(0,480px)]">
    <form onSubmit={guardar} noValidate>
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
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!cambiado}
          className="rounded bg-acento px-6 py-2.5 font-bold text-sobre-acento disabled:cursor-not-allowed disabled:opacity-40"
        >
          Guardar
        </button>
        <span role="status" aria-live="polite" className="text-sm text-suave">
          {!cambiado ? ok ?? "Cambie algún valor para guardar" : ""}
        </span>
      </div>
      {confirmacion && <ConfirmarCambio cambio={confirmacion} alCerrar={() => setConfirmacion(null)} />}
    </form>
    <PanelEjemplo pago={pago} aviso={nAviso} espera={nEspera} />
    </div>
  );
}
