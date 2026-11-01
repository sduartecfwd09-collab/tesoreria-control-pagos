// Decisiones manuales (asociar un pago, y más adelante justificaciones y notas de revisión). NO ofrece borrar: revertir marca la decisión como
// no vigente y deja quién, cuándo y por qué. Las funciones de escritura reciben el cliente de la transacción para guardarse junto con su línea
// del historial. Las columnas «unica…» imponen en la base una asociación vigente por (obligación, periodo) y una por pago.
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { claveObligacionPeriodo } from "../domain/asociacion.js";
import type { AutorDelCambio } from "./historial.js";

export const TIPO_ASOCIACION_PAGO = "asociacion_pago";

type Autor = AutorDelCambio;

/** La asociación vigente de un vencimiento (obligación + periodo), si la hay. */
export async function asociacionVigente(obligacionId: number, periodo: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.decisionManual.findFirst({ where: { tipo: TIPO_ASOCIACION_PAGO, vigente: true, obligacionId, periodo } });
}

/** Las asociaciones vigentes de estas obligaciones y periodos (una consulta; el cruce exacto se hace en memoria). */
export async function asociacionesVigentesDe(obligacionIds: number[], periodos: string[]) {
  if (obligacionIds.length === 0) return new Map<string, Awaited<ReturnType<typeof asociacionVigente>> & object>();
  const filas = await prisma.decisionManual.findMany({
    where: { tipo: TIPO_ASOCIACION_PAGO, vigente: true, obligacionId: { in: [...new Set(obligacionIds)] }, periodo: { in: [...new Set(periodos)] } },
  });
  return new Map(filas.map((d) => [claveObligacionPeriodo(d.obligacionId!, d.periodo!), d]));
}

/** Huellas de los pagos que ya tienen una asociación vigente (no se vuelven a ofrecer). */
export async function huellasAsociadas(): Promise<string[]> {
  const filas = await prisma.decisionManual.findMany({ where: { tipo: TIPO_ASOCIACION_PAGO, vigente: true, claveMovimiento: { not: null } }, select: { claveMovimiento: true } });
  return filas.map((f) => f.claveMovimiento!);
}

export interface NuevaAsociacion {
  sociedadId: number;
  obligacionId: number;
  periodo: string;
  movimientoId: number;
  claveMovimiento: string;
  motivo: string;
  autor: Autor;
}

export async function crearAsociacion(tx: Prisma.TransactionClient, a: NuevaAsociacion) {
  return tx.decisionManual.create({
    data: {
      tipo: TIPO_ASOCIACION_PAGO, sociedadId: a.sociedadId, obligacionId: a.obligacionId, periodo: a.periodo,
      movimientoId: a.movimientoId, claveMovimiento: a.claveMovimiento, motivo: a.motivo,
      usuarioId: a.autor.id, nombreUsuario: a.autor.nombre, modoPruebas: a.autor.modoPruebas,
      unicaObligacionPeriodo: claveObligacionPeriodo(a.obligacionId, a.periodo), unicaMovimiento: a.claveMovimiento,
    },
  });
}

/** Revierte una decisión vigente: queda como no vigente con quién, cuándo y por qué; las columnas únicas se liberan. */
export async function revertirDecision(tx: Prisma.TransactionClient, id: number, motivo: string, autor: Autor) {
  const r = await tx.decisionManual.updateMany({
    where: { id, vigente: true },
    data: { vigente: false, unicaObligacionPeriodo: null, unicaMovimiento: null, revertidaPorId: autor.id, nombreRevierte: autor.nombre, revertidaEn: new Date(), motivoReversion: motivo },
  });
  return r.count === 1;
}
