// La abreviatura de una sociedad es opcional: donde se necesita un texto corto se usa la abreviatura
// y, si no tiene, el nombre largo.
export const etiquetaSociedad = (s: { codigo: string | null; nombreLargo: string }): string => s.codigo ?? s.nombreLargo;
