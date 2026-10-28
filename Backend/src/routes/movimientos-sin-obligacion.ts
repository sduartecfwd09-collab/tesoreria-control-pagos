import type { FastifyInstance } from "fastify";
import { enmascararCuenta } from "../domain/enmascarar.js";
import { movimientosSinObligacion } from "../domain/movimientos-sin-obligacion.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { debitosConPagoDelBanco, identificadoresDelCatalogo } from "../repositories/cruce.js";

// Solo lectura. Informa los pagos «Pago:PROVEEDOR número» del banco 0107 (formato E1) cuyo número no está en el catálogo.
// No crea obligaciones. Solo débitos: los créditos nunca entran (no cuentan como pago).
export async function rutasMovimientosSinObligacion(app: FastifyInstance) {
  app.get("/api/movimientos-sin-obligacion", async () => {
    const [debitos, identificadores] = await Promise.all([debitosConPagoDelBanco(), identificadoresDelCatalogo()]);
    const datos = movimientosSinObligacion(
      debitos.map((d) => ({ fecha: d.fecha, descripcion: d.descripcion, sociedad: etiquetaSociedad(d.cuenta.sociedad), cuenta: enmascararCuenta(d.cuenta.numero) })),
      identificadores,
    );
    return {
      datos,
      totalGrupos: datos.length,
      totalPagos: datos.reduce((s, g) => s + g.pagos, 0),
      nota: "Revisar con Tesorería si debe agregarse al catálogo.",
    };
  });
}
