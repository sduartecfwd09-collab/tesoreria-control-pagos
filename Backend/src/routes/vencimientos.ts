import type { FastifyInstance } from "fastify";
import { responsableEfectivo } from "../domain/obligaciones.js";
import { detalleDeVencimiento } from "../vencimientos/detalle.js";
import { avisosDeDatos } from "../domain/cobertura-corte.js";
import { MOTIVOS } from "../domain/cruce.js";
import { inicioDeDatos } from "../domain/cobertura-corte.js";
import { textoDatosDesactualizados, textoFaltanEstados, textoSinEstadosAnteriores } from "../domain/textos-pago.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { aNumero } from "../domain/montos.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { z } from "zod";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { esPeriodo } from "../domain/vencimientos.js";
import { cargarCoberturaCuentas } from "../repositories/cruce.js";
import { listarSociedades, sociedadesConObligacionesActivas } from "../repositories/obligaciones.js";
import { diasDeAviso } from "../vencimientos/generar.js";
import { valorGlobal } from "../repositories/parametros.js";
import { listarVencimientos, periodosGenerados } from "../repositories/vencimientos.js";

const ESTADOS = ["proyectado", "por_vencer", "vencido", "pagado", "pagado_con_inconsistencia", "sin_informacion", "por_revisar"] as const;

const periodo = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM)` }).refine(esPeriodo, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe tener el formato AAAA-MM (por ejemplo 2026-08)`);

const consulta = z.object({
  sociedad: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive("La sociedad debe ser un número").optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  periodo: periodo("el periodo").optional(),
  desde: periodo("el mes inicial").optional(),
  hasta: periodo("el mes final").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  estado: z.string().transform((t) => t.split(",").map((e) => e.trim()).filter(Boolean)).pipe(z.array(z.enum(ESTADOS)).max(ESTADOS.length, "Estado inválido")).optional(),
  pendientesAnteriores: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(500, "Se pueden pedir como máximo 500 por página").default(50),
});

export async function rutasVencimientos(app: FastifyInstance, opts: { reloj: Reloj }) {
  // `hoy` sale del reloj del servidor (inyectable): la pantalla abre en el mes de hoy y calcula «Hace N días» con él
  app.get("/api/vencimientos/periodos", async () => ({ datos: await periodosGenerados(), hoy: hoyDe(opts.reloj).toISOString().slice(0, 10) }));

  app.get("/api/vencimientos/:id", async (req, reply) => {
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Identificador inválido" });
    const d = await detalleDeVencimiento(id.data, opts.reloj);
    if (!d) return reply.code(404).send({ error: "Vencimiento no encontrado" });
    return { datos: d };
  });

  // Aviso de datos: sociedades cuyos estados de cuenta llegan hasta una fecha anterior a hoy menos N días.
  app.get("/api/vencimientos/avisos-datos", async () => {
    const hoy = hoyDe(opts.reloj);
    const dias = Number(await valorGlobal("aviso_datos_dias"));
    const [cuentas, sociedades, conObligaciones] = await Promise.all([cargarCoberturaCuentas(), listarSociedades(), sociedadesConObligacionesActivas()]);
    // solo sociedades con obligaciones activas (sin ningún estado de cuenta cargado también avisan)
    const avisos = avisosDeDatos(new Map([...conObligaciones].map((id) => [id, cuentas.get(id) ?? []] as const)), hoy, Number.isInteger(dias) && dias >= 0 ? dias : 5);
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
    const diasAviso = await diasDeAviso();
    const { estado, ...resto } = q.data;
    const { total, datos, resumen } = await listarVencimientos({ ...resto, estados: estado });
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
        responsableEfectivo: responsableEfectivo(v.obligacion).nombre, // el de la obligación o, si falta, el tesorero de la sociedad
        periodo: v.periodo,
        // pendiente de un periodo anterior al que se está viendo (se etiqueta «Mes anterior»)
        mesAnterior: Boolean(q.data.pendientesAnteriores && q.data.periodo && v.periodo < q.data.periodo),
        fecha: v.fecha.toISOString().slice(0, 10),
        fechaOriginal: v.fechaOriginal ? v.fechaOriginal.toISOString().slice(0, 10) : null, // solo si se movió «de una sola vez»
        montoEsperado: aNumero(v.montoEsperado),
        moneda: v.moneda,
        estado: v.estado,
        motivo: v.motivo,
        // «Sin información» requiere atención y se explica con fechas; nunca se presenta como Vencido
        textoEstado: v.estado !== "sin_informacion" ? v.motivo : v.motivo === MOTIVOS.sinInformacionDesde ? textoSinEstadosAnteriores(datosDesde.get(v.sociedadId) ?? null) : textoFaltanEstados(v.sinInfoHasta ? v.sinInfoHasta.toISOString().slice(0, 10) : null),
        // el pago que respalda el estado; la moneda es la de la cuenta que pagó (null = sin dato: sin símbolo ni código)
        pago: v.movimiento ? { fecha: v.movimiento.fecha.toISOString().slice(0, 10), monto: aNumero(v.movimiento.debito), moneda: v.movimiento.cuenta.moneda, banco: v.movimiento.cuenta.banco, cuenta: enmascararCuenta(v.movimiento.cuenta.numero) } : null,
        diferenciaDias: v.diferenciaDias,
        sinInfoHasta: v.sinInfoHasta ? v.sinInfoHasta.toISOString().slice(0, 10) : null,
        conciliado: v._count.conciliaciones > 0,
        futuro: v.fecha >= hoy,
        // días de hoy a la fecha vigente (negativo = ya pasó): «Hace N días» / «En N días»
        dias: Math.round((v.fecha.getTime() - hoy.getTime()) / 86_400_000),
      })),
      resumen, diasAviso, total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
      hoy: hoy.toISOString().slice(0, 10),
    };
  });
}
