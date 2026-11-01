import type { ReactNode } from "react";

// Estilo compartido de Historial de cambios, Histórico y Movimientos sin obligación: título con barra de acento, recuadro de filtros
// en una sola fila (con salto de línea solo si no caben) y tabla con encabezado gris oscuro. Solo colores de la paleta (tokens de
// globals.css); los pares de contraste están en `npm run contraste`. Las demás pantallas no lo usan todavía.

/** Contenedor de la tabla: esquinas redondeadas y borde fino; el scroll horizontal queda dentro. */
export const claseContenedorTabla = "mt-4 overflow-x-auto rounded border border-divisor";
export const claseTabla = "w-full border-collapse text-sm";
export const claseEncabezadoTabla = "bg-tabla-cabecera text-sobre-tabla-cabecera";
/** Celda del encabezado: mayúsculas pequeñas con espaciado, como en el resto de la aplicación. */
export const claseTh = "px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider";
/** Fila: línea fina gris claro, tinte suave en las alternas y tinte verde bajo el cursor (el texto sigue negro). */
export const claseFila = "border-t border-linea-tabla first:border-t-0 even:bg-tinte-fila hover:bg-tinte-resalte";
export const claseCelda = "px-3.5 py-4 align-top";
/** Botón dentro de una tabla: verde con texto negro (el foco es el anillo gris oscuro global). */
export const claseBotonTabla = "whitespace-nowrap rounded-lg bg-acento px-3.5 py-2 text-[13px] font-semibold text-sobre-acento";

/** Título de pantalla con una barra corta verde debajo. */
export function TituloPantalla({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">{children}</h1>
      <span aria-hidden="true" className="mt-2 block h-1 w-14 rounded-full bg-acento" />
    </>
  );
}

/** Recuadro de fondo suave con todos los filtros en una fila; baja a otra solo si no caben. */
export function CajaFiltros({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <section aria-label={etiqueta} className="mt-5 flex w-fit max-w-full flex-wrap items-end gap-x-4 gap-y-3 rounded-[14px] border border-divisor bg-tinte-filtros p-4">
      {children}
    </section>
  );
}

/** Un filtro con su etiqueta pequeña encima (la misma letra que usa el selector de período). */
export function FiltroConEtiqueta({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-suave">{etiqueta}</label>
      {children}
    </div>
  );
}
