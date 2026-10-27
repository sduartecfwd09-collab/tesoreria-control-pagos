"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";

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
  ],
  [{ href: "/obligaciones", texto: "Obligaciones", icono: <Icono><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icono> }],
  [
    { href: "/archivos", texto: "Estados de cuenta", icono: <Icono><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Icono> },
    { href: "/configuracion", texto: "Configuración", icono: <Icono><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></Icono> },
  ],
];

const CLAVE = "menu-plegado";

// El estado «menú oculto» se recuerda en el navegador; si no hay almacenamiento, solo mientras la página está abierta.
let enMemoria = false;
const escuchas = new Set<() => void>();
const leerPlegado = () => {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return enMemoria;
  }
};
const suscribir = (f: () => void) => {
  escuchas.add(f);
  return () => void escuchas.delete(f);
};
const guardarPlegado = (valor: boolean) => {
  enMemoria = valor;
  try {
    localStorage.setItem(CLAVE, valor ? "1" : "0");
  } catch {
    /* sin almacenamiento */
  }
  escuchas.forEach((f) => f());
};
const foco = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-acento"; // el foco gris no se ve sobre negro

/**
 * Cubre toda la pantalla: en pantallas anchas el menú es una columna fija que se puede ocultar (queda solo con iconos);
 * en pantallas angostas es una barra superior con un botón que abre y cierra la lista. Todo se maneja con el teclado.
 */
export function MenuLateral({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const plegado = useSyncExternalStore(suscribir, leerPlegado, () => false);
  const [abierto, setAbierto] = useState(false);

  const alternar = () => guardarPlegado(!plegado);

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

      <aside
        id="menu-principal"
        className={`${abierto ? "flex" : "hidden"} flex-col gap-7 bg-cabecera px-4 py-6 text-sobre-cabecera md:sticky md:top-0 md:flex md:h-screen md:flex-none md:self-start md:overflow-y-auto ${plegado ? "md:w-[76px] md:px-2.5" : "md:w-64"}`}
      >
        <button
          type="button"
          onClick={alternar}
          aria-pressed={plegado}
          aria-label={plegado ? "Mostrar menú" : "Ocultar menú"}
          className={`hidden items-center gap-2 self-end rounded-lg border border-suave px-2.5 py-1.5 text-xs font-semibold hover:bg-[#1a1a1a] md:flex ${plegado ? "self-center" : ""} ${foco}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={plegado ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
          </svg>
          {!plegado && "Ocultar menú"}
        </button>

        <div className={`flex items-center gap-3 px-1.5 ${plegado ? "md:justify-center md:px-0" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Garnier" width={48} height={48} className="h-12 w-12 rounded-xl" />
          <div className={plegado ? "md:hidden" : ""}>
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
                      onClick={() => setAbierto(false)}
                      aria-current={activa ? "page" : undefined}
                      title={plegado ? p.texto : undefined}
                      className={`flex items-center gap-3 rounded-lg p-3 text-sm ${activa ? "bg-acento font-bold text-sobre-acento" : "font-medium hover:bg-[#1a1a1a]"} ${plegado ? "md:justify-center" : ""} ${foco}`}
                    >
                      {p.icono}
                      <span className={plegado ? "md:sr-only" : ""}>{p.texto}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-11 md:py-9">{children}</main>
    </div>
  );
}
