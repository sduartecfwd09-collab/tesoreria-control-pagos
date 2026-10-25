"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { ErrorApi } from "@/lib/api";
import { aCentavos, aTextoMonto, FRECUENCIAS, MESES, MESES_CORTOS, mesesQueVence, NOMBRE_MONEDA, SIMBOLO } from "@/lib/formato";
import type { CambiosObligacion, Categoria, Cuenta, Frecuencia, Moneda, Obligacion, Sociedad } from "@/lib/tipos";
import { Campo, claseBoton, claseBotonSecundario, claseControl, describir, Etiqueta } from "../ui";

const MONTO_MAXIMO = 2_147_483_647; // centavos (límite actual del Backend)

interface Valores {
  sociedad: string;
  categoriaId: string;
  proveedor: string;
  identificador: string;
  diaEsperadoPago: string;
  frecuencia: Frecuencia;
  frecuenciaConfirmada: boolean;
  mesArranque: string;
  moneda: Moneda;
  monedaConfirmada: boolean;
  monto: string;
  cuentaEsperadaId: string;
  responsable: string;
  activa: boolean;
}

// Campo del Backend -> campo del formulario (para mostrar el error junto al control correcto).
const CAMPO_FORMULARIO: Record<string, FieldPath<Valores>> = {
  montoEsperado: "monto",
  frecuenciaPorConfirmar: "frecuenciaConfirmada",
  monedaPorConfirmar: "monedaConfirmada",
};

function valoresIniciales(o: Obligacion | null, frecuenciaDefecto: Frecuencia): Valores {
  return {
    sociedad: o?.sociedad ?? "",
    categoriaId: o ? String(o.categoriaId) : "",
    proveedor: o?.proveedor ?? "",
    identificador: o?.identificador ?? "",
    diaEsperadoPago: o?.diaEsperadoPago != null ? String(o.diaEsperadoPago) : "",
    frecuencia: o?.frecuencia ?? frecuenciaDefecto,
    frecuenciaConfirmada: o ? !o.frecuenciaPorConfirmar : false,
    mesArranque: o?.mesArranque != null ? String(o.mesArranque) : "",
    moneda: o?.moneda ?? "CRC",
    monedaConfirmada: o ? !o.monedaPorConfirmar : false,
    monto: aTextoMonto(o?.montoEsperado ?? null),
    cuentaEsperadaId: o?.cuentaEsperada ? String(o.cuentaEsperada.id) : "",
    responsable: o?.responsable ?? "",
    activa: o?.activa ?? true,
  };
}

/** Convierte los valores del formulario al formato del API. En edición solo los campos que cambiaron. */
function aCambios(v: Valores, sucios: Partial<Record<keyof Valores, unknown>> | null): CambiosObligacion {
  const incluir = (k: keyof Valores) => sucios === null || !!sucios[k];
  const c: CambiosObligacion = {};
  if (sucios === null) {
    c.sociedad = v.sociedad;
    c.categoriaId = Number(v.categoriaId);
    c.proveedor = v.proveedor;
    c.identificador = v.identificador;
  }
  if (incluir("diaEsperadoPago")) c.diaEsperadoPago = v.diaEsperadoPago === "" ? null : Number(v.diaEsperadoPago);
  if (incluir("frecuencia")) c.frecuencia = v.frecuencia;
  if (incluir("frecuenciaConfirmada")) c.frecuenciaPorConfirmar = !v.frecuenciaConfirmada;
  if (v.frecuencia !== "mensual" && (incluir("mesArranque") || incluir("frecuencia"))) c.mesArranque = v.mesArranque === "" ? null : Number(v.mesArranque);
  if (incluir("moneda")) c.moneda = v.moneda;
  if (incluir("monedaConfirmada")) c.monedaPorConfirmar = !v.monedaConfirmada;
  if (incluir("monto")) c.montoEsperado = aCentavos(v.monto) ?? null;
  if (incluir("cuentaEsperadaId")) c.cuentaEsperadaId = v.cuentaEsperadaId === "" ? null : Number(v.cuentaEsperadaId);
  if (incluir("responsable")) c.responsable = v.responsable.trim() === "" ? null : v.responsable;
  if (incluir("activa")) c.activa = v.activa;
  return c;
}

