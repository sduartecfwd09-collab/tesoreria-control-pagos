import { stat } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { hayImportacionCatalogoEnCurso, importarCatalogo } from "../catalogo/importar.js";
import {
  CAMPOS_EDITABLES, calidadCatalogo, errorMesArranque, esquemaAlta, esquemaEdicion, etiquetasDe,
  identificadoresRepetidos, primerError, type ObligacionCalidad,
} from "../domain/obligaciones.js";
import { FRECUENCIAS } from "../domain/parametros.js";
import { ErrorLectura } from "../ingest/lector.js";
import {
  actualizarObligacion, buscarPorClave, crearObligacion, listarCategorias, listarObligaciones, listarSociedades,
  obtenerCategoria, obtenerCuenta, obtenerObligacion, obtenerSociedadPorCodigo, todasLasObligaciones,
  type ObligacionCompleta,
} from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";

const consulta = z.object({
  sociedad: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  activa: z.enum(["true", "false"], { error: "«activa» debe ser true o false" }).transform((v) => v === "true").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  falta: z.enum(["monto", "cuenta", "responsable", "dia"], { error: "«falta» debe ser monto, cuenta, responsable o dia" }).optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(500, "Se pueden pedir como máximo 500 por página").default(50),
});

const idParam = z.coerce.number().int().positive();

const aCalidad = (o: ObligacionCompleta): ObligacionCalidad => ({ ...o, sociedad: o.sociedad.codigo });

function aDto(o: ObligacionCompleta, repetidos: ReturnType<typeof identificadoresRepetidos>) {
  return {
    id: o.id,
    sociedadId: o.sociedadId, sociedad: o.sociedad.codigo,
    categoriaId: o.categoriaId, categoria: o.categoria.nombre,
    proveedor: o.proveedor, identificador: o.identificador,
    diaEsperadoPago: o.diaEsperadoPago, diaEditado: o.diaEditado,
    frecuencia: o.frecuencia, frecuenciaPorConfirmar: o.frecuenciaPorConfirmar, mesArranque: o.mesArranque,
    montoEsperado: o.montoEsperado, moneda: o.moneda, monedaPorConfirmar: o.monedaPorConfirmar,
    cuentaEsperada: o.cuentaEsperada ? { id: o.cuentaEsperada.id, numero: o.cuentaEsperada.numero, banco: o.cuentaEsperada.banco } : null,
    responsable: o.responsable, activa: o.activa, origen: o.origen,
    actualizado: o.actualizado.toISOString(),
    etiquetas: etiquetasDe(aCalidad(o), repetidos),
  };
}

async function repetidosActuales() {
  return identificadoresRepetidos((await todasLasObligaciones()).map(aCalidad));
}

/** La cuenta debe existir y ser de la misma sociedad. Devuelve el mensaje de error o null. */
async function errorCuenta(cuentaId: number | null | undefined, sociedadId: number): Promise<string | null> {
  if (cuentaId == null) return null;
  const c = await obtenerCuenta(cuentaId);
  if (!c) return "La cuenta de pago no existe";
  if (c.sociedadId !== sociedadId) return "La cuenta de pago pertenece a otra sociedad";
  return null;
}

const invalido = (reply: FastifyReply, error: string, campo?: string) => reply.code(422).send({ error, ...(campo ? { campo } : {}) });

