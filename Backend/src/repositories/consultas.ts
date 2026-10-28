import { prisma } from "../db.js";
import { aNumero } from "../domain/montos.js";
import { etiquetaSociedad } from "../domain/sociedades.js";

export interface ArchivoFila {
  id: number;
  ruta: string;
  sociedad: string | null;
  sociedadId: number | null;
  cuentaId: number | null;
  cuenta: string | null;
  banco: string | null;
  bancoPorConfirmar: boolean | null;
  moneda: string | null;
  monedaPorConfirmar: boolean | null;
  formato: string | null;
  mes: string | null;
  estado: string;
  numMovimientos: number;
  numDuplicados: number;
  error: string | null;
  motivo: string | null;
  detalle: unknown;
  leidoEn: Date | null;
  /** el archivo ya no está en la carpeta: no cuenta en totales, cobertura ni cruce */
  retiradoEn: Date | null;
}

export async function listarArchivos(): Promise<ArchivoFila[]> {
  const filas = await prisma.archivoImportado.findMany({
    include: { sociedad: true, cuenta: true },
    orderBy: { ruta: "asc" },
  });
  return filas.map((a) => ({
    id: a.id, ruta: a.ruta, sociedadId: a.sociedadId, sociedad: a.sociedad ? etiquetaSociedad(a.sociedad) : null,
    cuentaId: a.cuentaId, cuenta: a.cuenta?.numero ?? null,
    banco: a.cuenta?.banco ?? null, bancoPorConfirmar: a.cuenta?.bancoPorConfirmar ?? null,
    moneda: a.cuenta?.moneda ?? null, monedaPorConfirmar: a.cuenta?.monedaPorConfirmar ?? null,
    formato: a.formato, mes: a.mes, estado: a.estado,
    numMovimientos: a.numMovimientos, numDuplicados: a.numDuplicados, error: a.error, motivo: a.motivo,
    detalle: a.detalle ? safeJson(a.detalle) : null, leidoEn: a.leidoEn, retiradoEn: a.retiradoEn,
  }));
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function contarMovimientosPorArchivo(): Promise<Map<number, number>> {
  const g = await prisma.movimiento.groupBy({ by: ["archivoId"], _count: { _all: true } });
  return new Map(g.map((x) => [x.archivoId, x._count._all]));
}

export async function listarCuentas() {
  return prisma.cuenta.findMany({ include: { sociedad: true }, orderBy: [{ sociedadId: "asc" }, { numero: "asc" }] });
}

export interface FechasPorSociedadMes {
  sociedad: string;
  mes: string; // AAAA-MM del archivo
  movimientos: number;
  fechaMinima: string;
  fechaMaxima: string;
  /** movimientos con fecha a mas de un dia de distancia del mes del archivo */
  fueraDeTolerancia: number;
  /** mayor distancia (en dias) entre una fecha y el mes del archivo; 0 si todas caen dentro */
  desvioMaximoDias: number;
}

/**
 * Agregados de Movimiento.fecha por sociedad y mes del archivo (Movimiento.periodo). Solo devuelve fechas y
 * conteos: nunca montos, cuentas, descripciones ni nombres. El desvio es cuantos dias queda una fecha fuera
 * del mes del archivo (0 si esta dentro); la tolerancia es de un dia.
 */
export async function fechasPorSociedadYMes(): Promise<FechasPorSociedadMes[]> {
  const filas = await prisma.$queryRaw<
    { sociedad: string; mes: string; movimientos: bigint; minima: string; maxima: string; fuera: bigint | null; desvio: bigint | number | null }[]
  >`
    SELECT t.sociedad AS sociedad, t.periodo AS mes, COUNT(*) AS movimientos,
           DATE_FORMAT(MIN(t.dia), '%Y-%m-%d') AS minima, DATE_FORMAT(MAX(t.dia), '%Y-%m-%d') AS maxima,
           SUM(t.desvio > 1) AS fuera, MAX(t.desvio) AS desvio
    FROM (
      SELECT COALESCE(s.codigo, CONCAT('sociedad-', s.id)) AS sociedad, m.periodo AS periodo, DATE(m.fecha) AS dia,
             GREATEST(
               DATEDIFF(STR_TO_DATE(CONCAT(m.periodo, '-01'), '%Y-%m-%d'), DATE(m.fecha)),
               DATEDIFF(DATE(m.fecha), LAST_DAY(STR_TO_DATE(CONCAT(m.periodo, '-01'), '%Y-%m-%d'))),
               0
             ) AS desvio
      FROM Movimiento m
      JOIN ArchivoImportado a ON a.id = m.archivoId AND a.retiradoEn IS NULL
      JOIN Cuenta c ON c.id = m.cuentaId
      JOIN Sociedad s ON s.id = c.sociedadId
    ) t
    GROUP BY t.sociedad, t.periodo
    ORDER BY t.sociedad, t.periodo
  `;
  return filas.map((f) => ({
    sociedad: f.sociedad, mes: f.mes, movimientos: Number(f.movimientos), fechaMinima: f.minima, fechaMaxima: f.maxima,
    fueraDeTolerancia: Number(f.fuera ?? 0), desvioMaximoDias: Number(f.desvio ?? 0),
  }));
}
