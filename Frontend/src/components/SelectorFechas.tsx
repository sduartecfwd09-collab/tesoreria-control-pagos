"use client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import {
  aTextoDMA, evaluarFechasEscritas, mensajeDeFechas, mesDentroDeLimites, nombreDelPeriodo, OPCION_ELEGIR, sumarMeses,
  type Limites, type OpcionPeriodo, type Rango,
} from "@/lib/fechas";
import { Campo, claseControl } from "./ui";

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
 * Lugar donde el recuadro de filtros (CajaFiltros) muestra el mensaje del selector: en una línea propia debajo de TODA la fila, a todo
 * su ancho, para que el mensaje nunca mueva ni desalinee los demás controles. Sin recuadro (p. ej. Vencidos), el selector lo muestra debajo.
 */
export const ContextoMensajeFiltros = createContext<{ ponerMensaje: (m: string | null) => void; idMensaje: string } | null>(null);

/**
 * Lista desplegable de período. Las opciones ya vienen filtradas (solo válidas). Solo «Elegir fechas» muestra «Desde» y «Hasta»
 * (día/mes/año). El filtro se aplica en cuanto las dos fechas están completas y son válidas (sin Enter), y también al salir del campo
 * por si el navegador no avisó. Lo escrito se valida contra los mismos límites que el calendario. El mensaje (incompleto, fuera de
 * rango, Desde posterior a Hasta) aparece al salir de la pareja de campos o al pulsar Enter, no mientras se escribe, y desaparece al
 * volver a escribir. `null` = sin filtro de fechas. El padre cambia la `key` para reiniciarla (p. ej. al cambiar de mes).
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
  const [mostrar, setMostrar] = useState(false); // ¿ya se puede mostrar el mensaje? (después de salir del campo o de intentar aplicar)
  const aplicada = useRef(""); // el rango escrito que ya se aplicó, para no repetirlo
  const campoDesde = useRef<HTMLInputElement>(null);
  const campoHasta = useRef<HTMLInputElement>(null);
  const id = useId();
  const contexto = useContext(ContextoMensajeFiltros);
  // si la opción elegida deja de ofrecerse (cambió «hoy» o la ventana), se vuelve a la primera
  const vigente = opciones.some((o) => o.id === elegida) ? elegida : opciones[0]!.id;
  const pidiendoFechas = vigente === OPCION_ELEGIR.id;

  const fechas = evaluarFechasEscritas(desde, hasta, { limites, mes });
  const mensaje = pidiendoFechas ? mensajeDeFechas(fechas, mostrar) : null;
  const idMensaje = contexto?.idMensaje ?? `${id}-error`;

  const ponerMensaje = contexto?.ponerMensaje;
  useEffect(() => {
    ponerMensaje?.(mensaje);
    return () => ponerMensaje?.(null);
  }, [mensaje, ponerMensaje]);

  const aplicar = (d: string, h: string) => {
    const r = evaluarFechasEscritas(d, h, { limites, mes });
    if (r.estado !== "valido") return;
    const clave = `${r.rango.desde}|${r.rango.hasta}`;
    if (clave === aplicada.current) return;
    aplicada.current = clave;
    alCambiar(r.rango);
  };

  const elegir = (nueva: string) => {
    const opcion = opciones.find((o) => o.id === nueva)!;
    setElegida(nueva);
    setMostrar(false);
    if (nueva === OPCION_ELEGIR.id) {
      setDesde(rangoActual ? aTextoDMA(rangoActual.desde) : "");
      setHasta(rangoActual ? aTextoDMA(rangoActual.hasta) : "");
      aplicada.current = rangoActual ? `${rangoActual.desde}|${rangoActual.hasta}` : "";
    } else {
      aplicada.current = "";
      alCambiar(opcion.rango);
    }
  };

  const escribir = (campo: "desde" | "hasta", valor: string) => {
    setMostrar(false); // mientras se escribe no se muestra ningún mensaje
    if (campo === "desde") setDesde(valor);
    else setHasta(valor);
    aplicar(campo === "desde" ? valor : desde, campo === "hasta" ? valor : hasta);
  };
  const alSalir = (e: React.FocusEvent<HTMLInputElement>) => {
    aplicar(desde, hasta);
    // pasar de «Desde» a «Hasta» (o al revés) todavía es escribir: el mensaje espera a que se salga de la pareja
    const destino = e.relatedTarget;
    if (destino !== campoDesde.current && destino !== campoHasta.current) setMostrar(true);
  };
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    setMostrar(true);
    aplicar(desde, hasta);
  };
  const invalido = mensaje ? true : undefined;

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
              <input ref={campoDesde} id={`${id}-desde`} value={desde} onChange={(e) => escribir("desde", e.target.value)} onBlur={alSalir} onKeyDown={alTeclear} inputMode="numeric" autoComplete="off" maxLength={10}
                placeholder="dd/mm/aaaa" aria-invalid={invalido} aria-describedby={mensaje ? idMensaje : undefined} className={claseEntrada} />
            </div>
            <div>
              <label htmlFor={`${id}-hasta`} className="block text-xs font-semibold text-suave">Hasta</label>
              <input ref={campoHasta} id={`${id}-hasta`} value={hasta} onChange={(e) => escribir("hasta", e.target.value)} onBlur={alSalir} onKeyDown={alTeclear} inputMode="numeric" autoComplete="off" maxLength={10}
                placeholder="dd/mm/aaaa" aria-invalid={invalido} aria-describedby={mensaje ? idMensaje : undefined} className={claseEntrada} />
            </div>
          </>
        )}
      </div>
      {mensaje && !contexto && <p id={idMensaje} role="alert" className="mt-2 text-sm font-semibold text-rojo">{mensaje}</p>}
    </div>
  );
}

/**
 * Una sola fecha escrita como día/mes/año: el mismo formato y la misma lógica (lib/fechas.ts) que «Desde» y «Hasta» de «Elegir fechas».
 * El mensaje de error lo pone quien lo usa (se valida al intentar guardar, no mientras se escribe).
 */
export function CampoFecha({ id, etiqueta, valor, alCambiar, error, ayuda }: { id: string; etiqueta: string; valor: string; alCambiar: (texto: string) => void; error?: string; ayuda?: string }) {
  return (
    <Campo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <input
        id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={10} placeholder="dd/mm/aaaa"
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined} className={claseEntrada}
      />
    </Campo>
  );
}
