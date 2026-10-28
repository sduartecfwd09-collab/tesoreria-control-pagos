import type { FastifyInstance } from "fastify";
import { alcanceDe, alcanceParaRespuesta, sociedadesDelAlcance } from "../identidad/alcance.js";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { movimientosSinObligacion } from "../domain/movimientos-sin-obligacion.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { debitosConPagoDelBanco, identificadoresDelCatalogo } from "../repositories/cruce.js";

// Solo lectura. Informa los pagos «Pago:PROVEEDOR número» del banco 0107 (formato E1) cuyo número no está en el catálogo.
// No crea obligaciones. Un tesorero ve solo las sociedades de su responsabilidad. Solo débitos: los créditos nunca entran (no cuentan como pago).
export async function rutasMovimientosSinObligacion(app: FastifyInstance, opts: { modoPruebas: boolean }) {
  app.get("/api/movimientos-sin-obligacion", async (req) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const sociedades = await sociedadesDelAlcance(alcance);
    const [todos, identificadores] = await Promise.all([debitosConPagoDelBanco(), identificadoresDelCatalogo()]);
    const debitos = todos.filter((d) => !sociedades || sociedades.includes(d.cuenta.sociedadId));
    const datos = movimientosSinObligacion(
      debitos.map((d) => ({ fecha: d.fecha, descripcion: d.descripcion, sociedad: etiquetaSociedad(d.cuenta.sociedad), cuenta: enmascararCuenta(d.cuenta.numero) })),
      identificadores,
    );
    return {
      alcance: alcanceParaRespuesta(alcance),
      datos,
      totalGrupos: datos.length,
      totalPagos: datos.reduce((s, g) => s + g.pagos, 0),
    };
  });
}
