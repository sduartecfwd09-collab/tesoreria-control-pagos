"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PANTALLAS = [
  { href: "/", texto: "Tablero", pronto: true },
  { href: "/vencimientos", texto: "Vencimientos", pronto: true },
  { href: "/obligaciones", texto: "Obligaciones", pronto: true },
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
      <ul className="mx-auto max-w-5xl px-4 flex flex-wrap gap-x-1 text-sm">
        {PANTALLAS.map((p) => {
          const activa = ruta === p.href;
          return (
            <li key={p.href}>
              {p.pronto ? (
                <span
                  aria-disabled="true"
                  title="Disponible en un próximo hito"
                  className="block px-3 py-3 text-suave opacity-70 cursor-not-allowed"
                >
                  {p.texto}
                </span>
              ) : (
                <Link
                  href={p.href}
                  aria-current={activa ? "page" : undefined}
                  className={`block px-3 py-3 font-medium text-texto border-b-4 ${activa ? "border-acento" : "border-transparent hover:border-divisor"}`}
                >
                  {p.texto}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
