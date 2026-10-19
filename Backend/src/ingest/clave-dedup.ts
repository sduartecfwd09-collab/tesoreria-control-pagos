import { createHash } from "node:crypto";
import type { MovimientoLeido } from "./tipos.js";

/**
 * CLAVE DE DEDUPLICACIÓN (propuesta del Hito 2)
 *
 *   sha1( cuenta | fecha | referencia | descripción normalizada | débito | crédito | saldo | n )
 *
 * - Se calcula por CUENTA, no por archivo: así dos archivos que se solapan (p. ej. un estado
 *   reexportado o con un rango más amplio) producen la misma clave para el mismo movimiento.
 * - Incluye el saldo corrido: dos movimientos reales iguales el mismo día (mismo importe y referencia)
 *   casi siempre difieren en el saldo, lo que los distingue sin depender de nada más.
 * - `n` es el ordinal entre filas totalmente idénticas DENTRO del mismo archivo (1, 2, 3…). Así las
 *   filas repetidas de un mismo archivo nunca se colapsan, y al solaparse con otro archivo la
 *   n-ésima repetición de uno coincide con la n-ésima del otro.
 * - La descripción se normaliza (minúsculas, sin tildes, espacios colapsados) para tolerar diferencias
 *   de formato entre exportaciones; la hoja y la fila NO entran (cambian entre archivos).
 *
 * Límite conocido: si un archivo trae solo parte de un grupo de filas idénticas y el otro todo el grupo,
 * el ordinal podría no alinear. Es un caso raro y se reportará como duplicado no detectado, no se oculta.
 */
export function clavesDeDeduplicacion(cuentaId: number, movs: MovimientoLeido[]): string[] {
  const vistas = new Map<string, number>();
  return movs.map((m) => {
    const base = [
      cuentaId,
      m.fecha.toISOString().slice(0, 10),
      (m.referencia ?? "").trim(),
      normalizarDescripcion(m.descripcion),
      m.debito,
      m.credito,
      m.saldo ?? "",
    ].join("|");
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return createHash("sha1").update(`${base}|${n}`).digest("hex");
  });
}

function normalizarDescripcion(d: string | null): string {
  return (d ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
