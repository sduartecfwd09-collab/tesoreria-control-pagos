import { prisma } from "../db.js";

export const MOTIVO_CARGA_INICIAL = "carga inicial";
export const MOTIVO_CAMBIO_LISTA = "cambio en lista de Tesorería";

export async function listarSociedadesParaCarga() {
  return prisma.sociedad.findMany({ select: { id: true, codigo: true, nombreLargo: true, tesoreroId: true } });
}

/** Crea una sociedad activa y sin abreviatura (la abreviatura la asigna una persona de Jefatura). */
export async function crearSociedadSinAbreviatura(nombreLargo: string) {
  return prisma.sociedad.create({ data: { nombreLargo }, select: { id: true, codigo: true, nombreLargo: true, tesoreroId: true } });
}

export type ResultadoAsignacion = "inicial" | "cambio" | "sin_cambio";

/**
 * Deja a `usuarioId` como tesorero vigente de la sociedad y lo registra en el historial.
 * - Sin cambio (ya es el tesorero): no escribe nada, para poder repetir la carga sin duplicar.
 * - Primera asignación de la sociedad: fila nueva con motivo «carga inicial».
 * - Cambio de tesorero: cierra la fila vigente y abre otra con motivo «cambio en lista de Tesorería».
 */
export async function asignarTesorero(sociedadId: number, usuarioId: number, ahora = new Date()): Promise<ResultadoAsignacion> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.sociedad.findUniqueOrThrow({ where: { id: sociedadId }, select: { tesoreroId: true } });
    if (s.tesoreroId === usuarioId) return "sin_cambio";
    const previas = await tx.sociedadTesoreroHistorial.count({ where: { sociedadId } });
    await tx.sociedadTesoreroHistorial.updateMany({ where: { sociedadId, hasta: null }, data: { hasta: ahora } });
    await tx.sociedadTesoreroHistorial.create({
      data: { sociedadId, usuarioId, desde: ahora, motivo: previas === 0 ? MOTIVO_CARGA_INICIAL : MOTIVO_CAMBIO_LISTA },
    });
    await tx.sociedad.update({ where: { id: sociedadId }, data: { tesoreroId: usuarioId } });
    return previas === 0 ? "inicial" : "cambio";
  });
}
