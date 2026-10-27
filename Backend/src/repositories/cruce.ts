// Acceso a la base del motor de cruce (única capa que usa Prisma). Lee solo lo necesario: nunca devuelve la
// descripción de un movimiento fuera del motor, y los archivos retirados de la carpeta no cuentan en ningún caso.
import { prisma } from "../db.js";
import type { CuentaCorte } from "../domain/cobertura-corte.js";
import type { MovimientoCruce, ObligacionCruce, ResultadoCruce, VencimientoCruce } from "../domain/cruce.js";

export interface VencimientoGuardado extends VencimientoCruce {
  estado: string;
  movimientoId: number | null;
  motivo: string | null;
  diferenciaDias: number | null;
  sinInfoHasta: Date | null;
}

export interface DatosCruce {
  obligaciones: ObligacionCruce[];
  vencimientos: VencimientoGuardado[];
  movimientos: MovimientoCruce[];
  cuentas: Map<number, CuentaCorte[]>;
}

/** Obligaciones activas con sus vencimientos, los débitos de archivos vigentes y la cobertura de cada cuenta. */
export async function cargarDatosCruce(): Promise<DatosCruce> {
  const [obligaciones, vencimientos, movimientos, archivos, ultimas] = await Promise.all([
    prisma.obligacion.findMany({ where: { activa: true }, select: { id: true, sociedadId: true, proveedor: true, identificador: true } }),
    prisma.vencimiento.findMany({
      where: { obligacion: { activa: true } },
      select: { id: true, obligacionId: true, sociedadId: true, fecha: true, estado: true, movimientoId: true, motivo: true, diferenciaDias: true, sinInfoHasta: true },
    }),
    prisma.movimiento.findMany({
      where: { debito: { gt: 0n }, archivo: { retiradoEn: null } },
      select: { id: true, fecha: true, descripcion: true, cuenta: { select: { sociedadId: true } } },
    }),
    prisma.archivoImportado.findMany({
      where: { estado: "leido", retiradoEn: null, cuentaId: { not: null }, mes: { not: null } },
      select: { cuentaId: true, mes: true, cuenta: { select: { sociedadId: true } } },
    }),
    prisma.movimiento.groupBy({ by: ["cuentaId", "periodo"], where: { archivo: { retiradoEn: null } }, _max: { fecha: true } }),
  ]);

  const ultima = new Map(ultimas.map((u) => [`${u.cuentaId}|${u.periodo}`, u._max.fecha]));
  const porCuenta = new Map<number, { sociedadId: number; corte: CuentaCorte }>();
  for (const a of archivos) {
    const cuentaId = a.cuentaId!;
    const c = porCuenta.get(cuentaId) ?? { sociedadId: a.cuenta!.sociedadId, corte: { cuentaId, meses: new Map() } };
    c.corte.meses.set(a.mes!, ultima.get(`${cuentaId}|${a.mes}`) ?? null);
    porCuenta.set(cuentaId, c);
  }
  const cuentas = new Map<number, CuentaCorte[]>();
  for (const { sociedadId, corte } of porCuenta.values()) cuentas.set(sociedadId, [...(cuentas.get(sociedadId) ?? []), corte]);

  return {
    obligaciones,
    vencimientos,
    movimientos: movimientos.map((m) => ({ id: m.id, sociedadId: m.cuenta.sociedadId, fecha: m.fecha, descripcion: m.descripcion })),
    cuentas,
  };
}

const mismaFecha = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Guarda solo los resultados que cambian (idempotente). Devuelve cuántos vencimientos cambiaron. */
export async function guardarResultadosCruce(actuales: VencimientoGuardado[], resultados: ResultadoCruce[]): Promise<number> {
  const previo = new Map(actuales.map((v) => [v.id, v]));
  const cambios = resultados.filter((r) => {
    const v = previo.get(r.vencimientoId)!;
    return v.estado !== r.estado || v.movimientoId !== r.movimientoId || v.motivo !== r.motivo || v.diferenciaDias !== r.diferenciaDias || !mismaFecha(v.sinInfoHasta, r.sinInfoHasta);
  });
  for (let i = 0; i < cambios.length; i += 200) {
    await prisma.$transaction(
      cambios.slice(i, i + 200).map((r) =>
        prisma.vencimiento.update({
          where: { id: r.vencimientoId },
          data: { estado: r.estado, movimientoId: r.movimientoId, motivo: r.motivo, diferenciaDias: r.diferenciaDias, sinInfoHasta: r.sinInfoHasta },
        }),
      ),
    );
  }
  return cambios.length;
}
