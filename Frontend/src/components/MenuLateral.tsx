"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";

// Menú lateral negro como el de la maqueta. Solo las pantallas que existen, en grupos separados por una línea.
const Icono = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
);

interface Pantalla {
  href: string;
  texto: string;
  icono: ReactNode;
}

const GRUPOS: Pantalla[][] = [
  [
    { href: "/", texto: "Pagos del mes", icono: <Icono><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icono> },
    { href: "/vencidos", texto: "Vencidos", icono: <Icono><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icono> },
    { href: "/historico", texto: "Histórico", icono: <Icono><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></Icono> },
    { href: "/avisos", texto: "Avisos", icono: <Icono><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icono> },
  ],
  [
    { href: "/obligaciones", texto: "Obligaciones", icono: <Icono><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icono> },
    { href: "/historial-cambios", texto: "Historial de cambios", icono: <Icono><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icono> },
  ],
  [
    { href: "/archivos", texto: "Estados de cuenta", icono: <Icono><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Icono> },
    { href: "/movimientos-sin-obligacion", texto: "Movimientos sin obligación", icono: <Icono><path d="M8 6h13M8 12h5M8 18h5M3 6h.01M3 12h.01M3 18h.01" /><circle cx="18" cy="16" r="4" /><path d="M17 15a1 1 0 1 1 1 1v.5M18 19h.01" /></Icono> },
    { href: "/configuracion", texto: "Mi configuración", icono: <Icono><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></Icono> },
  ],
];

const foco = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-acento"; // el foco gris no se ve sobre negro
const DEMORA_ABRIR = 150;
const DEMORA_CERRAR = 300;

/**
 * En pantallas anchas el menú es un riel angosto con solo iconos que se abre ENCIMA del contenido (no lo empuja):
 * al pasar el cursor (demora corta), con el foco del teclado o con un toque en pantallas táctiles. Se cierra al quitar
 * el cursor (demora algo mayor), con Esc o al sacar el foco. En pantallas angostas es una barra superior con un botón.
 */
export function MenuLateral({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const [expandido, setExpandido] = useState(false);
  const [abierto, setAbierto] = useState(false); // lista en pantallas angostas
  const toqueAbrio = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };
  useEffect(() => limpiar, []);

  const programar = (valor: boolean, demora: number) => {
    limpiar();
    temporizador.current = setTimeout(() => setExpandido(valor), demora);
  };
  const fijar = (valor: boolean) => {
    limpiar();
    setExpandido(valor);
  };

  const alEntrar = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    programar(true, DEMORA_ABRIR);
  };
  const alSalir = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    programar(false, DEMORA_CERRAR);
  };
  // Con el dedo, un toque en el riel cerrado lo abre sin navegar; un toque fuera de los enlaces lo cierra.
  const alTocar = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const enEnlace = (e.target as HTMLElement).closest("a");
    if (!expandido) {
      toqueAbrio.current = true;
      fijar(true);
    } else if (!enEnlace) fijar(false);
  };
  const alHacerClic = (e: MouseEvent) => {
    // El navegador genera el clic tras el toque: si ese toque abrió el riel, no debe navegar.
    if (toqueAbrio.current) {
      toqueAbrio.current = false;
      e.preventDefault();
    }
  };
  const alEnfocar = (e: FocusEvent<HTMLElement>) => {
    if (e.target.matches(":focus-visible")) fijar(true);
  };
  const alDesenfocar = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) fijar(false);
  };
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === "Escape") fijar(false);
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between bg-cabecera px-4 py-3 text-sobre-cabecera md:hidden">
        <span className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={36} height={36} className="rounded-lg" />
          <span className="font-extrabold tracking-widest">GARNIER</span>
        </span>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls="menu-principal"
          onClick={() => setAbierto((a) => !a)}
          className={`rounded-lg border border-suave px-3 py-2 text-sm font-semibold ${foco}`}
        >
          {abierto ? "Cerrar menú" : "Menú"}
        </button>
      </header>

      {/* Reserva el ancho del riel; el menú abierto se superpone sin mover el contenido. */}
      <div className="md:relative md:w-[72px] md:flex-none">
        <aside
          id="menu-principal"
          onPointerEnter={alEntrar}
          onPointerLeave={alSalir}
          onPointerDownCapture={alTocar}
          onClickCapture={alHacerClic}
          onFocus={alEnfocar}
          onBlur={alDesenfocar}
          onKeyDown={alTeclear}
          className={`${abierto ? "flex" : "hidden"} flex-col gap-7 bg-cabecera px-4 py-6 text-sobre-cabecera md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:overflow-x-hidden md:overflow-y-auto md:px-3 md:transition-[width] md:duration-150 motion-reduce:md:transition-none ${expandido ? "md:w-64" : "md:w-[72px]"}`}
        >
          <div className="flex items-center gap-3 px-1.5 md:px-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Garnier" width={48} height={48} className="h-12 w-12 flex-none rounded-xl" />
            <div className={expandido ? "" : "md:sr-only"}>
              <b className="block text-[19px] font-extrabold tracking-[0.08em]">GARNIER</b>
              <small className="mt-0.5 block whitespace-nowrap text-[10px] font-light uppercase tracking-[0.16em]">Control de pagos</small>
            </div>
          </div>

          <nav aria-label="Principal">
            {GRUPOS.map((grupo, i) => (
              <ul key={i} className={`flex flex-col gap-1 ${i > 0 ? "mt-3 border-t border-suave pt-3" : ""}`}>
                {grupo.map((p) => {
                  const activa = p.href === "/" ? ruta === "/" : ruta.startsWith(p.href);
                  return (
                    <li key={p.href}>
                      <Link
                        href={p.href}
                        onClick={() => {
                          setAbierto(false);
                          fijar(false);
                        }}
                        aria-current={activa ? "page" : undefined}
                        title={p.texto}
                        className={`flex items-center gap-3 rounded-lg p-3 text-sm ${activa ? "bg-acento font-bold text-sobre-acento shadow-[inset_4px_0_0_0_var(--color-sobre-acento)]" : "font-medium hover:bg-[#1a1a1a]"} ${foco}`}
                      >
                        {p.icono}
                        <span className={`whitespace-nowrap ${expandido ? "" : "md:sr-only"}`}>{p.texto}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ))}
          </nav>
        </aside>
      </div>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-11 md:py-9">{children}</main>
    </div>
  );
}
