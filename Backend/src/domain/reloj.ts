// Reloj inyectable: la lógica nunca llama a new Date() directamente, así las pruebas fijan "hoy".
export type Reloj = () => Date;

export const relojSistema: Reloj = () => new Date();

/** Zona horaria de la operación: Costa Rica (UTC-6, sin horario de verano). El servidor es la única fuente de «hoy». */
export const ZONA_HORARIA = "America/Costa_Rica";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA, year: "numeric", month: "2-digit", day: "2-digit" });

/** La fecha de hoy en Costa Rica (sin importar la zona del servidor) a medianoche UTC, igual que se guardan los vencimientos. */
export function hoyDe(reloj: Reloj): Date {
  const [y, m, d] = formatoDia.format(reloj()).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** AAAA-MM de una fecha guardada a medianoche UTC. */
export const periodoDe = (f: Date) => f.toISOString().slice(0, 7);
