import type { FastifyInstance } from "fastify";
import { avisosDeDatos } from "../domain/cobertura-corte.js";
import { textoSinInformacion } from "../domain/cruce.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { aNumero } from "../domain/montos.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { z } from "zod";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { esPeriodo } from "../domain/vencimientos.js";
import { cargarCoberturaCuentas } from "../repositories/cruce.js";
import { listarSociedades } from "../repositories/obligaciones.js";
import { valorGlobal } from "../repositories/parametros.js";
import { listarVencimientos, periodosGenerados } from "../repositories/vencimientos.js";

const periodo = (nombre: string) => z.string({ error: `Indique ${nombre} (AAAA-MM)` }).refine(esPeriodo, `${nombre[0]!.toUpperCase()}${nombre.slice(1)} debe tener el formato AAAA-MM (por ejemplo 2026-08)`);

const consulta = z.object({
  sociedad: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  sociedadId: z.coerce.number({ error: "La sociedad debe ser un número" }).int().positive("La sociedad debe ser un número").optional(),
  categoria: z.coerce.number({ error: "La categoría debe ser un número" }).int().positive("La categoría debe ser un número").optional(),
  periodo: periodo("el periodo").optional(),
  desde: periodo("el mes inicial").optional(),
  hasta: periodo("el mes final").optional(),
  q: z.string().trim().min(1).max(80, "La búsqueda admite como máximo 80 caracteres").optional(),
  pagina: z.coerce.number().int().min(1, "La página debe ser 1 o más").default(1),
  porPagina: z.coerce.number().int().min(1).max(500, "Se pueden pedir como máximo 500 por página").default(50),
});

export async function rutasVencimientos(app: FastifyInstance, opts: { reloj: Reloj }) {
  app.get("/api/vencimientos/periodos", async () => ({ datos: await periodosGenerados() }));

  // Aviso de datos: sociedades cuyos estados de cuenta llegan hasta una fecha anterior a hoy menos N días.
  app.get("/api/vencimientos/avisos-datos", async () => {
    const hoy = hoyDe(opts.reloj);
    const dias = Number(await valorGlobal("aviso_datos_dias"));
    const [cuentas, sociedades] = await Promise.all([cargarCoberturaCuentas(), listarSociedades()]);
    const avisos = avisosDeDatos(cuentas, hoy, Number.isInteger(dias) && dias >= 0 ? dias : 5);
    return {
      datos: avisos.map((a) => {
        const nombre = sociedades.find((x) => x.id === a.sociedadId)?.nombreLargo ?? "Sociedad";
        const desde = a.corte ? new Date(a.corte.getTime() + 86_400_000).toISOString().slice(0, 10) : null; // primer día sin datos
        return { sociedadId: a.sociedadId, sociedad: nombre, sinEstadosDesde: desde, texto: desde ? `${nombre}: sin estados desde ${desde}` : `${nombre}: sin estados cargados` };
      }).sort((a, b) => a.sociedad.localeCompare(b.sociedad, "es")),
    };
  });

  app.get("/api/vencimientos", async (req, reply) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Filtros inválidos" });
    const hoy = hoyDe(opts.reloj);
    const { total, datos } = await listarVencimientos(q.data);
    return {
      datos: datos.map((v) => ({
        id: v.id,
        obligacionId: v.obligacionId,
        sociedad: etiquetaSociedad(v.sociedad),
        categoria: v.categoria.nombre,
        proveedor: v.proveedor,
        identificador: v.obligacion.identificador,
        frecuencia: v.obligacion.frecuencia,
        periodo: v.periodo,
        fecha: v.fecha.toISOString().slice(0, 10),
        fechaOriginal: v.fechaOriginal ? v.fechaOriginal.toISOString().slice(0, 10) : null, // solo si se movió «de una sola vez»
        montoEsperado: aNumero(v.montoEsperado),
        moneda: v.moneda,
        estado: v.estado,
        motivo: v.motivo,
        // «Sin información» requiere atención y se explica con fechas; nunca se presenta como Vencido
        textoEstado: v.estado === "sin_informacion" ? textoSinInformacion(v.fecha, v.sinInfoHasta) : v.motivo,
        // el pago que respalda el estado; la moneda es la de la cuenta que pagó (null = sin dato: sin símbolo ni código)
        pago: v.movimiento ? { fecha: v.movimiento.fecha.toISOString().slice(0, 10), monto: aNumero(v.movimiento.debito), moneda: v.movimiento.cuenta.moneda, banco: v.movimiento.cuenta.banco, cuenta: enmascararCuenta(v.movimiento.cuenta.numero) } : null,
        diferenciaDias: v.diferenciaDias,
        sinInfoHasta: v.sinInfoHasta ? v.sinInfoHasta.toISOString().slice(0, 10) : null,
        conciliado: v._count.conciliaciones > 0,
        futuro: v.fecha >= hoy,
      })),
      total, pagina: q.data.pagina, porPagina: q.data.porPagina, paginas: Math.max(1, Math.ceil(total / q.data.porPagina)),
      hoy: hoy.toISOString().slice(0, 10),
    };
  });
}
