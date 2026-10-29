"use client";
import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { avisar, cerrar, reemplazar } from "@/lib/avisos";
import type { MiConfiguracion } from "@/lib/tipos";
import { ConfirmarCambio, type CambioPendiente } from "./ConfirmarCambio";
import { CajaError } from "./ui";
import { fechaHoraCR } from "@/lib/formato";
import { ESTADO, EtiquetaEstado } from "./pagos/EstadoPago";
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

/** Un hito es un día que marca un cambio (marcador neutro, sin color de estado); un tramo es un estado real entre dos hitos. */
type Paso =
  | { tipo: "hito"; titulo: string; fecha: Date; frase: string }
  | { tipo: "tramo"; estado: EstadoVencimiento; etiqueta: string; espera?: boolean; rango: string; frase: string };

/** Reloj de arena del sistema de diseño (mismo trazo y tamaño que los íconos de estado). */
function IconoEspera() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M4 2h8M4 14h8M5 2v2.5L8 8l3-3.5V2M5 14v-2.5L8 8l3 3.5V14" />
    </svg>
  );
}

/** Un pago de ejemplo, con los dos valores escritos en los campos (no los guardados): hito, tramo, hito, tramo, en orden cronológico. */
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
    const pasos: Paso[] = [
      {
        tipo: "tramo",
        estado: "proyectado",
        etiqueta: "Programado",
        rango: `Hasta el ${fecha(sumarDias(inicio, -1))}`,
        frase: "Todavía falta tiempo: el pago está programado y no se avisa.",
      },
      {
        tipo: "hito",
        titulo: "Empieza el aviso",
        fecha: inicio,
        frase: aviso === 0 ? "No hay días de aviso: el aviso empieza el mismo día de pago." : `Desde este día el sistema le avisa del pago (${textoDias(aviso)} antes).`,
      },
      {
        tipo: "tramo",
        estado: "por_vencer",
        etiqueta: "Por vencer",
        rango: aviso === 0 ? `Solo el ${fecha(pago)}` : `Del ${fecha(inicio)} al ${fecha(pago)}`,
        frase: "El pago se acerca o es hoy. Si aparece en el estado de cuenta, pasa a Pagado.",
      },
      {
        tipo: "hito",
        titulo: "Día de pago",
        fecha: pago,
        frase: espera === 0 ? "Es la fecha habitual de pago. No hay días de espera: si el pago no aparece este día, al siguiente se marca Vencido." : "Es la fecha habitual de pago.",
      },
      ...(espera > 0
        ? ([
            {
              tipo: "tramo",
              estado: "por_vencer",
              etiqueta: "Por vencer, esperando el pago",
              espera: true,
              rango: espera === 1 ? `Solo el ${fecha(finEspera)}` : `Del ${fecha(sumarDias(pago, 1))} al ${fecha(finEspera)}`,
              frase: "La fecha de pago pasó y se espera que el pago aparezca. Sigue Por vencer.",
            },
            { tipo: "hito", titulo: "Fin de la espera", fecha: finEspera, frase: "Último día de espera. Si el pago no aparece, desde el día siguiente se marca Vencido." },
          ] as Paso[])
        : []),
      {
        tipo: "tramo",
        estado: "vencido",
        etiqueta: "Vencido",
        rango: `Desde el ${fecha(vence)}`,
        frase: "El pago no apareció en el tiempo de espera. Se sigue buscando por si llega.",
      },
    ];
    contenido = (
      <ol className="mt-4">
        {pasos.map((p, i) => {
          const ultimo = i === pasos.length - 1;
          const riel = `border-l-2 ${p.tipo === "tramo" && p.espera ? "border-dashed" : ""} border-divisor pl-5 ${ultimo ? "!border-transparent pb-0" : "pb-4"}`;
          if (p.tipo === "hito") {
            return (
              <li key={`h-${p.titulo}`} className={`relative ${riel}`}>
                <span aria-hidden="true" className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-texto bg-fondo" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.titulo}</span>
                  <span className="text-sm text-suave">{fecha(p.fecha)}</span>
                </div>
                <p className="mt-1 text-sm">{p.frase}</p>
              </li>
            );
          }
          return (
            <li key={`t-${p.etiqueta}`} className={riel}>
              <div className="flex flex-wrap items-center gap-2">
                {p.espera ? (
                  <span title={ESTADO.por_vencer.ayuda} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-texto px-3 py-1 text-xs font-bold ${ESTADO.por_vencer.clase}`}>
                    <IconoEspera />
                    {p.etiqueta}
                  </span>
                ) : (
                  <EtiquetaEstado estado={p.estado} texto={p.etiqueta} />
                )}
                <span className="text-sm text-suave">{p.rango}</span>
              </div>
              <p className="mt-1 text-sm">{p.frase}</p>
            </li>
          );
        })}
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
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,640px)_minmax(0,480px)]">
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
    <PanelEjemplo pago={pago} aviso={nAviso} espera={nEspera} />
    </div>
  );
}
