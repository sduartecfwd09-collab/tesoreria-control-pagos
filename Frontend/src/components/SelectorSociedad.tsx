"use client";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { claseControl } from "./ui";

export interface OpcionSociedad {
  valor: string;
  nombre: string;
}

/** Sin mayúsculas ni tildes, para que el buscador no distinga entre «Ñ», «ñ» o «n». */
const plano = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Selector de sociedad con buscador (patrón «combobox» con lista): se escribe para filtrar, se navega con las flechas,
 * Enter elige, Esc cierra. Las opciones muestran el nombre largo completo en varias líneas y en letra pequeña.
 * `textoTodas` agrega al inicio la opción que quita el filtro (valor "").
 */
export function SelectorSociedad({
  id, opciones, valor, alCambiar, textoTodas, placeholder = "Elija una sociedad…", describedBy, invalido, alPerderFoco,
}: {
  id: string;
  opciones: OpcionSociedad[];
  valor: string;
  alCambiar: (valor: string) => void;
  textoTodas?: string;
  placeholder?: string;
  describedBy?: string;
  invalido?: boolean;
  alPerderFoco?: () => void;
}) {
  const idLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [activa, setActiva] = useState(0);

  const elegida = opciones.find((o) => o.valor === valor);
  const visibles = useMemo(() => {
    const q = plano(consulta).trim();
    const coinciden = q ? opciones.filter((o) => plano(o.nombre).includes(q)) : opciones;
    return textoTodas && !q ? [{ valor: "", nombre: textoTodas }, ...coinciden] : coinciden;
  }, [opciones, consulta, textoTodas]);

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // Mantiene visible la opción activa al navegar con el teclado.
  useEffect(() => {
    if (abierto) lista.current?.querySelector<HTMLElement>(`[data-i="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  function abrir() {
    if (abierto) return;
    const i = visibles.findIndex((o) => o.valor === valor);
    setActiva(Math.max(i, 0));
    setAbierto(true);
  }
  function cerrar() {
    setAbierto(false);
    setConsulta("");
  }
  function elegir(o: OpcionSociedad) {
    alCambiar(o.valor);
    cerrar();
  }
  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) return abrir();
      setActiva((i) => Math.min(Math.max(i + (e.key === "ArrowDown" ? 1 : -1), 0), Math.max(visibles.length - 1, 0)));
    } else if (e.key === "Home" && abierto) {
      e.preventDefault();
      setActiva(0);
    } else if (e.key === "End" && abierto) {
      e.preventDefault();
      setActiva(Math.max(visibles.length - 1, 0));
    } else if (e.key === "Enter" && abierto) {
      e.preventDefault(); // no envía el formulario
      const o = visibles[activa];
      if (o) elegir(o);
    } else if (e.key === "Escape" && abierto) {
      e.preventDefault();
      e.stopPropagation(); // no cierra el cuadro de diálogo que lo contiene
      cerrar();
    } else if (e.key === "Tab") {
      cerrar();
    }
  }

  const texto = abierto ? consulta : (elegida?.nombre ?? textoTodas ?? "");
  return (
    <div ref={raiz} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && visibles[activa] ? `${idLista}-${activa}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalido || undefined}
        autoComplete="off"
        title={elegida?.nombre}
        placeholder={abierto ? (elegida?.nombre ?? "Escriba para buscar…") : placeholder}
        value={texto}
        className={`${claseControl} w-full truncate`}
        onFocus={abrir}
        onClick={abrir}
        onBlur={alPerderFoco}
        onChange={(e) => {
          setConsulta(e.target.value);
          setActiva(0);
          setAbierto(true);
        }}
        onKeyDown={teclado}
      />
      {abierto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          aria-label="Sociedades"
          className="absolute left-0 z-30 mt-1 max-h-72 w-[min(40rem,calc(100vw-2rem))] overflow-auto rounded border-2 border-control bg-fondo py-1 text-sm shadow-lg"
        >
          {visibles.length === 0 && <li className="px-3 py-2 text-suave">Ninguna sociedad coincide con lo escrito.</li>}
          {visibles.map((o, i) => (
            <li
              key={o.valor || "todas"}
              id={`${idLista}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.valor === valor}
              title={o.nombre}
              // mousedown (y no click) para elegir antes de que el campo pierda el foco
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(o);
              }}
              onMouseEnter={() => setActiva(i)}
              className={`cursor-pointer px-3 py-1.5 leading-snug whitespace-normal break-words ${i === activa ? "bg-fondo-suave outline outline-2 -outline-offset-2 outline-control" : ""} ${o.valor === valor ? "font-semibold" : ""}`}
            >
              {o.nombre}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
