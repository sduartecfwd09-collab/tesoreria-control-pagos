// Decisiones manuales (asociar un pago, y más adelante justificaciones y notas de revisión). NO ofrece borrar: revertir marca la decisión como
// no vigente y deja quién, cuándo y por qué. Las funciones de escritura reciben el cliente de la transacción para guardarse junto con su línea
// del historial. Las columnas «unica…» imponen en la base una asociación vigente por (obligación, periodo) y una por pago.
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { claveObligacionPeriodo } from "../domain/asociacion.js";
import { claveUnicaJustificacionArchivo, claveUnicaJustificacionVencimiento, TIPO_JUSTIFICACION_ARCHIVO, TIPO_JUSTIFICACION_VENCIMIENTO } from "../domain/justificacion.js";
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

// --- Justificaciones (vencimientos y archivos) ---

/** La justificación vigente de un vencimiento (obligación + periodo), si la hay. */
export async function justificacionVigenteDeVencimiento(obligacionId: number, periodo: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.decisionManual.findFirst({ where: { tipo: TIPO_JUSTIFICACION_VENCIMIENTO, vigente: true, obligacionId, periodo } });
}

/** Las justificaciones vigentes de estas obligaciones y periodos (una consulta; el cruce exacto se hace en memoria). */
export async function justificacionesVigentesDeVencimientos(obligacionIds: number[], periodos: string[]) {
  if (obligacionIds.length === 0) return new Map<string, NonNullable<Awaited<ReturnType<typeof justificacionVigenteDeVencimiento>>>>();
  const filas = await prisma.decisionManual.findMany({
    where: { tipo: TIPO_JUSTIFICACION_VENCIMIENTO, vigente: true, obligacionId: { in: [...new Set(obligacionIds)] }, periodo: { in: [...new Set(periodos)] } },
  });
  return new Map(filas.map((d) => [claveObligacionPeriodo(d.obligacionId!, d.periodo!), d]));
}

export interface NuevaJustificacionVencimiento {
  sociedadId: number;
  obligacionId: number;
  periodo: string;
  /** el motivo elegido (texto fijo) */
  motivo: string;
  /** JSON corto con la clave del motivo y la nota */
  datos: string;
  autor: Autor;
}

export async function crearJustificacionVencimiento(tx: Prisma.TransactionClient, j: NuevaJustificacionVencimiento) {
  return tx.decisionManual.create({
    data: {
      tipo: TIPO_JUSTIFICACION_VENCIMIENTO, sociedadId: j.sociedadId, obligacionId: j.obligacionId, periodo: j.periodo, motivo: j.motivo, datos: j.datos,
      usuarioId: j.autor.id, nombreUsuario: j.autor.nombre, modoPruebas: j.autor.modoPruebas,
      unicaObligacionPeriodo: claveUnicaJustificacionVencimiento(j.obligacionId, j.periodo),
    },
  });
}

/** La justificación vigente de un archivo, si la hay (aunque ya no tenga efecto). */
export async function justificacionVigenteDeArchivo(archivoId: number, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.decisionManual.findFirst({ where: { tipo: TIPO_JUSTIFICACION_ARCHIVO, vigente: true, archivoId } });
}

/** Todas las justificaciones vigentes de archivos, por id de archivo (son pocas: una por archivo con problema). */
export async function justificacionesVigentesDeArchivos() {
  const filas = await prisma.decisionManual.findMany({ where: { tipo: TIPO_JUSTIFICACION_ARCHIVO, vigente: true, archivoId: { not: null } } });
  return new Map(filas.map((d) => [d.archivoId!, d]));
}

export interface NuevaJustificacionArchivo {
  /** la sociedad del archivo; nulo si su carpeta no tiene sociedad (solo Jefatura la ve) */
  sociedadId: number | null;
  archivoId: number;
  ruta: string;
  /** hash del contenido del archivo: la huella con la que se justificó */
  huella: string;
  motivo: string;
  /** JSON corto con la clave del motivo, la nota y el problema justificado */
  datos: string;
  autor: Autor;
}

export async function crearJustificacionArchivo(tx: Prisma.TransactionClient, j: NuevaJustificacionArchivo) {
  return tx.decisionManual.create({
    data: {
      tipo: TIPO_JUSTIFICACION_ARCHIVO, sociedadId: j.sociedadId, archivoId: j.archivoId, rutaArchivo: j.ruta, huella: j.huella, motivo: j.motivo, datos: j.datos,
      usuarioId: j.autor.id, nombreUsuario: j.autor.nombre, modoPruebas: j.autor.modoPruebas,
      unicaMovimiento: claveUnicaJustificacionArchivo(j.archivoId),
    },
  });
}
