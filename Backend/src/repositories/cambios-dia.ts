// Historial de cambios del día de pago. Solo se inserta y se lee: este módulo no ofrece edición ni borrado.
import { prisma } from "../db.js";
import { ESTADOS_PAGADOS, fechaVencimiento } from "../domain/vencimientos.js";

export async function obligacionConSociedad(id: number) {
  return prisma.obligacion.findUnique({ where: { id }, include: { sociedad: { select: { id: true, tesoreroId: true } } } });
}

export async function vencimientoConSociedad(id: number) {
  return prisma.vencimiento.findUnique({
    where: { id },
    include: { obligacion: { include: { sociedad: { select: { id: true, tesoreroId: true } } } }, _count: { select: { conciliaciones: true } } },
  });
}

export interface CambioPermanente {
  obligacionId: number;
  diaAnterior: number | null;
  diaNuevo: number;
  motivo: string;
  usuarioId: number;
  hoy: Date;
}

/**
 * Cambia el día de la obligación y mueve solo sus vencimientos futuros, no pagados y sin conciliación.
 * Un vencimiento que ya se había movido «de una sola vez» conserva su fecha vigente: solo se actualiza su fecha original.
 * Los pasados y los pagados no se tocan. Todo en una transacción junto con el registro del historial.
 */
export async function registrarCambioPermanente(c: CambioPermanente): Promise<{ vencimientosMovidos: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.obligacion.update({ where: { id: c.obligacionId }, data: { diaEsperadoPago: c.diaNuevo, diaEditado: true } });
    const afectados = await tx.vencimiento.findMany({
      where: { obligacionId: c.obligacionId, fecha: { gte: c.hoy }, estado: { notIn: ESTADOS_PAGADOS }, conciliaciones: { none: {} } },
    });
    let movidos = 0;
    for (const v of afectados) {
      const nueva = fechaVencimiento(v.periodo, c.diaNuevo);
      const manual = v.fechaOriginal !== null;
      const data = { dia: c.diaNuevo, ...(manual ? { fechaOriginal: nueva.getTime() === v.fecha.getTime() ? null : nueva } : { fecha: nueva }) };
      await tx.vencimiento.update({ where: { id: v.id }, data });
      if (!manual && nueva.getTime() !== v.fecha.getTime()) movidos++;
    }
    await tx.cambioDia.create({
      data: { obligacionId: c.obligacionId, tipo: "permanente", diaAnterior: c.diaAnterior, diaNuevo: c.diaNuevo, motivo: c.motivo, usuarioId: c.usuarioId },
    });
    return { vencimientosMovidos: movidos };
  });
}

export interface CambioDeUnaVez {
  vencimientoId: number;
  obligacionId: number;
  fechaActual: Date;
  fechaOriginalActual: Date | null;
  fechaNueva: Date;
  motivo: string;
  usuarioId: number;
}

/** Mueve la fecha de un vencimiento concreto; conserva la fecha original (la primera que tuvo) y deja el registro. */
export async function registrarCambioDeUnaVez(c: CambioDeUnaVez): Promise<void> {
  const original = c.fechaOriginalActual ?? c.fechaActual;
  await prisma.$transaction(async (tx) => {
    await tx.vencimiento.update({
      where: { id: c.vencimientoId },
      data: { fecha: c.fechaNueva, fechaOriginal: original.getTime() === c.fechaNueva.getTime() ? null : original },
    });
    await tx.cambioDia.create({
      data: {
        obligacionId: c.obligacionId, vencimientoId: c.vencimientoId, tipo: "una_vez",
        fechaAnterior: c.fechaActual, fechaNueva: c.fechaNueva, motivo: c.motivo, usuarioId: c.usuarioId,
      },
    });
  });
}

export async function historialDeObligacion(obligacionId: number) {
  return prisma.cambioDia.findMany({ where: { obligacionId }, orderBy: { id: "asc" } });
}
