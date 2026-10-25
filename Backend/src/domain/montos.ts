// Los montos se guardan en la base como BigInt (centavos), pero JSON no admite BigInt y la logica de negocio
// trabaja con numeros. Esta es la unica conversion: falla en voz alta si un monto no cabe sin perder precision
// (mas de 9 mil billones de centavos), en vez de redondear en silencio.
export function aNumero(v: bigint): number;
export function aNumero(v: bigint | null): number | null;
export function aNumero(v: bigint | null): number | null {
  if (v === null) return null;
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("Un monto excede el rango que se puede enviar sin perder precision");
  }
  return Number(v);
}
