// Lectura del historial de cambios (solo consulta). Separada de `historial.ts`, que solo inserta. El alcance va en la consulta
// (no se filtra después en memoria): `sociedadIds` null = todas; si no, solo las líneas de esas sociedades. Aprovecha el índice
// (sociedadId, creadoEn).
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";

export interface FiltroHistorial {
  /** sociedades del alcance de la persona; null = todas */
  sociedadIds: number[] | null;
  sociedadId?: number;
  usuarioId?: number;
  campo?: string;
  desde?: Date;
  hastaExclusivo?: Date;
  pagina: number;
  porPagina: number;
}

/** Condición común de la lista y del conteo: alcance + filtros. Una sociedad pedida fuera del alcance no devuelve nada. */
function condicion(f: FiltroHistorial): Prisma.HistorialCambioWhereInput {
  let sociedad: Prisma.HistorialCambioWhereInput["sociedadId"];
  if (f.sociedadId !== undefined) sociedad = f.sociedadIds === null || f.sociedadIds.includes(f.sociedadId) ? f.sociedadId : { in: [] };
  else if (f.sociedadIds !== null) sociedad = { in: f.sociedadIds };
  return {
    ...(sociedad !== undefined ? { sociedadId: sociedad } : {}),
    ...(f.usuarioId !== undefined ? { usuarioId: f.usuarioId } : {}),
    ...(f.campo !== undefined ? { campo: f.campo } : {}),
    ...(f.desde || f.hastaExclusivo ? { creadoEn: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hastaExclusivo ? { lt: f.hastaExclusivo } : {}) } } : {}),
  };
}

/** Una página, del más reciente al más antiguo (a igual fecha, el de id mayor), con el total del filtro. */
export async function listarHistorial(f: FiltroHistorial) {
  const where = condicion(f);
  const [total, filas] = await Promise.all([
    prisma.historialCambio.count({ where }),
    prisma.historialCambio.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
      include: {
        sociedad: { select: { nombreLargo: true } },
        obligacion: { select: { proveedor: true, identificador: true, categoria: { select: { nombre: true } } } },
      },
    }),
  ]);
  // las líneas de un archivo no tienen obligación: se ubican por el archivo (solo su nombre, el mes y la cuenta; el que arma la respuesta enmascara)
  const idsArchivo = [...new Set(filas.filter((h) => h.entidad === "archivo").map((h) => h.entidadId))];
  const archivos = idsArchivo.length === 0 ? [] : await prisma.archivoImportado.findMany({ where: { id: { in: idsArchivo } }, select: { id: true, ruta: true, mes: true, cuenta: { select: { numero: true } } } });
  return { total, filas, archivos: new Map(archivos.map((a) => [a.id, a])) };
}

/** Lo que existe DENTRO del alcance, para que los filtros no ofrezcan opciones vacías ni ajenas. */
export async function opcionesDeHistorial(sociedadIds: number[] | null) {
  const where: Prisma.HistorialCambioWhereInput = sociedadIds === null ? {} : { sociedadId: { in: sociedadIds } };
  const [sociedades, personas, campos] = await Promise.all([
    prisma.historialCambio.findMany({ where, distinct: ["sociedadId"], select: { sociedad: { select: { id: true, nombreLargo: true } } } }),
    // el nombre guardado más reciente de cada persona (el de la línea, no el actual del usuario)
    prisma.historialCambio.findMany({ where, distinct: ["usuarioId"], orderBy: { id: "desc" }, select: { usuarioId: true, nombreUsuario: true } }),
    prisma.historialCambio.findMany({ where, distinct: ["campo"], select: { campo: true } }),
  ]);
  return {
    // lo que no tiene sociedad (p. ej. un archivo cuya carpeta no la tiene) no es una opción del filtro de sociedad
    sociedades: sociedades.flatMap((s) => (s.sociedad ? [{ id: s.sociedad.id, nombre: s.sociedad.nombreLargo }] : [])),
    personas: personas.map((p) => ({ id: p.usuarioId, nombre: p.nombreUsuario })),
    campos: campos.map((c) => c.campo),
  };
}
