import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { esFechaIso } from "../domain/vencimientos.js";
import { detalleDeGrupo, movimientosSinObligacion, type DebitoConPago } from "../domain/movimientos-sin-obligacion.js";
import { aNumero } from "../domain/montos.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { alcanceDe, alcanceParaRespuesta, sociedadesDelAlcance } from "../identidad/alcance.js";
import { debitosConPagoDelBanco, identificadoresDelCatalogo } from "../repositories/cruce.js";

// Solo lectura. Informa los pagos «Pago:PROVEEDOR número» del banco 0107 (formato E1) cuyo número no está en el catálogo.
// No crea obligaciones. Un tesorero ve solo las sociedades de su responsabilidad. Solo débitos: los créditos nunca entran
// (no cuentan como pago). La lista trae los números enmascarados; el detalle de un grupo (pedido por una persona que ya
// lo ve en la lista) trae el número completo y la descripción tal como viene del banco.
const fecha = z.string().refine(esFechaIso, "Las fechas deben tener el formato AAAA-MM-DD (por ejemplo 2026-08-15)").optional();
const periodo = z.object({ desde: fecha, hasta: fecha }).refine((p) => !p.desde || !p.hasta || p.desde <= p.hasta, { message: "La fecha inicial no puede ser posterior a la final" });

export async function rutasMovimientosSinObligacion(app: FastifyInstance, opts: { modoPruebas: boolean }) {
  const cargar = async (req: Parameters<typeof alcanceDe>[0], p: { desde?: string; hasta?: string } = {}) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const sociedades = await sociedadesDelAlcance(alcance);
    const [todos, identificadores] = await Promise.all([debitosConPagoDelBanco(), identificadoresDelCatalogo()]);
    const debitos: DebitoConPago[] = todos
      .filter((d) => !sociedades || sociedades.includes(d.cuenta.sociedadId))
      .filter((d) => (!p.desde || d.fecha.toISOString().slice(0, 10) >= p.desde) && (!p.hasta || d.fecha.toISOString().slice(0, 10) <= p.hasta))
      .map((d) => ({
        fecha: d.fecha, descripcion: d.descripcion, sociedad: etiquetaSociedad(d.cuenta.sociedad), cuenta: enmascararCuenta(d.cuenta.numero),
        banco: d.cuenta.banco, referencia: d.referencia, monto: aNumero(d.debito), moneda: d.cuenta.moneda, hoja: d.hoja, fila: d.fila,
        archivo: { id: d.archivo.id, rutaRelativa: d.archivo.ruta },
      }));
    return { alcance, debitos, identificadores };
  };

  app.get("/api/movimientos-sin-obligacion", async (req, reply) => {
    const p = periodo.safeParse(req.query);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Fechas inválidas" });
    const { alcance, debitos, identificadores } = await cargar(req, p.data);
    const datos = movimientosSinObligacion(debitos, identificadores);
    return {
      alcance: alcanceParaRespuesta(alcance),
      datos,
      totalGrupos: datos.length,
      totalPagos: datos.reduce((s, g) => s + g.pagos, 0),
    };
  });

  app.get("/api/movimientos-sin-obligacion/detalle", async (req, reply) => {
    const clave = String((req.query as { clave?: unknown }).clave ?? "");
    if (!clave) return reply.code(400).send({ error: "Indique el grupo que quiere ver" });
    const p = periodo.safeParse(req.query);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Fechas inválidas" });
    const { debitos, identificadores } = await cargar(req, p.data);
    const d = detalleDeGrupo(debitos, identificadores, clave);
    if (!d) return reply.code(404).send({ error: "No se encontró ese grupo de pagos" });
    return { datos: d };
  });
}
