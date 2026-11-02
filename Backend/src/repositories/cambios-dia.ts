// Historial de cambios del día de pago y de la fecha de un vencimiento. Solo se inserta: este módulo no ofrece edición ni borrado.
// permanente: un nuevo día de pago de la obligación desde un mes (aplicaDesde); una_vez: mueve la fecha de UN vencimiento;
// quita_mov: devuelve ese vencimiento a su fecha original. Cada función recibe la transacción para guardarse junto al historial.
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CambioDiaProgramado } from "../domain/vencimientos.js";

export async function obligacionConSociedad(id: number) {
  return prisma.obligacion.findUnique({ where: { id }, include: { sociedad: { select: { id: true, tesoreroId: true } } } });
}

/** Cambios permanentes con mes de inicio de cada obligación, de menor a mayor «desde» (a igual mes, el más reciente va al final y manda). */
export async function cambiosDiaProgramados(obligacionIds?: number[]): Promise<Map<number, CambioDiaProgramado[]>> {
  const filas = await prisma.cambioDia.findMany({
    where: { ...(obligacionIds ? { obligacionId: { in: obligacionIds } } : {}), tipo: "permanente", aplicaDesde: { not: null }, diaNuevo: { not: null } },
    orderBy: [{ aplicaDesde: "asc" }, { id: "asc" }],
    select: { obligacionId: true, aplicaDesde: true, diaNuevo: true },
  });
  const r = new Map<number, CambioDiaProgramado[]>();
  for (const f of filas) {
    const lista = r.get(f.obligacionId) ?? [];
    lista.push({ desde: f.aplicaDesde!, dia: f.diaNuevo! });
    r.set(f.obligacionId, lista);
  }
  return r;
}

/** El vencimiento del periodo de una obligación con lo que hace falta para decidir si se pregunta por el mes en curso. */
export async function vencimientoDelPeriodo(obligacionId: number, periodo: string) {
  return prisma.vencimiento.findFirst({ where: { obligacionId, periodo }, select: { id: true, fecha: true, estado: true } });
}

/** Guarda el nuevo día. Si rige desde el mes en curso (o antes) el día base cambia ya y la obligación queda como «día editado» (el importador no lo pisa). */
export async function registrarCambioPermanente(
  tx: Prisma.TransactionClient,
  c: { obligacionId: number; diaAnterior: number | null; diaNuevo: number; desde: string; motivo: string; usuarioId: number; modoPruebas: boolean; cambiaElDiaBase: boolean },
): Promise<void> {
  if (c.cambiaElDiaBase) await tx.obligacion.update({ where: { id: c.obligacionId }, data: { diaEsperadoPago: c.diaNuevo, diaEditado: true } });
  await tx.cambioDia.create({
    data: { obligacionId: c.obligacionId, tipo: "permanente", diaAnterior: c.diaAnterior, diaNuevo: c.diaNuevo, aplicaDesde: c.desde, motivo: c.motivo, usuarioId: c.usuarioId, modoPruebas: c.modoPruebas },
  });
}

/** Cuando llega el mes de un cambio programado, el día base de la obligación pasa a ser el vigente (el calendario ya lo usaba por mes). */
export async function fijarDiaBase(obligacionId: number, dia: number): Promise<void> {
  await prisma.obligacion.update({ where: { id: obligacionId }, data: { diaEsperadoPago: dia, diaEditado: true } });
}

/** Mueve la fecha de UN vencimiento (solo si sigue con la fecha que se vio). Devuelve false si otro cambio se adelantó. */
export async function registrarMovimiento(
  tx: Prisma.TransactionClient,
  c: { vencimientoId: number; obligacionId: number; fechaVista: Date; fechaNueva: Date; fechaOriginal: Date; motivo: string; usuarioId: number; modoPruebas: boolean },
): Promise<boolean> {
  const r = await tx.vencimiento.updateMany({
    where: { id: c.vencimientoId, fecha: c.fechaVista },
    data: { fecha: c.fechaNueva, fechaOriginal: c.fechaNueva.getTime() === c.fechaOriginal.getTime() ? null : c.fechaOriginal },
  });
  if (r.count === 0) return false;
  await tx.cambioDia.create({
    data: { obligacionId: c.obligacionId, vencimientoId: c.vencimientoId, tipo: "una_vez", fechaAnterior: c.fechaVista, fechaNueva: c.fechaNueva, motivo: c.motivo, usuarioId: c.usuarioId, modoPruebas: c.modoPruebas },
  });
  return true;
}

/** Devuelve el vencimiento a su fecha original (la que tenía el calendario). */
export async function registrarQuitarMovimiento(
  tx: Prisma.TransactionClient,
  c: { vencimientoId: number; obligacionId: number; fechaVista: Date; fechaOriginal: Date; motivo: string; usuarioId: number; modoPruebas: boolean },
): Promise<boolean> {
  const r = await tx.vencimiento.updateMany({ where: { id: c.vencimientoId, fecha: c.fechaVista, fechaOriginal: { not: null } }, data: { fecha: c.fechaOriginal, fechaOriginal: null } });
  if (r.count === 0) return false;
  await tx.cambioDia.create({
    data: { obligacionId: c.obligacionId, vencimientoId: c.vencimientoId, tipo: "quita_mov", fechaAnterior: c.fechaVista, fechaNueva: c.fechaOriginal, motivo: c.motivo, usuarioId: c.usuarioId, modoPruebas: c.modoPruebas },
  });
  return true;
}
