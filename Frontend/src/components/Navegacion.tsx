"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Las pestañas "pronto" abren una página Próximamente (no un error) que explica en qué hito llegan.
const PANTALLAS = [
  { href: "/", texto: "Tablero", pronto: true },
  { href: "/vencimientos", texto: "Vencimientos", pronto: false },
  { href: "/obligaciones", texto: "Obligaciones", pronto: false },
  { href: "/conciliacion", texto: "Conciliación", pronto: true },
  { href: "/inconsistencias", texto: "Inconsistencias", pronto: true },
  { href: "/avisos", texto: "Avisos", pronto: true },
  { href: "/archivos", texto: "Archivos importados", pronto: false },
  { href: "/configuracion", texto: "Configuración", pronto: false },
];

export function Navegacion() {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal" className="border-b border-divisor bg-fondo-suave">
      <ul className="mx-auto max-w-6xl px-4 flex flex-wrap gap-x-1 text-sm">
        {PANTALLAS.map((p) => {
          const activa = ruta === p.href;
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={activa ? "page" : undefined}
                title={p.pronto ? "Disponible en un próximo hito" : undefined}
                className={`block px-3 py-3 border-b-4 ${activa ? "border-acento" : "border-transparent hover:border-divisor"} ${p.pronto ? "text-suave" : "font-medium text-texto"}`}
              >
                {p.texto}
                {p.pronto && <span className="ml-1 text-xs">(pronto)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
