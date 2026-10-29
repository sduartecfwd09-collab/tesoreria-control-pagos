"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  aTextoDMA, deTextoDMA, mesDentroDeLimites, nombreDelPeriodo, rangoDeAtajo, recortarRango, sumarMeses, TEXTO_ATAJO, textoEntre, validarRango,
  type IdAtajo, type Limites, type Rango,
} from "@/lib/fechas";

// Selector de fechas único y reutilizable. Modo «mes»: flechas, y un panel para saltar de mes y de año. Modo «rango»: «Desde» y «Hasta»
// en día/mes/año, con atajos opcionales. La lógica (validación, atajos, límites) está en lib/fechas.ts y se prueba con `npm run fechas`.

const MESES_PANEL = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const claseFlecha = "flex px-3.5 py-2.5 disabled:cursor-not-allowed disabled:text-suave disabled:opacity-50";

interface Comunes {
  /** primera y última fecha con datos; null mientras no se conocen o si no hay datos (no limita) */
  limites?: Limites | null;
}

function SelectorMes({ valor, alCambiar, limites }: { valor: string; alCambiar: (mes: string) => void } & Comunes) {
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(Number(valor.slice(0, 4)));
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const ir = (mes: string) => {
    alCambiar(mes);
    setAbierto(false);
    boton.current?.focus();
  };
  const anterior = sumarMeses(valor, -1);
  const siguiente = sumarMeses(valor, 1);
  const abrir = () => {
    setAnio(Number(valor.slice(0, 4)));
    setAbierto((a) => !a);
  };
  const anioPosible = (a: number) => !limites || (a >= Number(limites.primera.slice(0, 4)) && a <= Number(limites.ultima.slice(0, 4)));

  return (
    <div ref={raiz} className="relative" onKeyDown={(e) => e.key === "Escape" && abierto && (setAbierto(false), boton.current?.focus())}>
      <div className="flex items-center overflow-hidden rounded-[10px] border border-control">
        <button type="button" onClick={() => alCambiar(anterior)} disabled={!mesDentroDeLimites(anterior, limites)} aria-label="Mes anterior" title="Mes anterior" className={claseFlecha}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button ref={boton} type="button" onClick={abrir} aria-expanded={abierto} aria-controls={abierto ? idPanel : undefined} aria-label={`Mes: ${nombreDelPeriodo(valor)}. Elegir otro mes`}
          className="border-x border-control px-4 py-2.5 text-sm font-semibold capitalize">
          <span aria-live="polite">{nombreDelPeriodo(valor)}</span>
        </button>
        <button type="button" onClick={() => alCambiar(siguiente)} disabled={!mesDentroDeLimites(siguiente, limites)} aria-label="Mes siguiente" title="Mes siguiente" className={claseFlecha}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      {abierto && (
        <div id={idPanel} role="group" aria-label="Elegir mes y año" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border-2 border-control bg-fondo p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setAnio((a) => a - 1)} disabled={!anioPosible(anio - 1)} aria-label="Año anterior" title="Año anterior" className="flex rounded px-2 py-1.5 disabled:cursor-not-allowed disabled:text-suave disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-sm font-bold" aria-live="polite">{anio}</span>
            <button type="button" onClick={() => setAnio((a) => a + 1)} disabled={!anioPosible(anio + 1)} aria-label="Año siguiente" title="Año siguiente" className="flex rounded px-2 py-1.5 disabled:cursor-not-allowed disabled:text-suave disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {MESES_PANEL.map((nombre, i) => {
              const periodo = `${anio}-${String(i + 1).padStart(2, "0")}`;
              const actual = periodo === valor;
              return (
                <button key={periodo} type="button" onClick={() => ir(periodo)} disabled={!mesDentroDeLimites(periodo, limites)} aria-pressed={actual} aria-label={nombreDelPeriodo(periodo)}
                  className={`rounded px-2 py-2 text-sm capitalize disabled:cursor-not-allowed disabled:text-suave disabled:opacity-50 ${actual ? "bg-acento font-bold text-sobre-acento" : "border border-divisor hover:bg-fondo-suave"}`}>
                  {nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const claseEntrada = "w-36 rounded border-2 border-control bg-fondo px-3 py-2 text-sm";
const claseAtajo = "rounded-full border border-control px-3 py-1 text-xs font-semibold hover:bg-fondo-suave aria-pressed:bg-acento aria-pressed:text-sobre-acento";

function SelectorRango({ valor, alCambiar, limites, hoy, atajos, etiqueta, restringidoAMes }: {
  valor: Rango | null; alCambiar: (r: Rango | null) => void; hoy: string; atajos?: IdAtajo[]; etiqueta?: string; restringidoAMes?: string;
} & Comunes) {
  const [desde, setDesde] = useState(valor ? aTextoDMA(valor.desde) : "");
  const [hasta, setHasta] = useState(valor ? aTextoDMA(valor.hasta) : "");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  // el valor puede cambiar desde afuera (un atajo, «Quitar», otro mes): los campos lo siguen
  const clave = valor ? `${valor.desde}|${valor.hasta}` : "";
  const [claveVista, setClaveVista] = useState(clave);
  if (clave !== claveVista) {
    setClaveVista(clave);
    setDesde(valor ? aTextoDMA(valor.desde) : "");
    setHasta(valor ? aTextoDMA(valor.hasta) : "");
    setError(null);
  }

  const opciones = { limites, mes: restringidoAMes };
  const confirmar = (d: string, h: string) => {
    if (d.trim() === "" && h.trim() === "") return setError(null), alCambiar(null);
    const a = deTextoDMA(d);
    const b = deTextoDMA(h);
    if (d.trim() === "" || h.trim() === "") return setError("Complete «Desde» y «Hasta», o deje ambos vacíos para ver todo el período.");
    const mensaje = a && b ? validarRango({ desde: a, hasta: b }, opciones) : "Escriba las fechas como día/mes/año, por ejemplo 15/10/2026.";
    setError(mensaje);
    if (!mensaje && a && b) alCambiar({ desde: a, hasta: b });
  };
  const alTeclear = (e: React.KeyboardEvent) => e.key === "Enter" && confirmar(desde, hasta);
  const usarAtajo = (idAtajo: IdAtajo) => {
    const r = recortarRango(rangoDeAtajo(idAtajo, hoy), opciones);
    if (!r) return setError(restringidoAMes ? `«${TEXTO_ATAJO[idAtajo]}» queda fuera de ${nombreDelPeriodo(restringidoAMes)}.` : `«${TEXTO_ATAJO[idAtajo]}» queda fuera del período con datos.`);
    setError(null);
    alCambiar(r);
  };

  return (
    <div role="group" aria-label={etiqueta ?? "Rango de fechas"}>
      <div className="flex flex-wrap items-end gap-3">
        {etiqueta && <span className="pb-2.5 text-sm font-semibold">{etiqueta}</span>}
        <div>
          <label htmlFor={`${id}-desde`} className="block text-xs font-semibold text-suave">Desde</label>
          <input id={`${id}-desde`} value={desde} onChange={(e) => setDesde(e.target.value)} onBlur={() => confirmar(desde, hasta)} onKeyDown={alTeclear} inputMode="numeric" autoComplete="off" maxLength={10}
            placeholder="dd/mm/aaaa" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={claseEntrada} />
        </div>
        <div>
          <label htmlFor={`${id}-hasta`} className="block text-xs font-semibold text-suave">Hasta</label>
          <input id={`${id}-hasta`} value={hasta} onChange={(e) => setHasta(e.target.value)} onBlur={() => confirmar(desde, hasta)} onKeyDown={alTeclear} inputMode="numeric" autoComplete="off" maxLength={10}
            placeholder="dd/mm/aaaa" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={claseEntrada} />
        </div>
        {atajos && atajos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pb-1.5" role="group" aria-label="Atajos">
            {atajos.map((a) => {
              const r = recortarRango(rangoDeAtajo(a, hoy), opciones);
              const activo = Boolean(valor && r && valor.desde === r.desde && valor.hasta === r.hasta);
              return (
                <button key={a} type="button" onClick={() => usarAtajo(a)} aria-pressed={activo} className={claseAtajo}>{TEXTO_ATAJO[a]}</button>
              );
            })}
          </div>
        )}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-semibold text-rojo">{error}</p>}
    </div>
  );
}

type Props = Comunes & { hoy: string } & (
  | { modo: "mes"; valor: string; onChange: (mes: string) => void }
  | { modo: "rango"; valor: Rango | null; onChange: (rango: Rango | null) => void; atajos?: IdAtajo[]; etiqueta?: string; restringidoAMes?: string }
);

export function SelectorFechas(props: Props) {
  if (props.modo === "mes") return <SelectorMes valor={props.valor} alCambiar={props.onChange} limites={props.limites} />;
  return <SelectorRango valor={props.valor} alCambiar={props.onChange} limites={props.limites} hoy={props.hoy} atajos={props.atajos} etiqueta={props.etiqueta} restringidoAMes={props.restringidoAMes} />;
}

/** Filtro de fechas activo, como etiqueta con «Quitar» («Vence entre 01/10/2026 y 15/10/2026»). */
export function FiltroFechasActivo({ rotulo, rango, alQuitar }: { rotulo: string; rango: Rango; alQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-control bg-fondo-suave px-3 py-1 text-sm">
      <span>{rotulo} <b>{textoEntre(rango)}</b></span>
      <button type="button" onClick={alQuitar} aria-label={`Quitar el filtro: ${rotulo} ${textoEntre(rango)}`} className="font-semibold underline">Quitar</button>
    </span>
  );
}
