import { stat } from "node:fs/promises";
import { advertenciaDiaYaPaso, mesDeAlta, periodoDeControl, primerDiaDelPeriodo } from "../domain/control-desde.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { aNumero } from "../domain/montos.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { hayImportacionCatalogoEnCurso, importarCatalogo } from "../catalogo/importar.js";
import {
  CAMPOS_EDITABLES, calidadCatalogo, errorMesArranque, esquemaAlta, esquemaEdicion, etiquetasDe,
  estadoDeObligacion, identificadoresRepetidos, primerError, responsableEfectivo, type ObligacionCalidad,
} from "../domain/obligaciones.js";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance } from "../identidad/alcance.js";
import { FRECUENCIAS } from "../domain/parametros.js";
import { ErrorLectura } from "../ingest/lector.js";
import {
  actualizarObligacion, buscarPorClave, buscarPorIdentificador, crearObligacion, listarCategorias, listarObligaciones, listarSociedades,
  obtenerCategoria, obtenerCuenta, obtenerObligacion, obtenerSociedadPorId, sociedadesConEstados, todasLasObligaciones,
  type ObligacionCompleta,
} from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";
import { proximoPago } from "../domain/vencimientos.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { actualizarVencimientos } from "../vencimientos/mantenimiento.js";

// Campos que cambian los vencimientos: al editarlos se regeneran los futuros sin conciliación.
const CAMPOS_QUE_REGENERAN = ["frecuencia", "mesArranque", "diaEsperadoPago", "montoEsperado", "activa", "controlDesde"];

const consulta = z.object({
  sociedad: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive("La sociedad debe ser un número").optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  activa: z.enum(["true", "false"], { error: "«activa» debe ser true o false" }).transform((v) => v === "true").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  falta: z.enum(["monto", "cuenta", "responsable", "dia", "frecuencia"], { error: "«falta» debe ser monto, cuenta, responsable, dia o frecuencia" }).optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(500, "Se pueden pedir como máximo 500 por página").default(50),
});

const idParam = z.coerce.number().int().positive();

const aCalidad = (o: ObligacionCompleta): ObligacionCalidad => ({
  ...o, montoEsperado: aNumero(o.montoEsperado), sociedad: etiquetaSociedad(o.sociedad), responsable: responsableEfectivo(o).nombre,
});

function aDto(o: ObligacionCompleta, repetidos: ReturnType<typeof identificadoresRepetidos>, proximoPago: string | null, conResponsable: boolean) {
  const observaciones = etiquetasDe(aCalidad(o), repetidos);
  return {
    id: o.id,
    sociedadId: o.sociedadId, sociedad: etiquetaSociedad(o.sociedad),
    categoriaId: o.categoriaId, categoria: o.categoria.nombre,
    proveedor: o.proveedor, identificador: o.identificador,
    diaEsperadoPago: o.diaEsperadoPago, diaEditado: o.diaEditado,
    frecuencia: o.frecuencia, frecuenciaPorConfirmar: o.frecuenciaPorConfirmar, mesArranque: o.mesArranque,
    montoEsperado: aNumero(o.montoEsperado), moneda: o.moneda, monedaPorConfirmar: o.monedaPorConfirmar,
    cuentaEsperada: o.cuentaEsperada ? { id: o.cuentaEsperada.id, numero: enmascararCuenta(o.cuentaEsperada.numero), banco: o.cuentaEsperada.banco } : null,
    // el responsable es el tesorero de la sociedad y solo se informa a Jefatura (a un tesorero le repetiría que es él)
    ...(conResponsable ? { responsableEfectivo: responsableEfectivo(o).nombre } : {}),
    activa: o.activa, origen: o.origen,
    controlDesde: periodoDeControl(o.controlDesde),
    proximoPago, // dato calculado: el próximo vencimiento con fecha igual o posterior a hoy, según la frecuencia
    actualizado: o.actualizado.toISOString(),
    etiquetas: observaciones,
    estado: estadoDeObligacion(o.activa, observaciones),
  };
}

