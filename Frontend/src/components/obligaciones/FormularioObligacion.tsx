"use client";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { api, ErrorApi } from "@/lib/api";
import { FRECUENCIAS, limitesDeDesdeMes, MESES, MESES_CORTOS, mesCorto, mesesQueVence, NOMBRE_FRECUENCIA, periodoActual, textoDiaProgramado } from "@/lib/formato";
import type { CambiosObligacion, Categoria, Frecuencia, Obligacion, Sociedad } from "@/lib/tipos";
import { ConfirmarCambio, ConfirmarSalida, type CambioPendiente } from "../ConfirmarCambio";
import { Campo, claseBoton, claseBotonSecundario, claseControl, describir } from "../ui";
import { SelectorMes } from "../SelectorFechas";
import { SelectorSociedad } from "../SelectorSociedad";

/** Texto del antes o el después de los campos que cambiaron, una línea por campo, para la confirmación. */
function lineasCambio(v: Valores, sucios: Partial<Record<keyof Valores, unknown>>): string {
  const l: string[] = [];
  if (sucios.diaEsperadoPago) l.push(`Día de pago: ${v.diaEsperadoPago || "Sin día"}`);
  if (sucios.frecuencia || sucios.mesArranque) {
    const mes = v.frecuencia !== "mensual" && v.mesArranque !== "" ? `, desde ${MESES[Number(v.mesArranque) - 1]}` : "";
    l.push(`Frecuencia: ${NOMBRE_FRECUENCIA[v.frecuencia]}${mes}`);
  }
  if (sucios.frecuenciaConfirmada) l.push(`Frecuencia: ${v.frecuenciaConfirmada ? "confirmada" : "sin confirmar"}`);
  if (sucios.activa) l.push(`Estado: ${v.activa ? "Activa" : "Inactiva"}`);
  return l.join("\n");
}

interface Valores {
  sociedad: string;
  categoriaId: string;
  proveedor: string;
  identificador: string;
  diaEsperadoPago: string;
  frecuencia: Frecuencia;
  frecuenciaConfirmada: boolean;
  mesArranque: string;
  activa: boolean;
  /** Solo se pide (y se envía) cuando se cambia «Obligación activa». */
  motivo: string;
}

// Campo del Backend -> campo del formulario (para mostrar el error junto al control correcto).
const CAMPO_FORMULARIO: Record<string, FieldPath<Valores>> = {
  sociedadId: "sociedad",
  frecuenciaPorConfirmar: "frecuenciaConfirmada",
};

function valoresIniciales(o: Obligacion | null, frecuenciaDefecto: Frecuencia): Valores {
  return {
    sociedad: o ? String(o.sociedadId) : "", // identificador de la sociedad
    categoriaId: o ? String(o.categoriaId) : "",
    proveedor: o?.proveedor ?? "",
    identificador: o?.identificador ?? "",
    diaEsperadoPago: o?.diaEsperadoPago != null ? String(o.diaEsperadoPago) : "",
    frecuencia: o?.frecuencia ?? frecuenciaDefecto,
    frecuenciaConfirmada: o ? !o.frecuenciaPorConfirmar : false,
    mesArranque: o?.mesArranque != null ? String(o.mesArranque) : "",
    activa: o?.activa ?? true,
    motivo: "",
  };
}

