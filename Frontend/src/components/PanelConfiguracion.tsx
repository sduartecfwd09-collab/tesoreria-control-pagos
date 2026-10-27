"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import type { Parametro } from "@/lib/tipos";

type Mensaje = { tipo: "ok" | "error"; texto: string };

function FilaParametro({ p, alGuardar }: { p: Parametro; alGuardar: (p: Parametro, valor: string) => void }) {
  const [valor, setValor] = useState(p.valor);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<Mensaje | null>(null);
  const idCampo = `param-${p.id}`;
  const cambiado = valor !== p.valor;
  const rango = p.min !== null && p.max !== null ? `Valores permitidos: de ${p.min} a ${p.max}.` : "";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMsg(null);
    try {
      const r = await api.guardarParametro(p.id, valor);
      alGuardar(p, r.datos.valor);
      setValor(r.datos.valor);
      setMsg({ tipo: "ok", texto: "Guardado" });
    } catch (err) {
      setMsg({ tipo: "error", texto: err instanceof ErrorApi ? err.message : "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  }

  const control = "border-2 border-control bg-fondo rounded px-3 py-2 text-base";
  return (
    <form onSubmit={guardar} className="py-5 border-b border-divisor grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
      <div>
        <label htmlFor={idCampo} className="font-semibold">
          {p.categoria ? p.categoria : p.etiqueta}
        </label>
        <p id={`${idCampo}-ayuda`} className="mt-1 text-sm text-suave max-w-xl">
          {p.ayuda} {rango}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.opciones ? (
          <select
            id={idCampo}
            aria-describedby={`${idCampo}-ayuda`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={control}
          >
            {p.opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={idCampo}
            type="number"
            inputMode="numeric"
            step={1}
            min={p.min ?? undefined}
            max={p.max ?? undefined}
            aria-describedby={`${idCampo}-ayuda`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={`${control} w-24`}
          />
        )}
        {p.unidad && <span className="text-sm text-suave">{p.unidad}</span>}
        <button
          type="submit"
          disabled={!cambiado || guardando}
          className="bg-acento text-sobre-acento font-semibold rounded px-4 py-2 disabled:bg-fondo-suave disabled:text-suave disabled:border disabled:border-divisor disabled:cursor-not-allowed"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <span
          role="status"
          aria-live="polite"
          className={`text-sm w-full md:w-auto ${msg?.tipo === "error" ? "text-rojo font-medium" : "text-suave"}`}
        >
          {msg?.texto}
        </span>
      </div>
    </form>
  );
}

export function PanelConfiguracion() {
  const [datos, setDatos] = useState<Parametro[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    api
      .listarParametros()
      .then((d) => vigente && (setDatos(d), setError(null)))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : 'Error desconocido'));
    return () => {
      vigente = false;
    };
  }, [intento]);

  const alGuardar = useCallback((p: Parametro, valor: string) => {
    setDatos((d) => d && d.map((x) => (x.id === p.id ? { ...x, valor } : x)));
  }, []);

  const { globales, porCategoria } = useMemo(
    () => ({
      globales: (datos ?? []).filter((p) => p.ambito === "global"),
      porCategoria: (datos ?? []).filter((p) => p.ambito === "categoria"),
    }),
    [datos],
  );

  if (error)
    return (
      <div role="alert" className="mt-8 border-2 border-rojo bg-rojo-fondo text-rojo rounded p-4">
        <p className="font-semibold">{error}</p>
        <button onClick={() => setIntento((n) => n + 1)} className="mt-3 bg-acento text-sobre-acento font-semibold rounded px-4 py-2">
          Reintentar
        </button>
      </div>
    );
  if (!datos)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando parámetros…
      </p>
    );

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="h-reglas">
        <h2 id="h-reglas" className="text-lg font-bold border-b-2 border-acento pb-1">
          Reglas de cruce y avisos
        </h2>
        {globales.map((p) => (
          <FilaParametro key={p.id} p={p} alGuardar={alGuardar} />
        ))}
      </section>
      <section aria-labelledby="h-tol">
        <h2 id="h-tol" className="text-lg font-bold border-b-2 border-acento pb-1">
          Tolerancia de monto por categoría
        </h2>
        <p className="mt-2 text-sm text-suave max-w-2xl">
          Diferencia aceptada entre el monto esperado y el monto pagado, según la categoría.
        </p>
        {porCategoria.map((p) => (
          <FilaParametro key={p.id} p={p} alGuardar={alGuardar} />
        ))}
      </section>
    </div>
  );
}
