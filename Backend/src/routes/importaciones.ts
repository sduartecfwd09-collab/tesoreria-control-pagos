import type { FastifyInstance } from "fastify";
import { calcularCobertura } from "../domain/cobertura.js";
import { coberturaSegura, enmascararCuenta, nombreDeArchivoSeguro, textoSeguro } from "../domain/enmascarar.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { hayImportacionEnCurso } from "../ingest/importar-carpeta.js";
import { listarArchivos, listarCuentas } from "../repositories/consultas.js";

// Estas rutas solo muestran el estado de lo importado. La importación se ejecuta desde el Backend (npm run reimportar).
// Ninguna respuesta incluye rutas de archivo ni números de cuenta completos: solo el nombre del archivo y los últimos 4 de la cuenta.

type DetalleArchivo = {
  advertencias?: string[];
  discrepancias?: { tipo: string; mensaje: string }[];
  continuidad?: unknown;
  monedaOrigen?: string;
  filasPieIgnoradas?: number;
};

export async function rutasImportaciones(app: FastifyInstance) {
  app.get("/api/importaciones", async () => {
    const archivos = await listarArchivos();
    const datos = archivos.map((a) => {
      const d = (a.detalle ?? {}) as DetalleArchivo;
      return {
        id: a.id, archivo: nombreDeArchivoSeguro(a.ruta), sociedad: a.sociedad, cuenta: a.cuenta === null ? null : enmascararCuenta(a.cuenta),
        formato: a.formato, mes: a.mes, estado: a.estado, movimientos: a.numMovimientos, duplicados: a.numDuplicados,
        error: textoSeguro(a.error), motivo: textoSeguro(a.motivo),
        advertencias: (d.advertencias ?? []).map((t) => textoSeguro(t)),
        discrepancias: (d.discrepancias ?? []).map((x) => ({ tipo: x.tipo, mensaje: textoSeguro(x.mensaje) })),
        continuidad: d.continuidad ?? null, monedaOrigen: d.monedaOrigen ?? null,
        leidoEn: a.leidoEn?.toISOString() ?? null,
      };
    });
    return {
      datos,
      resumen: {
        archivos: datos.length,
        leidos: datos.filter((a) => a.estado === "leido").length,
        conError: datos.filter((a) => a.estado === "error").length,
        enRevision: datos.filter((a) => a.estado === "en_revision").length,
        movimientos: datos.reduce((s, a) => s + a.movimientos, 0),
      },
      enCurso: hayImportacionEnCurso(),
    };
  });

  app.get("/api/cobertura", async () => {
    const archivos = await listarArchivos();
    return { datos: coberturaSegura(calcularCobertura(archivos)) };
  });

  app.get("/api/cuentas", async () => {
    const cuentas = await listarCuentas();
    return {
      datos: cuentas.map((c) => ({
        id: c.id, sociedad: etiquetaSociedad(c.sociedad), numero: enmascararCuenta(c.numero), banco: c.banco, bancoPorConfirmar: c.bancoPorConfirmar,
        codigoBanco: c.codigoBanco, formato: c.formato, moneda: c.moneda, monedaPorConfirmar: c.monedaPorConfirmar,
      })),
    };
  });
}