export function FormularioObligacion({
  obligacion, sociedades, categorias, cuentas, frecuenciaDefecto, alGuardar, alCerrar,
}: {
  obligacion: Obligacion | null; // null = nueva
  sociedades: Sociedad[];
  categorias: Categoria[];
  cuentas: Cuenta[];
  frecuenciaDefecto: Frecuencia;
  alGuardar: (c: CambiosObligacion) => Promise<void>;
  alCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const nueva = obligacion === null;
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const { register, handleSubmit, control, setError, formState } = useForm<Valores>({
    defaultValues: valoresIniciales(obligacion, frecuenciaDefecto),
    mode: "onBlur",
  });
  const { errors, dirtyFields, isDirty, isSubmitting } = formState;

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  // useWatch (y no watch) para que el React Compiler pueda optimizar el componente.
  const [frecuencia, mesArranque, moneda, sociedad] = useWatch({ control, name: ["frecuencia", "mesArranque", "moneda", "sociedad"] });
  const cuentasSociedad = useMemo(() => cuentas.filter((c) => c.sociedad === sociedad), [cuentas, sociedad]);
  const vence = mesesQueVence(frecuencia, mesArranque === "" ? null : Number(mesArranque));

  async function enviar(v: Valores) {
    setErrorGeneral(null);
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
  const avisos = obligacion?.etiquetas.filter((e) => e.codigo !== "falta_responsable") ?? [];

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
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
          <button type="button" onClick={() => dialogo.current?.close()} className={claseBotonSecundario} aria-label="Cerrar sin guardar">
            Cerrar
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {avisos.length > 0 && (
            <section aria-label="Avisos de esta obligación" className="rounded border border-divisor bg-fondo-suave p-4">
              <h3 className="font-semibold">Revise antes de guardar</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {avisos.map((a) => (
                  <li key={a.codigo}>
                    <Etiqueta tono={a.codigo === "falta_dia" || a.codigo === "falta_mes_arranque" ? "rojo" : a.codigo.startsWith("falta") ? "suave" : "ambar"}>{a.texto}</Etiqueta>{" "}
                    {a.ayuda}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nueva ? (
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-lg font-bold">Datos de la obligación</legend>
              <Campo id="f-sociedad" etiqueta="Sociedad" error={errors.sociedad?.message}>
                <select id="f-sociedad" className={`${claseControl} w-full`} aria-describedby={desc("sociedad", false)} {...register("sociedad", { required: "Elija la sociedad" })}>
                  <option value="">Elija una sociedad…</option>
                  {sociedades.map((s) => (
                    <option key={s.id} value={s.codigo}>{s.codigo}</option>
                  ))}
                </select>
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
            <Campo
              id="f-frecuencia"
              etiqueta="Frecuencia"
              extra={obligacion?.frecuenciaPorConfirmar && <span className="ml-2 align-middle"><Etiqueta tono="ambar">Por confirmar con Tesorería</Etiqueta></span>}
              ayuda="Cada cuánto se paga. La tabla de pagos no trae este dato: se supuso mensual."
              error={errors.frecuencia?.message}
            >
              <select id="f-frecuencia" className={`${claseControl} w-full`} aria-describedby={desc("frecuencia")} {...register("frecuencia")}>
                {FRECUENCIAS.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.texto}</option>
                ))}
              </select>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" {...register("frecuenciaConfirmada")} />
                Confirmada con Tesorería
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
                <select id="f-mesArranque" className={`${claseControl} w-full`} aria-describedby={desc("mesArranque")} {...register("mesArranque")}>
                  <option value="">Sin definir</option>
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>{m[0]!.toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </Campo>
            )}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-lg font-bold">Cuánto y desde dónde</legend>
            <Campo
              id="f-moneda"
              etiqueta="Moneda"
              extra={obligacion?.monedaPorConfirmar && <span className="ml-2 align-middle"><Etiqueta tono="ambar">Por confirmar con Tesorería</Etiqueta></span>}
              ayuda="La tabla de pagos no trae la moneda: se supuso colones."
              error={errors.moneda?.message}
            >
              <select id="f-moneda" className={`${claseControl} w-full`} aria-describedby={desc("moneda")} {...register("moneda")}>
                {(["CRC", "USD"] as const).map((m) => (
                  <option key={m} value={m}>{NOMBRE_MONEDA[m]}</option>
                ))}
              </select>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" {...register("monedaConfirmada")} />
                Confirmada con Tesorería
              </label>
            </Campo>
            <Campo
              id="f-monto"
              etiqueta={`Monto esperado (${SIMBOLO[moneda]})`}
              ayuda="Opcional. Solo números, con hasta 2 decimales (p. ej. 15000 o 15000,50). En el piloto el monto no se valida contra el pago."
              error={errors.monto?.message}
            >
              <input
                id="f-monto"
                inputMode="decimal"
                placeholder="Sin definir"
                className={`${claseControl} w-full`}
                aria-describedby={desc("monto")}
                {...register("monto", {
                  validate: (v) => {
                    const c = aCentavos(v);
                    if (c === undefined) return "Escriba solo números, con hasta 2 decimales (p. ej. 15000 o 15000,50)";
                    if (c !== null && c > MONTO_MAXIMO) return "El monto supera el máximo admitido (21 474 836,47)";
                    return true;
                  },
                })}
              />
            </Campo>
            <Campo
              id="f-cuentaEsperadaId"
              etiqueta="Cuenta de pago esperada"
              ayuda={sociedad && cuentasSociedad.length === 0 ? "Esta sociedad aún no tiene cuentas importadas. Es opcional." : "Opcional. Cuenta bancaria de la sociedad desde la que se paga."}
              error={errors.cuentaEsperadaId?.message}
            >
              <select id="f-cuentaEsperadaId" className={`${claseControl} w-full`} aria-describedby={desc("cuentaEsperadaId")} {...register("cuentaEsperadaId")}>
                <option value="">Sin definir</option>
                {cuentasSociedad.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero}
                    {c.banco ? ` · ${c.banco}` : ""}
                    {c.moneda ? ` · ${c.moneda}` : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="f-responsable" etiqueta="Responsable" ayuda="Opcional. Persona de Tesorería a cargo; en el piloto todos ven todo." error={errors.responsable?.message}>
              <input id="f-responsable" className={`${claseControl} w-full`} placeholder="Sin asignar" aria-describedby={desc("responsable")} {...register("responsable", { maxLength: { value: 80, message: "Máximo 80 caracteres" } })} />
            </Campo>
          </fieldset>

          <div className="rounded border border-divisor p-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" className="h-5 w-5" {...register("activa")} />
              Obligación activa
            </label>
            <p className="mt-1 text-sm text-suave">
              Nada se borra: si ya no se paga, desmarque esta casilla. Deja de generar vencimientos futuros y se conserva su historial.
            </p>
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
          <button type="button" onClick={() => dialogo.current?.close()} className={claseBotonSecundario}>
            Cancelar
          </button>
          {!nueva && !isDirty && <span className="text-sm text-suave">Cambie algún dato para poder guardar.</span>}
        </div>
      </form>
    </dialog>
  );
}