/** Convierte los valores del formulario al formato del API. En edición solo los campos que cambiaron. */
function aCambios(v: Valores, sucios: Partial<Record<keyof Valores, unknown>> | null, sinDia = false): CambiosObligacion {
  const incluir = (k: keyof Valores) => sucios === null || !!sucios[k];
  const c: CambiosObligacion = {};
  if (sucios === null) {
    c.sociedadId = Number(v.sociedad);
    c.categoriaId = Number(v.categoriaId);
    c.proveedor = v.proveedor;
    c.identificador = v.identificador;
  }
  if (!sinDia && incluir("diaEsperadoPago")) c.diaEsperadoPago = v.diaEsperadoPago === "" ? null : Number(v.diaEsperadoPago);
  if (incluir("frecuencia")) c.frecuencia = v.frecuencia;
  if (incluir("frecuenciaConfirmada")) c.frecuenciaPorConfirmar = !v.frecuenciaConfirmada;
  // Mensual no usa mes de arranque: se limpia. Las demás frecuencias lo exigen (el formulario lo valida).
  if (incluir("mesArranque") || incluir("frecuencia")) c.mesArranque = v.frecuencia === "mensual" || v.mesArranque === "" ? null : Number(v.mesArranque);
  if (incluir("activa")) {
    c.activa = v.activa;
    if (sucios !== null) c.motivo = v.motivo.trim(); // solo en edición: el servidor lo exige al cambiar «activa»
  }
  return c;
}

