import { prisma } from "../db.js";
import type { MovimientoLeido } from "../ingest/tipos.js";

export async function asegurarSociedad(codigo: string) {
  return prisma.sociedad.upsert({ where: { codigo }, create: { codigo }, update: {} });
}

export interface DatosCuenta {
  sociedadId: number;
  numero: string;
  codigoBanco: string | null;
  formato: string;
  bancoArchivo: string | null;
  moneda: "CRC" | "USD" | null;
  monedaPorConfirmar: boolean;
}

/**
 * Crea o actualiza la cuenta. Lo que Tesorería editó a mano no se pisa:
 * el banco solo se rellena si está vacío o "por confirmar"; la moneda, solo si sigue "por confirmar".
 */
export async function guardarCuenta(d: DatosCuenta) {
  const actual = await prisma.cuenta.findUnique({ where: { sociedadId_numero: { sociedadId: d.sociedadId, numero: d.numero } } });
  if (!actual) {
    return prisma.cuenta.create({
      data: {
        sociedadId: d.sociedadId, numero: d.numero, codigoBanco: d.codigoBanco, formato: d.formato,
        banco: d.bancoArchivo, bancoPorConfirmar: true,
        moneda: d.moneda, monedaPorConfirmar: d.monedaPorConfirmar,
      },
    });
  }
  const data: Record<string, unknown> = { formato: d.formato, codigoBanco: d.codigoBanco ?? actual.codigoBanco };
  if (actual.bancoPorConfirmar && d.bancoArchivo) data.banco = d.bancoArchivo;
  if (actual.monedaPorConfirmar) {
    data.moneda = d.moneda ?? actual.moneda;
    data.monedaPorConfirmar = d.monedaPorConfirmar;
  }
  return prisma.cuenta.update({ where: { id: actual.id }, data });
}

export async function buscarCuenta(sociedadId: number, numero: string) {
  return prisma.cuenta.findUnique({ where: { sociedadId_numero: { sociedadId, numero } } });
}

export async function actualizarCuentaManual(id: number, datos: { banco?: string; moneda?: "CRC" | "USD" }) {
  const data: Record<string, unknown> = {};
  if (datos.banco !== undefined) { data.banco = datos.banco; data.bancoPorConfirmar = false; }
  if (datos.moneda !== undefined) { data.moneda = datos.moneda; data.monedaPorConfirmar = false; }
  return prisma.cuenta.update({ where: { id }, data });
}

export async function buscarArchivoPorRuta(ruta: string) {
  return prisma.archivoImportado.findUnique({ where: { ruta } });
}

export interface ArchivoParaGuardar {
  ruta: string;
  hash: string;
  formato: string | null;
  sociedadId: number | null;
  cuentaId: number | null;
  mes: string | null;
}

export async function guardarArchivoConError(a: ArchivoParaGuardar, error: string, detalle: unknown) {
  const datos = { ...a, estado: "error", error, detalle: JSON.stringify(detalle), leidoEn: new Date(), numMovimientos: 0, numDuplicados: 0 };
  return prisma.archivoImportado.upsert({ where: { ruta: a.ruta }, create: datos, update: datos });
}

export class ArchivoConConciliaciones extends Error {}

/**
 * Reemplaza los movimientos del archivo (primera importación o reimportación por cambio de hash).
 * Los que ya existan en OTRO archivo de la misma cuenta (misma clave) se omiten y se cuentan.
 * Si el archivo ya tiene conciliaciones sobre sus movimientos no se reimporta (revisión humana).
 */
export async function guardarArchivoLeido(
  a: ArchivoParaGuardar & { cuentaId: number },
  movs: (MovimientoLeido & { claveDedup: string })[],
  extra: { moneda: string | null; detalle: unknown },
): Promise<{ insertados: number; duplicados: number }> {
  return prisma.$transaction(async (tx) => {
    const previo = await tx.archivoImportado.findUnique({ where: { ruta: a.ruta } });
    if (previo) {
      const conc = await tx.conciliacion.count({ where: { movimiento: { archivoId: previo.id } } });
      if (conc > 0) throw new ArchivoConConciliaciones("El archivo cambió pero tiene conciliaciones: requiere revisión humana antes de reimportar");
      await tx.movimiento.deleteMany({ where: { archivoId: previo.id } });
    }
    const existentes = new Set<string>();
    for (let i = 0; i < movs.length; i += 500) {
      const lote = movs.slice(i, i + 500).map((m) => m.claveDedup);
      const filas = await tx.movimiento.findMany({ where: { claveDedup: { in: lote } }, select: { claveDedup: true } });
      for (const f of filas) existentes.add(f.claveDedup);
    }
    const nuevos = movs.filter((m) => !existentes.has(m.claveDedup));
    const datos = {
      ...a, estado: "leido", error: null, leidoEn: new Date(),
      numMovimientos: movs.length, numDuplicados: movs.length - nuevos.length,
      detalle: JSON.stringify(extra.detalle),
    };
    const archivo = await tx.archivoImportado.upsert({ where: { ruta: a.ruta }, create: datos, update: datos });
    for (let i = 0; i < nuevos.length; i += 200) {
      await tx.movimiento.createMany({
        data: nuevos.slice(i, i + 200).map((m) => ({
          cuentaId: a.cuentaId, archivoId: archivo.id, hoja: m.hoja, fila: m.fila, periodo: a.mes ?? "",
          fecha: m.fecha, referencia: m.referencia, codigo: m.codigo, descripcion: m.descripcion,
          debito: m.debito, credito: m.credito, saldo: m.saldo, moneda: extra.moneda, claveDedup: m.claveDedup,
        })),
      });
    }
    return { insertados: nuevos.length, duplicados: movs.length - nuevos.length };
  });
}
