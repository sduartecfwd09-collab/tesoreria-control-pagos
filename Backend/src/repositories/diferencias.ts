// Acceso a datos de «Diferencias con el Excel»: las obligaciones con lo mínimo para comparar, las sociedades y categorías para resolver las filas
// del Excel, y las decisiones (DecisionManual de tipo «diferencia_excel»). NO guarda nada del Excel: lo que el Excel dice se lee del archivo.
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { TIPO_DECISION_DIFERENCIA, type ObligacionDif } from "../domain/diferencias-excel.js";
import { ESTADOS_PAGADOS } from "../domain/vencimientos.js";
import type { AutorDelCambio } from "./historial.js";

export async function obligacionesParaDiferencias(): Promise<ObligacionDif[]> {
  const filas = await prisma.obligacion.findMany({
    select: {
      id: true, sociedadId: true, categoriaId: true, proveedor: true, identificador: true, diaEsperadoPago: true, diaEditado: true, frecuencia: true, activa: true, origen: true,
      vencimientos: { where: { estado: { in: ESTADOS_PAGADOS } }, take: 1, select: { id: true } },
    },
    orderBy: { id: "asc" },
  });
  return filas.map(({ diaEsperadoPago, vencimientos, ...o }) => ({ ...o, dia: diaEsperadoPago, conPagos: vencimientos.length > 0 }));
}

export async function sociedadesParaResolver() {
  return prisma.sociedad.findMany({ select: { id: true, codigo: true, nombreLargo: true, tesoreroId: true } });
}

export async function categoriasParaResolver() {
  return prisma.categoria.findMany({ select: { id: true, nombre: true } });
}

export async function decisionesDeDiferencias() {
  return prisma.decisionManual.findMany({ where: { tipo: TIPO_DECISION_DIFERENCIA, vigente: true } });
}

export interface NuevaDecisionDiferencia {
  sociedadId: number;
  obligacionId: number;
  clave: string;
  huella: string;
  motivo: string;
  datos: string;
  autor: AutorDelCambio;
}

export async function crearDecisionDiferencia(tx: Prisma.TransactionClient, d: NuevaDecisionDiferencia) {
  return tx.decisionManual.create({
    data: {
      tipo: TIPO_DECISION_DIFERENCIA, sociedadId: d.sociedadId, obligacionId: d.obligacionId, motivo: d.motivo, datos: d.datos, huella: d.huella,
      usuarioId: d.autor.id, nombreUsuario: d.autor.nombre, modoPruebas: d.autor.modoPruebas, unicaObligacionPeriodo: d.clave,
    },
  });
}

/** La decisión vigente con esa clave única, si la hay (dentro de la transacción). */
export async function decisionVigenteDeClave(tx: Prisma.TransactionClient, clave: string) {
  return tx.decisionManual.findFirst({ where: { tipo: TIPO_DECISION_DIFERENCIA, vigente: true, unicaObligacionPeriodo: clave } });
}

export async function obligacionParaDesactivar(tx: Prisma.TransactionClient, id: number) {
  return tx.obligacion.findUnique({ where: { id } });
}