export function FormularioObligacion({
  obligacion, sociedades, categorias, frecuenciaDefecto, alGuardar, alCambiarDia, alCerrar,
}: {
  obligacion: Obligacion | null; // null = nueva
  sociedades: Sociedad[];
  categorias: Categoria[];
  frecuenciaDefecto: Frecuencia;
  alGuardar: (c: CambiosObligacion) => Promise<void>;
  /** el cambio permanente del día se guardó; recibe la obligación para avisar y actualizar la lista */
  alCambiarDia: (o: Obligacion) => void;
  alCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const nueva = obligacion === null;
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<CambioPendiente | null>(null);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  // cambio permanente del día: desde qué mes rige, por qué y, si el servidor lo pide, si también aplica al mes en curso
  const mesActual = periodoActual();
  const [desdeMes, setDesdeMes] = useState(mesActual);
  const [motivoDia, setMotivoDia] = useState("");
  const [preguntaMes, setPreguntaMes] = useState(false);
  const [aplicaMes, setAplicaMes] = useState<boolean | null>(null);
  const [erroresDia, setErroresDia] = useState<{ motivo?: string; pregunta?: string }>({});
  const { register, handleSubmit, control, setError, formState } = useForm<Valores>({
    defaultValues: valoresIniciales(obligacion, frecuenciaDefecto),
    mode: "onBlur",
  });
  const { errors, dirtyFields, isDirty, isSubmitting } = formState;

  // Cerrar con cambios sin guardar pide confirmación (botón de cerrar, Cancelar y Escape).
  const intentarCerrar = () => (isDirty ? setConfirmandoSalida(true) : dialogo.current?.close());

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  // useWatch (y no watch) para que el React Compiler pueda optimizar el componente.
  const [frecuencia, mesArranque, activa, diaEscrito] = useWatch({ control, name: ["frecuencia", "mesArranque", "activa", "diaEsperadoPago"] });
  // cambiar un día que ya estaba definido es un cambio permanente: pide desde qué mes y por qué (indicar el día por primera vez, no)
  const cambiaDia = !nueva && obligacion.diaEsperadoPago !== null && /^\d+$/.test(diaEscrito) && Number(diaEscrito) !== obligacion.diaEsperadoPago;
  // el motivo aparece solo cuando se cambia el interruptor «Obligación activa» respecto a lo guardado
  const cambiaActiva = !nueva && activa !== obligacion.activa;
  const vence = mesesQueVence(frecuencia, mesArranque === "" ? null : Number(mesArranque));

  async function enviar(v: Valores) {
    setErrorGeneral(null);
    if (!nueva) {
      // Desactivar o reactivar pide el motivo antes de confirmar (el servidor también lo exige).
      if (v.activa !== obligacion.activa) {
        const m = v.motivo.trim();
        if (m.length < 3 || m.length > 300) return setError("motivo", { message: "Escriba el motivo (entre 3 y 300 caracteres)" }, { shouldFocus: true });
      }
      // Un nuevo día de pago exige el mes desde el que rige, el motivo y, si el servidor lo pide, la respuesta sobre el mes en curso.
      if (cambiaDia) {
        const e: typeof erroresDia = {};
        const m = motivoDia.trim();
        if (m.length < 3 || m.length > 300) e.motivo = "Indique el motivo (entre 3 y 300 caracteres)";
        if (preguntaMes && aplicaMes === null) e.pregunta = "Elija una opción";
        setErroresDia(e);
        if (e.motivo || e.pregunta) return;
      }
      // Toda edición manual pide confirmación con el valor de antes y el de después.
      const antes = valoresIniciales(obligacion, frecuenciaDefecto);
      const sucios = dirtyFields;
      const lineasAntes = lineasCambio(antes, sucios);
      const lineasDespues = lineasCambio(v, sucios);
      setConfirmacion({
        titulo: `Guardar los cambios de ${obligacion.proveedor} (${obligacion.sociedad})`,
        antes: lineasAntes,
        despues: cambiaDia ? lineasDespues.replace(/^(Día de pago: \d+)/m, `$1 desde ${mesCorto(desdeMes)}`) : lineasDespues,
        ejecutar: async () => {
          const resto = aCambios(v, sucios, cambiaDia);
          const hayResto = Object.keys(resto).length > 0;
          if (cambiaDia) {
            try {
              await api.cambiarDia(obligacion.id, { nuevoDia: Number(v.diaEsperadoPago), desdeMes, ...(aplicaMes === null ? {} : { aplicaAlMesEnCurso: aplicaMes }), motivo: motivoDia.trim() });
            } catch (err) {
              // el pago de este mes sigue pendiente: se cierra la confirmación y se muestra la pregunta (antes de guardar nada más)
              if (err instanceof ErrorApi && err.campo === "aplicaAlMesEnCurso") return setPreguntaMes(true);
              throw err;
            }
          }
          if (hayResto) await alGuardar(resto);
          else alCambiarDia(obligacion);
        },
      });
      return;
    }
    try {
      await alGuardar(aCambios(v, nueva ? null : dirtyFields));
    } catch (e) {
      if (e instanceof ErrorApi && e.campo) {
        const campo = CAMPO_FORMULARIO[e.campo] ?? (e.campo as FieldPath<Valores>);
        if (campo in valoresIniciales(null, "mensual")) return setError(campo, { message: e.message }, { shouldFocus: true });
      }
      setErrorGeneral(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  const desc = (id: keyof Valores, ayuda = true) => describir(`f-${id}`, ayuda, !!errors[id]);

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      onCancel={(e) => isDirty && (e.preventDefault(), setConfirmandoSalida(true))}
      aria-labelledby="titulo-formulario"
      className="m-auto w-[min(48rem,calc(100%-2rem))] max-h-[calc(100%-2rem)] rounded border-2 border-control bg-fondo p-0 text-texto backdrop:bg-black/50"
    >
      <form onSubmit={handleSubmit(enviar)} noValidate>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b-4 border-acento bg-fondo px-6 py-4">
          <div>
            <h2 id="titulo-formulario" className="text-xl font-bold">
              {nueva ? "Nueva obligación" : `Editar ${obligacion.proveedor}`}
            </h2>
            {!nueva && (
              <p className="text-sm text-suave">
                {obligacion.sociedad} · {obligacion.categoria} · <span className="font-mono">{obligacion.identificador}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={intentarCerrar} className={claseBotonSecundario} aria-label="Cerrar sin guardar">
            Cerrar
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {nueva ? (
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-lg font-bold">Datos de la obligación</legend>
              <Campo id="f-sociedad" etiqueta="Sociedad" error={errors.sociedad?.message}>
                <Controller
                  name="sociedad"
                  control={control}
                  rules={{ required: "Elija la sociedad" }}
                  render={({ field }) => (
                    <SelectorSociedad
                      id="f-sociedad"
                      opciones={sociedades.map((s) => ({ valor: String(s.id), nombre: s.nombreLargo }))}
                      valor={field.value}
                      alCambiar={field.onChange}
                      alPerderFoco={field.onBlur}
                      describedBy={desc("sociedad", false)}
                      invalido={!!errors.sociedad}
                    />
                  )}
                />
              </Campo>
              <Campo id="f-categoriaId" etiqueta="Categoría" error={errors.categoriaId?.message}>
                <select id="f-categoriaId" className={`${claseControl} w-full`} aria-describedby={desc("categoriaId", false)} {...register("categoriaId", { required: "Elija la categoría" })}>
                  <option value="">Elija una categoría…</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </Campo>
              <Campo id="f-proveedor" etiqueta="Proveedor" ayuda="Nombre de la empresa a la que se paga (p. ej. CNFL)." error={errors.proveedor?.message}>
                <input id="f-proveedor" className={`${claseControl} w-full`} aria-describedby={desc("proveedor")} {...register("proveedor", { required: "Escriba el proveedor", maxLength: { value: 80, message: "Máximo 80 caracteres" } })} />
              </Campo>
              <Campo id="f-identificador" etiqueta="NISE / cuenta / identificador" ayuda="Número del servicio tal como aparece en el recibo. Se guarda como texto: conserva los ceros a la izquierda." error={errors.identificador?.message}>
                <input id="f-identificador" className={`${claseControl} w-full font-mono`} aria-describedby={desc("identificador")} {...register("identificador", { required: "Escriba el identificador", maxLength: { value: 40, message: "Máximo 40 caracteres" } })} />
              </Campo>
            </fieldset>
          ) : (
            <p className="text-sm text-suave">
              La sociedad, el proveedor y el identificador vienen de la tabla de pagos y no se editan aquí. Si están mal, desactive esta obligación y cree una nueva.
            </p>
          )}

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-lg font-bold">Cuándo se paga</legend>
            <Campo
              id="f-diaEsperadoPago"
              etiqueta="Día esperado de pago"
              ayuda="Día del mes (1 a 31). Si el mes no tiene ese día, se usa el último día del mes (p. ej. el 31 pasa al 28 de febrero)."
              error={errors.diaEsperadoPago?.message}
            >
              <input
                id="f-diaEsperadoPago"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                className={`${claseControl} w-28`}
                aria-describedby={desc("diaEsperadoPago")}
                {...register("diaEsperadoPago", {
                  validate: (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 31) || "Escriba un número entero de 1 a 31",
                })}
              />
            </Campo>
            {!nueva && obligacion.diaProgramado && <p className="text-sm font-semibold sm:col-span-2">{textoDiaProgramado(obligacion.diaProgramado)}</p>}
            {cambiaDia && (
              <div className="rounded border border-divisor p-4 sm:col-span-2">
                <h3 className="font-bold">Cambio del día de pago</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <span id="f-desdeMes-etiqueta" className="font-semibold">Desde el mes</span>
                    <div className="mt-1 flex">
                      <SelectorMes valor={desdeMes} alCambiar={(m) => (setDesdeMes(m), setPreguntaMes(false), setAplicaMes(null))} limites={limitesDeDesdeMes(mesActual)} />
                    </div>
                    <p className="mt-1 text-sm text-suave">Los meses anteriores no cambian.</p>
                  </div>
                  <Campo id="f-motivoDia" etiqueta="Motivo" error={erroresDia.motivo}>
                    <input id="f-motivoDia" value={motivoDia} onChange={(e) => setMotivoDia(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-invalid={erroresDia.motivo ? true : undefined} aria-describedby={erroresDia.motivo ? "f-motivoDia-error" : undefined} />
                  </Campo>
                </div>
                {preguntaMes && (
                  <fieldset className="mt-4" aria-describedby={erroresDia.pregunta ? "f-pregunta-error" : undefined}>
                    <legend className="font-semibold">Este mes todavía hay un pago pendiente. ¿El nuevo día también aplica a este mes?</legend>
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input type="radio" name="aplicaMes" className="h-4 w-4" checked={aplicaMes === true} onChange={() => setAplicaMes(true)} />
                      Sí, también este mes
                    </label>
                    <label className="mt-1 flex items-center gap-2 text-sm">
                      <input type="radio" name="aplicaMes" className="h-4 w-4" checked={aplicaMes === false} onChange={() => setAplicaMes(false)} />
                      No, solo desde el mes elegido
                    </label>
                    {erroresDia.pregunta && <p id="f-pregunta-error" role="alert" className="mt-1 text-sm font-medium text-rojo">{erroresDia.pregunta}</p>}
                  </fieldset>
                )}
              </div>
            )}
            <Campo
              id="f-frecuencia"
              etiqueta="Frecuencia de pago de esta obligación"
              ayuda="Cada cuánto se paga. Si no es mensual, indique el mes de arranque."
              error={errors.frecuencia?.message}
            >
              <select id="f-frecuencia" className={`${claseControl} w-full`} aria-describedby={desc("frecuencia")} {...register("frecuencia")}>
                {FRECUENCIAS.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.texto}</option>
                ))}
              </select>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" {...register("frecuenciaConfirmada")} />
                Frecuencia confirmada
              </label>
            </Campo>
            {frecuencia !== "mensual" && (
              <Campo
                id="f-mesArranque"
                etiqueta="Mes de arranque"
                ayuda={
                  vence.length > 0 ? (
                    <>Mes del primer pago del ciclo. Vence en: <strong>{vence.map((m) => MESES_CORTOS[m - 1]).join(", ")}</strong>.</>
                  ) : (
                    <>Mes del primer pago del ciclo. <strong>Sin este dato no se generan sus vencimientos.</strong></>
                  )
                }
                error={errors.mesArranque?.message}
              >
                <select id="f-mesArranque" className={`${claseControl} w-full`} aria-describedby={desc("mesArranque")} {...register("mesArranque", { validate: (v) => v !== "" || "Indique el mes de arranque: sin él no se generan los vencimientos" })}>
                  <option value="">Sin definir</option>
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>{m[0]!.toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </Campo>
            )}
          </fieldset>

          <div className="rounded border border-divisor p-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" className="h-5 w-5" {...register("activa")} />
              Obligación activa
            </label>
            <p className="mt-1 text-sm text-suave">
              Nada se borra: si ya no se paga, desmarque esta casilla. Deja de generar vencimientos futuros y se conserva su historial.
            </p>
            {cambiaActiva && (
              <div className="mt-3">
                <Campo id="f-motivo" etiqueta="Motivo" error={errors.motivo?.message}>
                  <input
                    id="f-motivo"
                    className={`${claseControl} w-full`}
                    maxLength={300}
                    aria-describedby={desc("motivo", false)}
                    {...register("motivo")}
                  />
                </Campo>
              </div>
            )}
          </div>

          {errorGeneral && (
            <p role="alert" className="rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">
              {errorGeneral}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-divisor bg-fondo px-6 py-4">
          <button type="submit" className={claseBoton} disabled={isSubmitting || (!nueva && !isDirty)}>
            {isSubmitting ? "Guardando…" : nueva ? "Crear obligación" : "Guardar cambios"}
          </button>
          <button type="button" onClick={intentarCerrar} className={claseBotonSecundario}>
            Cancelar
          </button>
        </div>
      </form>
      {confirmacion && <ConfirmarCambio cambio={confirmacion} alCerrar={() => setConfirmacion(null)} />}
      {confirmandoSalida && <ConfirmarSalida alSalir={() => (setConfirmandoSalida(false), dialogo.current?.close())} alSeguir={() => setConfirmandoSalida(false)} />}
    </dialog>
  );
}
