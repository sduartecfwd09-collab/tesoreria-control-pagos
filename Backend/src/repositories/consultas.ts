import { prisma } from "../db.js";

export interface ArchivoFila {
  id: number;
  ruta: string;
  sociedad: string | null;
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
  detalle: unknown;
  leidoEn: Date | null;
}

export async function listarArchivos(): Promise<ArchivoFila[]> {
  const filas = await prisma.archivoImportado.findMany({
    include: { sociedad: true, cuenta: true },
    orderBy: { ruta: "asc" },
  });
  return filas.map((a) => ({
    id: a.id, ruta: a.ruta, sociedad: a.sociedad?.codigo ?? null,
    cuentaId: a.cuentaId, cuenta: a.cuenta?.numero ?? null,
    banco: a.cuenta?.banco ?? null, bancoPorConfirmar: a.cuenta?.bancoPorConfirmar ?? null,
    moneda: a.cuenta?.moneda ?? null, monedaPorConfirmar: a.cuenta?.monedaPorConfirmar ?? null,
    formato: a.formato, mes: a.mes, estado: a.estado,
    numMovimientos: a.numMovimientos, numDuplicados: a.numDuplicados, error: a.error,
    detalle: a.detalle ? safeJson(a.detalle) : null, leidoEn: a.leidoEn,
  }));
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export interface FiltroMovimientos {
  sociedad?: string;
  cuenta?: string;
  periodo?: string;
  pagina: number;
  porPagina: number;
}

export async function listarMovimientos(f: FiltroMovimientos) {
  const where = {
    ...(f.periodo ? { periodo: f.periodo } : {}),
    cuenta: {
      ...(f.cuenta ? { numero: f.cuenta } : {}),
      ...(f.sociedad ? { sociedad: { codigo: f.sociedad } } : {}),
    },
  };
  const [total, filas] = await Promise.all([
    prisma.movimiento.count({ where }),
    prisma.movimiento.findMany({
      where,
      include: { cuenta: { include: { sociedad: true } }, archivo: { select: { ruta: true } } },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
    }),
  ]);
  return {
    total,
    datos: filas.map((m) => ({
      id: m.id,
      sociedad: m.cuenta.sociedad.codigo,
      cuenta: m.cuenta.numero,
      moneda: m.moneda,
      periodo: m.periodo,
      fecha: m.fecha.toISOString().slice(0, 10),
      referencia: m.referencia,
      codigo: m.codigo,
      descripcion: m.descripcion,
      debito: m.debito,
      credito: m.credito,
      saldo: m.saldo,
      archivo: m.archivo.ruta,
      hoja: m.hoja,
      fila: m.fila,
    })),
  };
}

export async function contarMovimientosPorArchivo(): Promise<Map<number, number>> {
  const g = await prisma.movimiento.groupBy({ by: ["archivoId"], _count: { _all: true } });
  return new Map(g.map((x) => [x.archivoId, x._count._all]));
}

export async function totalMovimientos() {
  return prisma.movimiento.count();
}

export async function listarCuentas() {
  return prisma.cuenta.findMany({ include: { sociedad: true }, orderBy: [{ sociedadId: "asc" }, { numero: "asc" }] });
}
