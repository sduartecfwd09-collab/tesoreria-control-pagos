import { prisma } from "../db.js";
import type { MovimientoLeido } from "../ingest/tipos.js";

/**
 * Sociedad ya existente cuya abreviatura coincide con el nombre de la carpeta. Nunca crea nada: el importador
 * solo asigna a sociedades que ya existen (la asociación carpeta-sociedad es explícita, no se adivina).
 */
export async function buscarSociedadPorCodigo(codigo: string) {
  return prisma.sociedad.findUnique({ where: { codigo } });
}

/**
 * Crea la sociedad con su abreviatura y nombre largo si no existe (la abreviatura es la clave). No pisa un
 * nombre largo existente. Solo para el seed y las pruebas: el importador no puede crear sociedades.
 */
export async function sembrarSociedad(codigo: string, nombreLargo: string) {
  return prisma.sociedad.upsert({ where: { codigo }, create: { codigo, nombreLargo }, update: {} });
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

export async function buscarArchivoPorRuta(ruta: string) {
  return prisma.archivoImportado.findUnique({ where: { ruta } });
}

/**
 * Marca como retirados los archivos registrados cuya ruta ya no está en la carpeta (no se borra nada: se conservan el
 * archivo, sus movimientos y su historial). Devuelve cuántos están retirados después de esta importación.
 */
export async function marcarRetirados(rutasPresentes: string[]): Promise<number> {
  const presentes = new Set(rutasPresentes);
  const registrados = await prisma.archivoImportado.findMany({ select: { id: true, ruta: true, retiradoEn: true } });
  const ausentes = registrados.filter((a) => !presentes.has(a.ruta));
  const nuevos = ausentes.filter((a) => a.retiradoEn === null).map((a) => a.id);
  if (nuevos.length > 0) await prisma.archivoImportado.updateMany({ where: { id: { in: nuevos } }, data: { retiradoEn: new Date() } });
  return ausentes.length;
}

/** El archivo volvió a aparecer en la carpeta: deja de estar retirado. */
export async function reactivarArchivo(ruta: string) {
  await prisma.archivoImportado.update({ where: { ruta }, data: { retiradoEn: null } });
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
  const datos = { ...a, retiradoEn: null, estado: "error", motivo: null, error, detalle: JSON.stringify(detalle), leidoEn: new Date(), numMovimientos: 0, numDuplicados: 0 };
  return prisma.archivoImportado.upsert({ where: { ruta: a.ruta }, create: datos, update: datos });
}

/**
 * Registra un archivo que no se importó porque requiere una decisión humana. El motivo es un texto fijo del
 * sistema (nunca datos del archivo). Si el archivo ya tenía movimientos de una lectura anterior, no se tocan.
 */
export async function guardarArchivoEnRevision(a: ArchivoParaGuardar, motivo: string) {
  const base = { ...a, retiradoEn: null, estado: "en_revision", motivo, error: null, detalle: null, leidoEn: new Date() };
  return prisma.archivoImportado.upsert({
    where: { ruta: a.ruta },
    create: { ...base, numMovimientos: 0, numDuplicados: 0 },
    update: base,
  });
}

/**
 * Reemplaza los movimientos del archivo (primera importación o reimportación por cambio de hash).
 * Los que ya existan en OTRO archivo de la misma cuenta (misma clave) se omiten y se cuentan.
 */
export async function guardarArchivoLeido(
  a: ArchivoParaGuardar & { cuentaId: number },
  movs: (MovimientoLeido & { claveDedup: string })[],
  extra: { moneda: string | null; detalle: unknown },
): Promise<{ insertados: number; duplicados: number }> {
  return prisma.$transaction(async (tx) => {
    const previo = await tx.archivoImportado.findUnique({ where: { ruta: a.ruta } });
    if (previo) {
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
      ...a, retiradoEn: null, estado: "leido", motivo: null, error: null, leidoEn: new Date(),
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
