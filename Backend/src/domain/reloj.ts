// Reloj inyectable: la lógica nunca llama a new Date() directamente, así las pruebas fijan "hoy".
export type Reloj = () => Date;

export const relojSistema: Reloj = () => new Date();

/** La fecha de hoy (según la hora local del servidor) a medianoche UTC, igual que se guardan los vencimientos. */
export function hoyDe(reloj: Reloj): Date {
  const d = reloj();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** AAAA-MM de una fecha guardada a medianoche UTC. */
export const periodoDe = (f: Date) => f.toISOString().slice(0, 7);
