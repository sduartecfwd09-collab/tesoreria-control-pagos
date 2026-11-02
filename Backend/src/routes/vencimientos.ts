import type { FastifyInstance } from "fastify";
import { responsableEfectivo } from "../domain/obligaciones.js";
import { detalleDeVencimiento } from "../vencimientos/detalle.js";
import { avisosDeDatos } from "../domain/cobertura-corte.js";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance, sociedadesDelAlcance } from "../identidad/alcance.js";
import { asociacionSinEfecto, claveObligacionPeriodo, ESTADOS_ASOCIABLES } from "../domain/asociacion.js";
import { normalizarMotivo } from "../domain/cambio-dia.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import { autorDe, exigirPersona, puedeEscribirEnSociedad, SIN_PERMISO_SOCIEDAD } from "../identidad/exigir-persona.js";
import { usuarioActual, type UsuarioActual } from "../identidad/usuario-actual.js";
import { asociacionesVigentesDe, asociacionVigente } from "../repositories/decisiones.js";
import { asociarPago, listarCandidatos, quitarAsociacion } from "../vencimientos/asociar-pago.js";
import { ESTADOS_JUSTIFICABLES, leerDatos, MOTIVOS_VENCIMIENTO } from "../domain/justificacion.js";
import { justificacionesVigentesDeVencimientos, justificacionVigenteDeVencimiento } from "../repositories/decisiones.js";
import { ESTADOS_MOVIBLES } from "../domain/mover-fecha.js";
import { moverFecha, quitarMovimiento } from "../vencimientos/mover-fecha.js";
import { justificarVencimiento, quitarJustificacionDeVencimiento } from "../justificaciones/vencimiento.js";
import { MOTIVOS } from "../domain/cruce.js";
import { inicioDeDatos } from "../domain/cobertura-corte.js";
import { TEXTO_SALDO_IMAGEN, TEXTO_SALDO_NO_CUADRA, textoDatosDesactualizados, textoEstadoLista, textoFaltanEstados, textoSinEstadosAnteriores } from "../domain/textos-pago.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { aNumero } from "../domain/montos.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { z } from "zod";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { esFechaIso, esPeriodo } from "../domain/vencimientos.js";
import { cargarCoberturaCuentas } from "../repositories/cruce.js";
import { listarSociedades, sociedadesConObligacionesActivas } from "../repositories/obligaciones.js";
import { diasDeAviso } from "../vencimientos/generar.js";
import { ultimoCalculoDeEstados, valorGlobal } from "../repositories/parametros.js";
import { listarVencimientos, periodosGenerados, vencimientoParaAsociar } from "../repositories/vencimientos.js";

const ESTADOS = ["proyectado", "por_vencer", "vencido", "pagado", "pagado_con_inconsistencia", "sin_informacion", "por_revisar", "justificado"] as const;

const periodo = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM)` }).refine(esPeriodo, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe tener el formato AAAA-MM (por ejemplo 2026-08)`);

const fechaIso = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM-DD)` }).refine(esFechaIso, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe ser una fecha válida con el formato AAAA-MM-DD (por ejemplo 2026-08-15)`);

const consulta = z.object({
  sociedad: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive("La sociedad debe ser un número").optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  periodo: periodo("el periodo").optional(),
  desde: periodo("el mes inicial").optional(),
  hasta: periodo("el mes final").optional(),
  fechaDesde: fechaIso("la fecha inicial").optional(),
  fechaHasta: fechaIso("la fecha final").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  estado: z.string().transform((t) => t.split(",").map((e) => e.trim()).filter(Boolean)).pipe(z.array(z.enum(ESTADOS)).max(ESTADOS.length, "Estado inválido")).optional(),
  pendientesAnteriores: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(500, "Se pueden pedir como máximo 500 por página").default(50),
}).refine((c) => !c.fechaDesde || !c.fechaHasta || c.fechaDesde <= c.fechaHasta, { message: "La fecha inicial no puede ser posterior a la final" });

