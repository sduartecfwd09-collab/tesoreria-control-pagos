// Historial de cambios de las decisiones humanas. SOLO INSERTA: este módulo no ofrece edición ni borrado. La lectura llega con la
// pantalla del historial. Las funciones reciben el cliente de la transacción para que el registro y la edición se guarden juntos
// o no se guarde ninguno.
import type { Prisma } from "../generated/prisma/client.js";
import { ACCIONES_CON_MOTIVO, type LineaCambio } from "../domain/historial.js";

export interface AutorDelCambio {
  id: number;
  nombre: string;
  modoPruebas: boolean;
}

export async function insertarHistorial(
  tx: Prisma.TransactionClient,
  d: { obligacionId: number | null; sociedadId: number | null; autor: AutorDelCambio; lineas: LineaCambio[]; motivo?: string | null; /** por defecto «obligacion» y la propia obligación; sin obligación (un archivo) hay que indicar la entidad y su id */ entidad?: string; entidadId?: number },
): Promise<number> {
  if (d.lineas.length === 0) return 0;
  const r = await tx.historialCambio.createMany({
    data: d.lineas.map((l) => ({
      entidad: d.entidad ?? "obligacion",
      entidadId: d.entidadId ?? d.obligacionId ?? 0,
      obligacionId: d.obligacionId,
      sociedadId: d.sociedadId,
      accion: l.accion,
      campo: l.campo,
      antes: l.antes,
      despues: l.despues,
      // el motivo solo acompaña a activar, desactivar, asociar un pago y quitar la asociación
      motivo: ACCIONES_CON_MOTIVO.includes(l.accion) ? (d.motivo ?? null) : null,
      usuarioId: d.autor.id,
      nombreUsuario: d.autor.nombre,
      modoPruebas: d.autor.modoPruebas,
    })),
  });
  return r.count;
}
