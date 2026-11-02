import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enmascararCuenta, enmascararIdentificador, nombreDeArchivoSeguro, textoSeguro } from "../domain/enmascarar.js";
import { HISTORIAL_POR_PAGINA_DEFECTO, HISTORIAL_POR_PAGINA_MAXIMO, limitesDeDias } from "../domain/historial.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { esFechaIso } from "../domain/vencimientos.js";
import { alcanceDe, alcanceParaRespuesta, sociedadesDelAlcance } from "../identidad/alcance.js";
import { exigirPersona } from "../identidad/exigir-persona.js";
import { listarHistorial, opcionesDeHistorial } from "../repositories/historial-lectura.js";
import { valorGlobal } from "../repositories/parametros.js";

const fecha = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM-DD)` }).refine(esFechaIso, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe ser una fecha válida con el formato AAAA-MM-DD (por ejemplo 2026-08-15)`);
const entero = (mensaje: string) => z.coerce.number({ error: mensaje }).int(mensaje).positive(mensaje);

const consulta = z.object({
  desde: fecha("la fecha inicial").optional(),
  hasta: fecha("la fecha final").optional(),
  sociedadId: entero("La sociedad debe ser un número").optional(),
  usuarioId: entero("La persona debe ser un número").optional(),
  campo: z.string().trim().min(1).max(50, "El tipo de dato no es válido").optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(HISTORIAL_POR_PAGINA_MAXIMO, `Se pueden pedir como máximo ${HISTORIAL_POR_PAGINA_MAXIMO} por página`).optional(),
}).refine((c) => !c.desde || !c.hasta || c.desde <= c.hasta, { message: "La fecha inicial no puede ser posterior a la final" });

/** Tamaño de página por defecto: el parámetro `historial_por_pagina`; si falta o no vale, el respaldo del código. */
async function porPaginaPorDefecto(): Promise<number> {
  const n = Number(await valorGlobal("historial_por_pagina"));
  return Number.isInteger(n) && n >= 1 && n <= HISTORIAL_POR_PAGINA_MAXIMO ? n : HISTORIAL_POR_PAGINA_DEFECTO;
}

/**
 * Historial de cambios (solo lectura, privado). Sin persona identificada, 401. Jefatura ve todas las líneas; un Tesorero, las de las
 * sociedades de las que es tesorero vigente (el historial completo de la sociedad, incluso lo hecho por otra persona o antes de su
 * asignación). Las fechas futuras no existen: «hasta» se recorta a hoy. Una fila por dato cambiado, sin agrupar. Nunca incluye montos, cuentas ni identificadores completos.
 */
export async function rutasHistorialCambios(app: FastifyInstance, opts: { modoPruebas: boolean; reloj: Reloj }) {
  app.get("/api/historial-cambios", async (req, reply) => {
    const persona = await exigirPersona(req, reply, opts.modoPruebas);
    if (!persona) return reply;
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });

    // el historial es el pasado: un «hasta» posterior a hoy (día de Costa Rica) se recorta a hoy, como el selector de la pantalla
    const hoy = hoyDe(opts.reloj).toISOString().slice(0, 10);
    const hasta = q.data.hasta !== undefined && q.data.hasta > hoy ? hoy : q.data.hasta;
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const sociedadIds = await sociedadesDelAlcance(alcance);
    const porPagina = q.data.porPagina ?? (await porPaginaPorDefecto());
    const [{ total, filas, archivos }, opciones] = await Promise.all([
      listarHistorial({
        sociedadIds, sociedadId: q.data.sociedadId, usuarioId: q.data.usuarioId, campo: q.data.campo,
        ...limitesDeDias(q.data.desde, hasta), pagina: q.data.pagina, porPagina,
      }),
      opcionesDeHistorial(sociedadIds),
    ]);
    return {
      datos: filas.map((h) => ({
        id: h.id,
        creadoEn: h.creadoEn.toISOString(),
        sociedad: h.sociedad?.nombreLargo ?? null, // null = sin sociedad (solo Jefatura lo ve)
        obligacion: h.obligacion ? { proveedor: h.obligacion.proveedor, categoria: h.obligacion.categoria.nombre, identificador: enmascararIdentificador(h.obligacion.identificador) } : null,
        // un archivo (justificación de un archivo): su mes, la cuenta con los últimos 4 y solo el nombre del archivo; nunca la ruta
        archivo: h.entidad === "archivo" ? archivoParaRespuesta(archivos.get(h.entidadId)) : null,
        accion: h.accion,
        campo: h.campo,
        antes: h.antes,
        despues: h.despues,
        motivo: textoSeguro(h.motivo), // texto libre de la persona: sin números largos
        nombreUsuario: h.nombreUsuario,
        modoPruebas: h.modoPruebas,
      })),
      opciones,
      alcance: alcanceParaRespuesta(alcance),
      total,
      pagina: q.data.pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
    };
  });
}

function archivoParaRespuesta(a: { ruta: string; mes: string | null; cuenta: { numero: string } | null } | undefined) {
  return a ? { nombre: nombreDeArchivoSeguro(a.ruta), mes: a.mes, cuenta: a.cuenta ? enmascararCuenta(a.cuenta.numero) : null } : { nombre: null, mes: null, cuenta: null };
}
