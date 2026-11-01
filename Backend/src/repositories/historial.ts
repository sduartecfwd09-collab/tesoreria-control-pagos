// Historial de cambios de las decisiones humanas. SOLO INSERTA: este módulo no ofrece edición ni borrado. La lectura llega con la
// pantalla del historial. Las funciones reciben el cliente de la transacción para que el registro y la edición se guarden juntos
// o no se guarde ninguno.
import type { Prisma } from "../generated/prisma/client.js";
import type { LineaCambio } from "../domain/historial.js";

export interface AutorDelCambio {
  id: number;
  nombre: string;
  modoPruebas: boolean;
}

export async function insertarHistorial(
  tx: Prisma.TransactionClient,
  d: { obligacionId: number; sociedadId: number; autor: AutorDelCambio; lineas: LineaCambio[]; motivo?: string | null },
): Promise<number> {
  if (d.lineas.length === 0) return 0;
  const r = await tx.historialCambio.createMany({
    data: d.lineas.map((l) => ({
      entidad: "obligacion",
      entidadId: d.obligacionId,
      obligacionId: d.obligacionId,
      sociedadId: d.sociedadId,
      accion: l.accion,
      campo: l.campo,
      antes: l.antes,
      despues: l.despues,
      // el motivo solo acompaña a activar y desactivar
      motivo: l.accion === "activar" || l.accion === "desactivar" ? (d.motivo ?? null) : null,
      usuarioId: d.autor.id,
      nombreUsuario: d.autor.nombre,
      modoPruebas: d.autor.modoPruebas,
    })),
  });
  return r.count;
}
