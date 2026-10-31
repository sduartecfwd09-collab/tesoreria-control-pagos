"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  aTextoDMA, deTextoDMA, mesDentroDeLimites, nombreDelPeriodo, OPCION_ELEGIR, sumarMeses, validarRango,
  type Limites, type OpcionPeriodo, type Rango,
} from "@/lib/fechas";
import { claseControl } from "./ui";

// Selectores de fechas. «Mes»: flechas y un panel para saltar de mes y de año. «Período»: lista desplegable con opciones válidas y, solo con «Elegir fechas»,
// «Desde» y «Hasta». La lógica (validación, opciones, límites) está en lib/fechas.ts y se prueba con `npm run fechas`.

const MESES_PANEL = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const claseFlecha = "flex px-3.5 py-2.5 disabled:cursor-not-allowed disabled:text-suave disabled:opacity-50";

interface Comunes {
  /** fechas que se pueden elegir; null o ausente = sin límite */
  limites?: Limites | null;
}

export function SelectorMes({ valor, alCambiar, limites }: { valor: string; alCambiar: (mes: string) => void } & Comunes) {
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

/**
 * Lista desplegable de período. Las opciones ya vienen filtradas (solo válidas). Solo «Elegir fechas» muestra «Desde» y «Hasta»
 * (día/mes/año) y las comprueba contra `limites` y, si se indica, contra un mes. Al elegir una opción con rango, o al escribir fechas válidas,
 * avisa con `alCambiar(rango)`; `null` = sin filtro de fechas. El padre cambia la `key` para reiniciarla (p. ej. al cambiar de mes).
 */
export function SelectorPeriodo({ etiqueta, opciones, inicial, rangoActual, limites, mes, alCambiar }: {
  etiqueta: string;
  opciones: OpcionPeriodo[];
  inicial: string;
  /** rango que se ve ahora; sirve de punto de partida al elegir fechas */
  rangoActual: Rango | null;
  limites?: Limites | null;
  mes?: string;
  alCambiar: (rango: Rango | null) => void;
}) {
  const [elegida, setElegida] = useState(opciones.some((o) => o.id === inicial) ? inicial : opciones[0]!.id);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  // si la opción elegida deja de ofrecerse (cambió «hoy» o la ventana), se vuelve a la primera
  const vigente = opciones.some((o) => o.id === elegida) ? elegida : opciones[0]!.id;
  const pidiendoFechas = vigente === OPCION_ELEGIR.id;

  const elegir = (nueva: string) => {
    const opcion = opciones.find((o) => o.id === nueva)!;
    setElegida(nueva);
    setError(null);
    if (nueva === OPCION_ELEGIR.id) {
      setDesde(rangoActual ? aTextoDMA(rangoActual.desde) : "");
      setHasta(rangoActual ? aTextoDMA(rangoActual.hasta) : "");
    } else {
      alCambiar(opcion.rango);
    }
  };

  const confirmar = (d: string, h: string) => {
    if (d.trim() === "" || h.trim() === "") return setError(d.trim() === "" && h.trim() === "" ? null : "Complete «Desde» y «Hasta».");
    const a = deTextoDMA(d);
    const b = deTextoDMA(h);
    const mensaje = a && b ? validarRango({ desde: a, hasta: b }, { limites, mes }) : "Escriba las fechas como día/mes/año, por ejemplo 15/10/2026.";
    setError(mensaje);
    if (!mensaje && a && b) alCambiar({ desde: a, hasta: b });
  };
  const alTeclear = (e: React.KeyboardEvent) => e.key === "Enter" && confirmar(desde, hasta);

  return (
    <div role="group" aria-label={etiqueta}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${id}-lista`} className="block text-xs font-semibold text-suave">{etiqueta}</label>
          <select id={`${id}-lista`} value={vigente} onChange={(e) => elegir(e.target.value)} className={`${claseControl} text-sm`}>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>{o.texto}</option>
            ))}
          </select>
        </div>
        {pidiendoFechas && (
          <>
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
          </>
        )}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-semibold text-rojo">{error}</p>}
    </div>
  );
}