export async function rutasObligaciones(app: FastifyInstance) {
  app.get("/api/sociedades", async () => {
    const s = await listarSociedades();
    return { datos: s.map((x) => ({ id: x.id, codigo: x.codigo, nombre: x.nombre, obligaciones: x._count.obligaciones, cuentas: x._count.cuentas })) };
  });

  app.get("/api/categorias", async () => {
    const c = await listarCategorias();
    return { datos: c.map((x) => ({ id: x.id, nombre: x.nombre, obligaciones: x._count.obligaciones })) };
  });

  app.get("/api/obligaciones", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const [{ total, datos }, repetidos] = await Promise.all([listarObligaciones(q.data), repetidosActuales()]);
    return {
      datos: datos.map((o) => aDto(o, repetidos)),
      total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
    };
  });

  app.get("/api/obligaciones/resumen", async () => {
    const [obs, sociedades] = await Promise.all([todasLasObligaciones(), listarSociedades()]);
    const activas = obs.filter((o) => o.activa);
    const contar = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
    return {
      datos: {
        ...calidadCatalogo(obs.map(aCalidad), sociedades.map((s) => s.codigo)),
        porSociedad: { ...Object.fromEntries(sociedades.map((s) => [s.codigo, 0])), ...contar(activas.map((o) => o.sociedad.codigo)) },
        porCategoria: contar(activas.map((o) => o.categoria.nombre)),
      },
    };
  });

  app.get("/api/obligaciones/:id", async (req, reply) => {
    const id = idParam.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const o = await obtenerObligacion(id.data);
    if (!o) return reply.code(404).send({ error: "Obligación no encontrada" });
    return { datos: aDto(o, await repetidosActuales()) };
  });

  app.post("/api/obligaciones", async (req, reply) => {
    const r = esquemaAlta.safeParse(req.body ?? {});
    if (!r.success) return reply.code(422).send(primerError(r.error));
    const d = r.data;
    const sociedad = await obtenerSociedadPorCodigo(d.sociedad);
    if (!sociedad) return invalido(reply, `La sociedad «${d.sociedad}» no existe`, "sociedad");
    if (!(await obtenerCategoria(d.categoriaId))) return invalido(reply, "La categoría no existe", "categoriaId");
    if (await buscarPorClave(sociedad.id, d.proveedor, d.identificador)) {
      return reply.code(409).send({ error: `Ya existe una obligación de ${d.proveedor} con ese identificador en ${sociedad.codigo}`, campo: "identificador" });
    }
    const defecto = (await valorGlobal("frecuencia_defecto")) ?? "mensual";
    const frecuencia = d.frecuencia ?? (FRECUENCIAS.includes(defecto) ? defecto : "mensual");
    const mes = errorMesArranque(frecuencia, d.mesArranque);
    if (mes) return invalido(reply, mes, "mesArranque");
    const cuenta = await errorCuenta(d.cuentaEsperadaId, sociedad.id);
    if (cuenta) return invalido(reply, cuenta, "cuentaEsperadaId");

    const { sociedad: _codigo, ...resto } = d;
    const o = await crearObligacion({
      ...resto,
      sociedadId: sociedad.id,
      frecuencia,
      frecuenciaPorConfirmar: d.frecuenciaPorConfirmar ?? d.frecuencia === undefined,
      monedaPorConfirmar: d.monedaPorConfirmar ?? d.moneda === undefined,
      origen: "manual",
    });
    return reply.code(201).send({ datos: aDto(o, await repetidosActuales()) });
  });

  app.patch("/api/obligaciones/:id", async (req, reply) => {
    const id = idParam.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const ajeno = Object.keys(cuerpo).find((k) => !CAMPOS_EDITABLES.includes(k));
    if (ajeno) {
      return invalido(reply, `El campo «${ajeno}» no se puede editar. Si la sociedad, el proveedor o el identificador están mal, desactive esta obligación y cree una nueva.`, ajeno);
    }
    const r = esquemaEdicion.safeParse(cuerpo);
    if (!r.success) return reply.code(422).send(primerError(r.error));
    const actual = await obtenerObligacion(id.data);
    if (!actual) return reply.code(404).send({ error: "Obligación no encontrada" });

    const d = { ...r.data };
    if (d.frecuencia === "mensual" && d.mesArranque === undefined) d.mesArranque = null; // al pasar a mensual se limpia
    const mes = errorMesArranque(d.frecuencia ?? actual.frecuencia, d.mesArranque === undefined ? actual.mesArranque : d.mesArranque);
    if (mes) return invalido(reply, mes, "mesArranque");
    const cuenta = await errorCuenta(d.cuentaEsperadaId, actual.sociedadId);
    if (cuenta) return invalido(reply, cuenta, "cuentaEsperadaId");

    const o = await actualizarObligacion(id.data, {
      ...d,
      ...(d.diaEsperadoPago !== undefined ? { diaEditado: true } : {}),
      ...(d.frecuencia !== undefined && d.frecuenciaPorConfirmar === undefined ? { frecuenciaPorConfirmar: false } : {}),
      ...(d.moneda !== undefined && d.monedaPorConfirmar === undefined ? { monedaPorConfirmar: false } : {}),
    });
    return { datos: aDto(o, await repetidosActuales()) };
  });

  app.post("/api/catalogo/importar", async (_req, reply) => {
    const ruta = env.CATALOGO_FILE;
    if (!ruta) return reply.code(422).send({ error: "CATALOGO_FILE no está configurada en el servidor" });
    try {
      if (!(await stat(ruta)).isFile()) throw new Error();
    } catch {
      return reply.code(422).send({ error: "La tabla de pagos frecuentes (CATALOGO_FILE) no existe o no es accesible" });
    }
    if (hayImportacionCatalogoEnCurso()) return reply.code(409).send({ error: "Ya hay una importación del catálogo en curso" });
    try {
      return { datos: await importarCatalogo(ruta) };
    } catch (e) {
      if (e instanceof ErrorLectura) return reply.code(422).send({ error: e.message });
      throw e;
    }
  });
}