export async function rutasVencimientos(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  // `hoy` sale del reloj del servidor (inyectable): la pantalla abre en el mes de hoy y calcula «Hace N días» con él
  app.get("/api/vencimientos/periodos", async () => ({ datos: await periodosGenerados(), hoy: hoyDe(opts.reloj).toISOString().slice(0, 10) }));

  app.get("/api/vencimientos/:id", async (req, reply) => {
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const d = await detalleDeVencimiento(id.data, opts.reloj);
    // fuera del alcance de la persona: no se distingue de uno que no existe
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const ids = await obligacionesDelAlcance(alcance);
    if (!d || (ids && !ids.includes(d.obligacionId))) return reply.code(404).send({ error: "Vencimiento no encontrado" });
    // asociación manual: quién, cuándo y por qué; y si hay una acción posible para quien consulta
    const paraAsociar = await vencimientoParaAsociar(id.data);
    const decision = paraAsociar ? await asociacionVigente(paraAsociar.obligacionId, paraAsociar.periodo) : null;
    const justificacion = paraAsociar ? await justificacionVigenteDeVencimiento(paraAsociar.obligacionId, paraAsociar.periodo) : null;
    const persona = await usuarioActual(req, opts.modoPruebas);
    const gestion = paraAsociar
      ? { ...gestionDe(paraAsociar, decision, justificacion, persona), motivosDeJustificacion: MOTIVOS_VENCIMIENTO }
      : { asociadoAMano: null, sinEfecto: false, justificado: null, puedeGestionar: false, motivosDeJustificacion: MOTIVOS_VENCIMIENTO };
    // el responsable solo se informa a Jefatura: a un tesorero le repetiría que es él
    return { datos: { ...(alcance.tipo === "todo" ? d : { ...d, responsableEfectivo: undefined }), ...gestion } };
  });

  // Asociar a mano un pago a un vencimiento. Todas exigen persona identificada (401) y la sociedad propia (403; Jefatura todas).
  const paraGestionar = async (req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): Promise<{ persona: UsuarioActual; v: NonNullable<Awaited<ReturnType<typeof vencimientoParaAsociar>>> } | null> => {
    const persona = await exigirPersona(req, reply, opts.modoPruebas);
    if (!persona) return null;
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    if (!id.success) {
      reply.code(400).send({ error: "Identificador inválido" });
      return null;
    }
    const v = await vencimientoParaAsociar(id.data);
    if (!v) {
      reply.code(404).send({ error: "Vencimiento no encontrado" });
      return null;
    }
    if (!puedeEscribirEnSociedad(persona, v.sociedad)) {
      reply.code(403).send({ error: SIN_PERMISO_SOCIEDAD });
      return null;
    }
    return { persona, v };
  };
  const errorDeServicio = (reply: import("fastify").FastifyReply, e: unknown) => {
    if (!(e instanceof ErrorDeServicio)) throw e;
    const estado = { permiso: 403, validacion: 422, no_encontrado: 404, conflicto: 409 }[e.codigo];
    return reply.code(estado).send({ error: e.message, ...(e.campo ? { campo: e.campo } : {}) });
  };
  const MENSAJE_MOTIVO = "Indique el motivo (entre 3 y 300 caracteres)";

  app.get("/api/vencimientos/:id/pagos-candidatos", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    try {
      return { datos: await listarCandidatos(g.v) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  app.post("/api/vencimientos/:id/asociar-pago", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    const cuerpo = (req.body ?? {}) as { movimiento?: unknown; motivo?: unknown };
    const movimiento = z.number().int().positive().safeParse(cuerpo.movimiento);
    if (!movimiento.success) return reply.code(422).send({ error: "Elija un pago de la lista", campo: "movimiento" });
    const motivo = normalizarMotivo(cuerpo.motivo);
    if (motivo === null) return reply.code(422).send({ error: MENSAJE_MOTIVO, campo: "motivo" });
    try {
      return { datos: await asociarPago({ vencimiento: g.v, movimientoId: movimiento.data, motivo, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  // Justificar un vencimiento Vencido o Sin información (motivo de una lista fija y una nota que según el motivo es opcional u obligatoria).
  app.post("/api/vencimientos/:id/justificar", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    const cuerpo = (req.body ?? {}) as { motivo?: unknown; nota?: unknown };
    try {
      return { datos: await justificarVencimiento({ vencimiento: g.v, motivo: cuerpo.motivo, nota: cuerpo.nota, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  app.post("/api/vencimientos/:id/quitar-justificacion", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    const motivo = normalizarMotivo(((req.body ?? {}) as { motivo?: unknown }).motivo);
    if (motivo === null) return reply.code(422).send({ error: MENSAJE_MOTIVO, campo: "motivo" });
    try {
      return { datos: await quitarJustificacionDeVencimiento({ vencimiento: g.v, motivo, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  // Mover la fecha de UN vencimiento (solo este mes) y devolverla a su fecha original. Mismas reglas de acceso que las demás acciones de gestión.
  app.post("/api/vencimientos/:id/mover-fecha", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    const cuerpo = (req.body ?? {}) as { nuevaFecha?: unknown; motivo?: unknown };
    try {
      return { datos: await moverFecha({ vencimiento: g.v, nuevaFecha: cuerpo.nuevaFecha, motivo: cuerpo.motivo, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  app.post("/api/vencimientos/:id/quitar-movimiento", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    try {
      return { datos: await quitarMovimiento({ vencimiento: g.v, motivo: ((req.body ?? {}) as { motivo?: unknown }).motivo, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  app.post("/api/vencimientos/:id/quitar-asociacion", async (req, reply) => {
    const g = await paraGestionar(req, reply);
    if (!g) return reply;
    const motivo = normalizarMotivo(((req.body ?? {}) as { motivo?: unknown }).motivo);
    if (motivo === null) return reply.code(422).send({ error: MENSAJE_MOTIVO, campo: "motivo" });
    try {
      return { datos: await quitarAsociacion({ vencimiento: g.v, motivo, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return errorDeServicio(reply, e);
    }
  });

  // Aviso de datos: sociedades cuyos estados de cuenta llegan hasta una fecha anterior a hoy menos N días.
  app.get("/api/vencimientos/avisos-datos", async (req) => {
    const hoy = hoyDe(opts.reloj);
    const sociedadesPropias = await sociedadesDelAlcance(await alcanceDe(req, opts.modoPruebas));
    const dias = Number(await valorGlobal("aviso_datos_dias"));
    const [cuentas, sociedades, conObligaciones] = await Promise.all([cargarCoberturaCuentas(), listarSociedades(), sociedadesConObligacionesActivas()]);
    // solo sociedades con obligaciones activas (sin ningún estado de cuenta cargado también avisan)
    const avisos = avisosDeDatos(new Map([...conObligaciones].filter((id) => !sociedadesPropias || sociedadesPropias.includes(id)).map((id) => [id, cuentas.get(id) ?? []] as const)), hoy, Number.isInteger(dias) && dias >= 0 ? dias : 5);
    return {
      datos: avisos.map((a) => {
        const nombre = sociedades.find((x) => x.id === a.sociedadId)?.nombreLargo ?? "Sociedad";
        const desde = a.corte ? new Date(a.corte.getTime() + 86_400_000).toISOString().slice(0, 10) : null; // primer día sin datos
        return { sociedadId: a.sociedadId, sociedad: nombre, estadosHasta: a.corte ? a.corte.toISOString().slice(0, 10) : null, sinEstadosDesde: desde, texto: textoDatosDesactualizados(nombre, a.corte ? a.corte.toISOString().slice(0, 10) : null) };
      }).sort((a, b) => a.sociedad.localeCompare(b.sociedad, "es")),
    };
  });

  app.get("/api/vencimientos", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const hoy = hoyDe(opts.reloj);
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const diasAviso = await diasDeAviso();
    const nDespues = Number(await valorGlobal("ventana_dias_despues"));
    const diasDespues = Number.isInteger(nDespues) && nDespues >= 0 ? nDespues : 12;
    const { estado, ...resto } = q.data;
    const obligacionIds = (await obligacionesDelAlcance(alcance)) ?? undefined;
    const { total, datos, resumen } = await listarVencimientos({ ...resto, estados: estado, obligacionIds });
    // decisiones manuales de lo que se ve, y quién puede gestionar (sin persona identificada nadie)
    const persona = await usuarioActual(req, opts.modoPruebas);
    const asociaciones = await asociacionesVigentesDe(datos.map((v) => v.obligacionId), datos.map((v) => v.periodo));
    const justificaciones = await justificacionesVigentesDeVencimientos(datos.map((v) => v.obligacionId), datos.map((v) => v.periodo));
    // «Sin información» por inicio de datos: desde cuándo hay estados de cuenta de cada sociedad
    const datosDesde = new Map<number, string | null>();
    if (datos.some((v) => v.estado === "sin_informacion" && v.motivo === MOTIVOS.sinInformacionDesde)) {
      for (const [id, cuentas] of await cargarCoberturaCuentas()) datosDesde.set(id, inicioDeDatos(cuentas)?.toISOString().slice(0, 10) ?? null);
    }
    return {
      datos: datos.map((v) => ({
        id: v.id,
        obligacionId: v.obligacionId,
        sociedad: etiquetaSociedad(v.sociedad),
        categoria: v.categoria.nombre,
        proveedor: v.proveedor,
        identificador: v.obligacion.identificador,
        frecuencia: v.obligacion.frecuencia,
        // el de la obligación o, si falta, el tesorero de la sociedad; solo se informa a Jefatura (a un tesorero le repetiría que es él)
        ...(alcance.tipo === "todo" ? { responsableEfectivo: responsableEfectivo(v.obligacion).nombre } : {}),
        periodo: v.periodo,
        // pendiente de un periodo anterior al que se está viendo (se etiqueta «Mes anterior»)
        mesAnterior: Boolean(q.data.pendientesAnteriores && q.data.periodo && v.periodo < q.data.periodo),
        fecha: v.fecha.toISOString().slice(0, 10),
        fechaOriginal: v.fechaOriginal ? v.fechaOriginal.toISOString().slice(0, 10) : null, // solo si se movió «de una sola vez»
        movida: v.fechaOriginal !== null,
        montoEsperado: aNumero(v.montoEsperado),
        moneda: v.moneda,
        estado: v.estado,
        motivo: v.motivo,
        // «Sin información» requiere atención y se explica con fechas; nunca se presenta como Vencido
        textoEstado: v.estado !== "sin_informacion" ? textoEstadoLista({ estado: v.estado, motivo: v.motivo, dias: Math.round((v.fecha.getTime() - hoy.getTime()) / 86_400_000), fecha: v.fecha.toISOString().slice(0, 10), fechaHasta: new Date(v.fecha.getTime() + diasDespues * 86_400_000).toISOString().slice(0, 10) }) : v.motivo === MOTIVOS.sinInformacionSaldo ? TEXTO_SALDO_NO_CUADRA : v.motivo === MOTIVOS.sinInformacionImagen ? TEXTO_SALDO_IMAGEN : v.motivo === MOTIVOS.sinInformacionDesde ? textoSinEstadosAnteriores(datosDesde.get(v.sociedadId) ?? null) : textoFaltanEstados(v.sinInfoHasta ? v.sinInfoHasta.toISOString().slice(0, 10) : null),
        // el pago que respalda el estado; la moneda es la de la cuenta que pagó (null = sin dato: sin símbolo ni código)
        pago: v.movimiento ? { fecha: v.movimiento.fecha.toISOString().slice(0, 10), monto: aNumero(v.movimiento.debito), moneda: v.movimiento.cuenta.moneda, banco: v.movimiento.cuenta.banco, cuenta: enmascararCuenta(v.movimiento.cuenta.numero) } : null,
        diferenciaDias: v.diferenciaDias,
        sinInfoHasta: v.sinInfoHasta ? v.sinInfoHasta.toISOString().slice(0, 10) : null,
        ...gestionDe(v, asociaciones.get(claveObligacionPeriodo(v.obligacionId, v.periodo)) ?? null, justificaciones.get(claveObligacionPeriodo(v.obligacionId, v.periodo)) ?? null, persona),
        futuro: v.fecha >= hoy,
        // días de hoy a la fecha vigente (negativo = ya pasó): «Hace N días» / «En N días»
        dias: Math.round((v.fecha.getTime() - hoy.getTime()) / 86_400_000),
      })),
      alcance: alcanceParaRespuesta(alcance), estadosCalculadosEn: await ultimoCalculoDeEstados(), resumen, diasAviso, total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
      hoy: hoy.toISOString().slice(0, 10),
    };
  });
}

type DecisionVigente = Awaited<ReturnType<typeof asociacionVigente>>;

/**
 * Lo que la lista y el detalle dicen de la gestión de un vencimiento: el pago asociado a mano (quién, cuándo y por qué) y si no tiene efecto, la
 * justificación (solo mientras el estado sea Justificado: con un pago, el pago manda) y si esta persona puede actuar (asociar un pago, justificar
 * o quitar lo que haya).
 */
function gestionDe(
  v: { estado: string; fechaOriginal: Date | null; sociedad: { tesoreroId: number | null }; movimiento: { claveDedup: string } | null },
  asociacion: DecisionVigente,
  justificacion: DecisionVigente,
  persona: UsuarioActual | null,
) {
  const datos = justificacion ? leerDatos(justificacion.datos) : null;
  return {
    asociadoAMano: asociacion ? { quien: asociacion.nombreUsuario, cuando: asociacion.creadoEn.toISOString(), motivo: asociacion.motivo } : null,
    sinEfecto: asociacion ? asociacionSinEfecto(v.estado, v.movimiento?.claveDedup ?? null, asociacion.claveMovimiento) : false,
    justificado: justificacion && datos && v.estado === "justificado" ? { quien: justificacion.nombreUsuario, cuando: justificacion.creadoEn.toISOString(), motivo: justificacion.motivo, nota: datos.nota } : null,
    // mover la fecha de este mes (Programado, Por vencer, Vencido, Sin información) y devolverla a la original (si está movida)
    puedeMoverFecha: Boolean(persona && puedeEscribirEnSociedad(persona, v.sociedad) && ESTADOS_MOVIBLES.includes(v.estado)),
    puedeQuitarMovimiento: Boolean(persona && puedeEscribirEnSociedad(persona, v.sociedad) && ESTADOS_MOVIBLES.includes(v.estado) && v.fechaOriginal !== null),
    puedeGestionar: Boolean(
      persona && puedeEscribirEnSociedad(persona, v.sociedad) && (ESTADOS_ASOCIABLES.includes(v.estado) || ESTADOS_JUSTIFICABLES.includes(v.estado) || ESTADOS_MOVIBLES.includes(v.estado) || asociacion || justificacion),
    ),
  };
}
