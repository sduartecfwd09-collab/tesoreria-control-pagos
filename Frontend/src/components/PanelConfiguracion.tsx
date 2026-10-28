"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AvisoTesorero, Parametro } from "@/lib/tipos";
import { ConfirmarCambio, type CambioPendiente } from "./ConfirmarCambio";

type Mensaje = { tipo: "ok" | "error"; texto: string };

function FilaParametro({ p, alGuardar, pedirConfirmacion }: { p: Parametro; alGuardar: (p: Parametro, valor: string) => void; pedirConfirmacion: (c: CambioPendiente) => void }) {
  const [valor, setValor] = useState(p.valor);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<Mensaje | null>(null);
  const idCampo = `param-${p.id}`;
  const cambiado = valor !== p.valor;
  const rango = p.min !== null && p.max !== null ? `Valores permitidos: de ${p.min} a ${p.max}.` : "";

  const unidad = p.unidad ? ` ${p.unidad}` : "";

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    pedirConfirmacion({
      titulo: `Cambiar «${p.categoria ? p.categoria : p.etiqueta}»`,
      antes: `${p.valor}${unidad}`,
      despues: `${valor}${unidad}`,
      ejecutar: async () => {
        setGuardando(true);
        try {
          const r = await api.guardarParametro(p.id, valor);
          alGuardar(p, r.datos.valor);
          setValor(r.datos.valor);
          setMsg({ tipo: "ok", texto: "Guardado" });
        } finally {
          setGuardando(false);
        }
      },
    });
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
        {p.ejemplo && (
          <p className="mt-2 max-w-xl rounded border border-divisor bg-fondo-suave px-3 py-2 text-sm">
            <strong>Ejemplo:</strong> {p.ejemplo}
          </p>
        )}
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
                {o === "si" ? "Sí" : o === "no" ? "No" : o}
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

const textoDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

function FilaAviso({ t, general, pedirConfirmacion, alGuardar }: { t: AvisoTesorero; general: number; pedirConfirmacion: (c: CambioPendiente) => void; alGuardar: (t: AvisoTesorero) => void }) {
  const inicial = t.diasAviso === null ? "" : String(t.diasAviso);
  const [valor, setValor] = useState(inicial);
  const cambiado = valor.trim() !== inicial;
  const propio = (v: string) => (v.trim() === "" ? `Usa el general (${textoDias(general)})` : textoDias(Number(v)));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const nuevo = valor.trim() === "" ? null : Number(valor);
    if (nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0 || nuevo > 60)) {
      pedirConfirmacion({
        titulo: `Avisos de ${t.nombre}`,
        antes: propio(inicial),
        despues: valor,
        ejecutar: async () => {
          throw new Error("Indique un número entero de días entre 0 y 60, o déjelo vacío para usar el general.");
        },
      });
      return;
    }
    pedirConfirmacion({
      titulo: `Cambiar los días de aviso de ${t.nombre}`,
      antes: propio(inicial),
      despues: propio(valor),
      ejecutar: async () => {
        const r = await api.guardarAvisoTesorero(t.id, nuevo);
        alGuardar({ ...t, diasAviso: r.datos.diasAviso, diasEfectivos: r.datos.diasEfectivos });
      },
    });
  }

  const efectivos = t.diasAviso === null ? general : t.diasAviso;
  return (
    <tr>
      <td className="px-3 py-2 align-middle">
        <span className="font-medium">{t.nombre}</span>
        <span className="block text-xs text-suave">{t.rol}</span>
      </td>
      <td className="px-3 py-2 align-middle">
        <form onSubmit={guardar} className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            step={1}
            aria-label={`Días de aviso propios de ${t.nombre}`}
            placeholder={`General (${general})`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="border-2 border-control bg-fondo rounded px-3 py-1 text-base w-32"
          />
          <button
            type="submit"
            disabled={!cambiado}
            className="bg-acento text-sobre-acento font-semibold rounded px-3 py-1 disabled:bg-fondo-suave disabled:text-suave disabled:border disabled:border-divisor disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        </form>
        {t.diasAviso === null && <span className="mt-1 block text-xs text-suave">Usa el general ({textoDias(general)})</span>}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">{textoDias(efectivos)}</td>
    </tr>
  );
}

// Tabla de avisos por tesorero. Hoy la edita cualquiera; cuando exista el inicio de sesión, solo Jefatura y cada tesorero el suyo.
function AvisosPorTesorero({ pedirConfirmacion }: { pedirConfirmacion: (c: CambioPendiente) => void }) {
  const [datos, setDatos] = useState<{ general: number; tesoreros: AvisoTesorero[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api
      .listarAvisosTesoreros()
      .then((r) => vigente && setDatos({ general: r.general, tesoreros: r.datos }))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <section aria-labelledby="h-avisos-tesoreros">
      <h2 id="h-avisos-tesoreros" className="text-lg font-bold border-b-2 border-acento pb-1">
        Avisos por tesorero
      </h2>
      <p className="mt-2 text-sm text-suave max-w-2xl">
        Cada tesorero puede tener sus propios días de aviso. Si el campo queda vacío, se usan los días generales de arriba.
      </p>
      {error && (
        <p role="alert" className="mt-3 font-medium text-rojo">
          {error}
        </p>
      )}
      {!datos && !error && (
        <p className="mt-3 text-suave" role="status">
          Cargando avisos…
        </p>
      )}
      {datos && (
        <div className="mt-3 overflow-x-auto rounded border border-divisor">
          <table className="w-full text-sm">
            <caption className="sr-only">Días de aviso por tesorero</caption>
            <thead className="bg-fondo-suave text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold border-b-2 border-control">Tesorero</th>
                <th scope="col" className="px-3 py-2 font-semibold border-b-2 border-control">Días de aviso propios</th>
                <th scope="col" className="px-3 py-2 font-semibold border-b-2 border-control">Días que se aplican</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divisor">
              {datos.tesoreros.map((t) => (
                <FilaAviso
                  key={`${t.id}-${t.diasAviso}`}
                  t={t}
                  general={datos.general}
                  pedirConfirmacion={pedirConfirmacion}
                  alGuardar={(n) => setDatos((d) => d && { ...d, tesoreros: d.tesoreros.map((x) => (x.id === n.id ? n : x)) })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PanelConfiguracion() {
  const [confirmacion, setConfirmacion] = useState<CambioPendiente | null>(null);
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

  // Los demás parámetros siguen existiendo; quedarán para una futura sección «Avanzado» solo para Jefatura.
  const globales = useMemo(() => (datos ?? []).filter((p) => p.ambito === "global" && p.visible), [datos]);

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
          <FilaParametro key={p.id} p={p} alGuardar={alGuardar} pedirConfirmacion={setConfirmacion} />
        ))}
      </section>
      <AvisosPorTesorero pedirConfirmacion={setConfirmacion} />
      {confirmacion && <ConfirmarCambio cambio={confirmacion} alCerrar={() => setConfirmacion(null)} />}
    </div>
  );
}