/** Próximo pago calculado de cada obligación (fecha ISO o null). */
async function proximosPagos(obs: ObligacionCompleta[], reloj: Reloj): Promise<Map<number, string | null>> {
  const hoy = hoyDe(reloj);
  return new Map(obs.map((o) => {
    const f = proximoPago({ ...o, controlDesde: periodoDeControl(o.controlDesde) }, hoy);
    return [o.id, f ? f.toISOString().slice(0, 10) : null];
  }));
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

/** «Sin responsable» (sociedad sin tesorero) solo lo ve Jefatura. */
function calidadParaPersona<T extends { sinResponsable: number }>(c: T, esJefatura: boolean): Omit<T, "sinResponsable"> & { sinResponsable?: number } {
  if (esJefatura) return c;
  const { sinResponsable: _quitado, ...resto } = c;
  return resto;
}

const invalido = (reply: FastifyReply, error: string, campo?: string) => reply.code(422).send({ error, ...(campo ? { campo } : {}) });

export async function rutasObligaciones(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  app.get("/api/sociedades", async () => {
    const s = await listarSociedades();
    return { datos: s.map((x) => ({ id: x.id, codigo: x.codigo, nombreLargo: x.nombreLargo, activa: x.activa, tesorero: x.tesorero?.nombre ?? null, obligaciones: x._count.obligaciones, cuentas: x._count.cuentas })) };
  });

  app.get("/api/categorias", async () => {
    const c = await listarCategorias();
    return { datos: c.map((x) => ({ id: x.id, nombre: x.nombre, obligaciones: x._count.obligaciones })) };
  });

  app.get("/api/obligaciones", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const ids = (await obligacionesDelAlcance(alcance)) ?? undefined;
    const [{ total, datos }, repetidos] = await Promise.all([listarObligaciones({ ...q.data, ids }), repetidosActuales()]);
    const proximos = await proximosPagos(datos, opts.reloj);
    return {
      alcance: alcanceParaRespuesta(alcance),
      datos: datos.map((o) => aDto(o, repetidos, proximos.get(o.id) ?? null, alcance.tipo === "todo")),
      total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
    };
  });

  app.get("/api/obligaciones/resumen", async (req) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const ids = await obligacionesDelAlcance(alcance);
    const [todas, sociedades, conEstados] = await Promise.all([todasLasObligaciones(), listarSociedades(), sociedadesConEstados()]);
    const obs = ids ? todas.filter((o) => ids.includes(o.id)) : todas;
    const activas = obs.filter((o) => o.activa);
    const contar = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
    return {
      alcance: alcanceParaRespuesta(alcance),
      datos: {
        ...calidadParaPersona(calidadCatalogo(obs.map(aCalidad), sociedades.map((s) => ({ nombre: etiquetaSociedad(s), conEstados: conEstados.has(s.id) }))), alcance.tipo === "todo"),
        porSociedad: { ...Object.fromEntries(sociedades.map((s) => [etiquetaSociedad(s), 0])), ...contar(activas.map((o) => etiquetaSociedad(o.sociedad))) },
        porCategoria: contar(activas.map((o) => o.categoria.nombre)),
      },
    };
  });

  app.get("/api/obligaciones/:id", async (req, reply) => {
    const id = idParam.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const o = await obtenerObligacion(id.data);
    const propias = await obligacionesDelAlcance(await alcanceDe(req, opts.modoPruebas));
    if (!o || (propias && !propias.includes(o.id))) return reply.code(404).send({ error: "Obligación no encontrada" });
    return { datos: aDto(o, await repetidosActuales(), (await proximosPagos([o], opts.reloj)).get(o.id) ?? null, (await alcanceDe(req, opts.modoPruebas)).tipo === "todo") };
  });

  app.post("/api/obligaciones", async (req, reply) => {
    // el responsable es el tesorero de la sociedad: no se indica por obligación
    if (req.body && typeof req.body === "object" && "responsable" in req.body) {
      return invalido(reply, "El responsable de una obligación es el tesorero de su sociedad: para cambiarlo, reasigne la sociedad", "responsable");
    }
    const r = esquemaAlta.safeParse(req.body ?? {});
    if (!r.success) return reply.code(422).send(primerError(r.error));
    const d = r.data;
    const sociedad = await obtenerSociedadPorId(d.sociedadId);
    if (!sociedad) return invalido(reply, "La sociedad no existe", "sociedadId");
    if (!(await obtenerCategoria(d.categoriaId))) return invalido(reply, "La categoría no existe", "categoriaId");
    if (await buscarPorClave(sociedad.id, d.proveedor, d.identificador, d.categoriaId)) {
      return reply.code(409).send({ error: `Ya existe una obligación de ${d.proveedor} con ese identificador y esa categoría en ${etiquetaSociedad(sociedad)}`, campo: "identificador" });
    }
    // El identificador no es único por sí solo: se avisa con los datos de la otra obligación y se admite confirmar «Es intencional».
    if (!d.esIntencional) {
      const otras = await buscarPorIdentificador(d.identificador);
      if (otras.length > 0) {
        return reply.code(409).send({
          error: "Este identificador ya existe en otra obligación. Si es intencional, confírmelo para crearla igual.",
          campo: "identificador",
          advertencia: {
            tipo: "identificador_duplicado",
            otras: otras.map((o) => ({ sociedad: etiquetaSociedad(o.sociedad), categoria: o.categoria.nombre, proveedor: o.proveedor, activa: o.activa })),
          },
        });
      }
    }
    const defecto = (await valorGlobal("frecuencia_defecto")) ?? "mensual";
    const frecuencia = d.frecuencia ?? (FRECUENCIAS.includes(defecto) ? defecto : "mensual");
    const mes = errorMesArranque(frecuencia, d.mesArranque);
    if (mes) return invalido(reply, mes, "mesArranque");
    const cuenta = await errorCuenta(d.cuentaEsperadaId, sociedad.id);
    if (cuenta) return invalido(reply, cuenta, "cuentaEsperadaId");

    // «Control desde»: por defecto el mes de alta. Si el día de pago de ese mes ya pasó y no se eligió, se devuelve la
    // advertencia para que el formulario pregunte «¿desde este mes o desde el siguiente?» (el valor sigue siendo el mes de alta).
    const hoy = hoyDe(opts.reloj);
    const controlDesde = d.controlDesde === undefined ? mesDeAlta(hoy) : d.controlDesde;
    const advertencia = advertenciaDiaYaPaso(d.diaEsperadoPago, hoy, d.controlDesde !== undefined);

    const { esIntencional: _intencional, controlDesde: _control, ...resto } = d;
    const o = await crearObligacion({
      ...resto,
      controlDesde: controlDesde === null ? null : primerDiaDelPeriodo(controlDesde),
      frecuencia,
      frecuenciaPorConfirmar: d.frecuenciaPorConfirmar ?? d.frecuencia === undefined,
      monedaPorConfirmar: d.monedaPorConfirmar ?? d.moneda === undefined,
      origen: "manual",
    });
    const regeneracion = (await actualizarVencimientos(opts.reloj, o.id)).calendario;
    return reply.code(201).send({ datos: aDto(o, await repetidosActuales(), (await proximosPagos([o], opts.reloj)).get(o.id) ?? null, (await alcanceDe(req, opts.modoPruebas)).tipo === "todo"), regeneracion, advertencias: advertencia ? [advertencia] : [] });
  });

  // Cambio masivo de frecuencia sobre las filas elegidas: la frecuencia queda confirmada y el calendario se ajusta una sola vez.
  app.post("/api/obligaciones/frecuencia", async (req, reply) => {
    const r = z.object({
      ids: z.array(z.number().int().positive(), { error: "Elija las obligaciones" }).min(1, "Elija al menos una obligación").max(500, "Elija como máximo 500 obligaciones"),
      frecuencia: z.string({ error: "Indique la frecuencia" }).refine((f) => FRECUENCIAS.includes(f), `La frecuencia debe ser una de: ${FRECUENCIAS.join(", ")}`),
      mesArranque: z.number().int().min(1, "El mes debe estar entre 1 y 12").max(12, "El mes debe estar entre 1 y 12").nullable().optional(),
    }).safeParse(req.body);
    if (!r.success) return reply.code(422).send(primerError(r.error));
    const { ids, frecuencia } = r.data;
    const mes = frecuencia === "mensual" ? null : (r.data.mesArranque ?? null);
    if (frecuencia !== "mensual" && mes === null) return invalido(reply, "Indique el mes de arranque: en qué mes toca el primer pago de esta frecuencia", "mesArranque");
    let actualizadas = 0;
    for (const id of new Set(ids)) {
      if (!(await obtenerObligacion(id))) continue;
      await actualizarObligacion(id, { frecuencia, mesArranque: mes, frecuenciaPorConfirmar: false });
      actualizadas++;
    }
    const { calendario } = await actualizarVencimientos(opts.reloj);
    return { datos: { actualizadas, calendario } };
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

    // Cambiar un día ya definido exige motivo y deja historial (servicio cambiar-dia, que verifica el permiso de quien actúa):
    // hasta que exista el inicio de sesión no se hace por esta ruta. Indicar el día cuando falta sí se permite.
    if (r.data.diaEsperadoPago !== undefined && actual.diaEsperadoPago !== null && r.data.diaEsperadoPago !== actual.diaEsperadoPago) {
      return invalido(reply, "El día de pago ya definido solo se cambia indicando el motivo y quién lo cambia; todavía no está disponible", "diaEsperadoPago");
    }
    const d = { ...r.data };
    if (d.frecuencia === "mensual" && d.mesArranque === undefined) d.mesArranque = null; // al pasar a mensual se limpia
    const mes = errorMesArranque(d.frecuencia ?? actual.frecuencia, d.mesArranque === undefined ? actual.mesArranque : d.mesArranque);
    if (mes) return invalido(reply, mes, "mesArranque");
    // al cambiar la frecuencia o el mes, una frecuencia no mensual exige indicar en qué mes toca el primer pago
    if ((d.frecuencia !== undefined || d.mesArranque !== undefined) && (d.frecuencia ?? actual.frecuencia) !== "mensual" && (d.mesArranque === undefined ? actual.mesArranque : d.mesArranque) == null) {
      return invalido(reply, "Indique el mes de arranque: en qué mes toca el primer pago de esta frecuencia", "mesArranque");
    }
    const cuenta = await errorCuenta(d.cuentaEsperadaId, actual.sociedadId);
    if (cuenta) return invalido(reply, cuenta, "cuentaEsperadaId");

    const { controlDesde, ...resto } = d;
    const o = await actualizarObligacion(id.data, {
      ...resto,
      ...(controlDesde !== undefined ? { controlDesde: controlDesde === null ? null : primerDiaDelPeriodo(controlDesde) } : {}),
      ...(d.diaEsperadoPago !== undefined ? { diaEditado: true } : {}),
      ...(d.frecuencia !== undefined && d.frecuenciaPorConfirmar === undefined ? { frecuenciaPorConfirmar: false } : {}),
      ...(d.moneda !== undefined && d.monedaPorConfirmar === undefined ? { monedaPorConfirmar: false } : {}),
    });
    const regeneracion = Object.keys(d).some((k) => CAMPOS_QUE_REGENERAN.includes(k)) ? (await actualizarVencimientos(opts.reloj, o.id)).calendario : null;
    return { datos: aDto(o, await repetidosActuales(), (await proximosPagos([o], opts.reloj)).get(o.id) ?? null, (await alcanceDe(req, opts.modoPruebas)).tipo === "todo"), regeneracion };
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
