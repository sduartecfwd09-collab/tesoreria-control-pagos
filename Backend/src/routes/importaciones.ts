import type { FastifyInstance } from "fastify";
import { calcularCobertura } from "../domain/cobertura.js";
import { coberturaSegura, enmascararCuenta, nombreDeArchivoSeguro, textoSeguro } from "../domain/enmascarar.js";
import { estadoDeArchivo, motivoDeArchivo, resumirEstados } from "../domain/estado-archivo.js";
import { resumirImagenes } from "../domain/imagenes.js";
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
  conImagenes?: boolean;
};

export async function rutasImportaciones(app: FastifyInstance) {
  app.get("/api/importaciones", async () => {
    const archivos = await listarArchivos();
    const datos = archivos.map((a) => {
      const d = (a.detalle ?? {}) as DetalleArchivo;
      return {
        id: a.id, archivo: nombreDeArchivoSeguro(a.ruta), sociedad: a.sociedad, cuenta: a.cuenta === null ? null : enmascararCuenta(a.cuenta),
        formato: a.formato, mes: a.mes, estado: estadoDeArchivo(a),
        // un retirado no cuenta: sus movimientos no suman a los totales
        movimientos: a.retiradoEn ? 0 : a.numMovimientos, duplicados: a.retiradoEn ? 0 : a.numDuplicados,
        // una sola razón visible: el error de lectura o el motivo de revisión (null si el archivo está bien o retirado)
        motivo: textoSeguro(motivoDeArchivo(a)),
        retiradoEn: a.retiradoEn?.toISOString() ?? null,
        advertencias: (d.advertencias ?? []).map((t) => textoSeguro(t)),
        discrepancias: (d.discrepancias ?? []).map((x) => ({ tipo: x.tipo, mensaje: textoSeguro(x.mensaje) })),
        continuidad: d.continuidad ?? null, monedaOrigen: d.monedaOrigen ?? null,
        // el lector ignora las imágenes (sin OCR); null = archivo leído antes de registrar este dato
        conImagenes: typeof d.conImagenes === "boolean" ? d.conImagenes : null,
        leidoEn: a.leidoEn?.toISOString() ?? null,
      };
    });
    return {
      datos,
      // Archivos = Leídos + Con error + Sin sociedad; los retirados de la carpeta se cuentan aparte
      resumen: {
        ...resumirEstados(datos.map((a) => a.estado)),
        movimientos: datos.reduce((s, a) => s + a.movimientos, 0),
      },
      imagenes: resumirImagenes(archivos),
      enCurso: hayImportacionEnCurso(),
    };
  });

  app.get("/api/cobertura", async () => {
    const archivos = (await listarArchivos()).filter((a) => a.retiradoEn === null);
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
