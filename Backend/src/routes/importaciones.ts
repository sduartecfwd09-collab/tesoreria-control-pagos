import type { FastifyInstance } from "fastify";
import { alcanceDe, alcanceParaRespuesta, sociedadesDelAlcance } from "../identidad/alcance.js";
import { calcularCobertura } from "../domain/cobertura.js";
import { coberturaSegura, enmascararCuenta, nombreDeArchivoSeguro, textoSeguro } from "../domain/enmascarar.js";
import { estadoDeArchivo, motivoDeArchivo, resumirEstados } from "../domain/estado-archivo.js";
import { esSoloImagen, textoSaldoDeDetalle, type ContinuidadGuardada } from "../domain/saldo.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { hayImportacionEnCurso } from "../ingest/importar-carpeta.js";
import { listarArchivos, listarCuentas } from "../repositories/consultas.js";

// Estas rutas solo muestran el estado de lo importado. La importación se ejecuta desde el Backend (npm run reimportar).
// Ninguna respuesta incluye rutas de archivo ni números de cuenta completos: solo el nombre del archivo y los últimos 4 de la cuenta.

type DetalleArchivo = {
  advertencias?: string[];
  discrepancias?: { tipo: string; mensaje: string }[];
  continuidad?: unknown;
  fechas?: { del: string; al: string } | null;
  periodoDeclarado?: { del: string | null; al: string | null } | null;
  monedaOrigen?: string;
  filasPieIgnoradas?: number;
  conImagenes?: boolean;
};

export async function rutasImportaciones(app: FastifyInstance, opts: { modoPruebas: boolean }) {
  app.get("/api/importaciones", async (req) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const sociedades = await sociedadesDelAlcance(alcance);
    // un archivo sin sociedad asignada no es de ninguna sociedad: solo lo ve quien ve todo
    const archivos = (await listarArchivos()).filter((a) => !sociedades || (a.sociedadId !== null && sociedades.includes(a.sociedadId)));
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
        continuidad: d.continuidad ?? null,
        // resultado del saldo en lenguaje claro: Cuadra, No cuadra o No verificable, con su motivo
        saldo: textoSaldoDeDetalle({ continuidad: d.continuidad as ContinuidadGuardada | undefined, conImagenes: d.conImagenes }, a.numMovimientos + a.numDuplicados),
        // el archivo solo trae una captura del estado de cuenta: sin movimientos y con imagen (el lector no lee imágenes)
        soloImagen: estadoDeArchivo(a) === "leido" && esSoloImagen(d.conImagenes, a.numMovimientos + a.numDuplicados),
        fechas: d.fechas ?? null, periodoDeclarado: d.periodoDeclarado ?? null,
        monedaOrigen: d.monedaOrigen ?? null,
        // el lector ignora las imágenes (sin OCR); null = archivo leído antes de registrar este dato
        conImagenes: typeof d.conImagenes === "boolean" ? d.conImagenes : null,
        leidoEn: a.leidoEn?.toISOString() ?? null,
      };
    });
    return {
      alcance: alcanceParaRespuesta(alcance),
      datos,
      // Archivos = Leídos + Con error + Sin sociedad; los retirados de la carpeta se cuentan aparte
      resumen: {
        ...resumirEstados(datos.map((a) => a.estado)),
        movimientos: datos.reduce((s, a) => s + a.movimientos, 0),
      },
      enCurso: hayImportacionEnCurso(),
    };
  });

  app.get("/api/cobertura", async (req) => {
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const sociedades = await sociedadesDelAlcance(alcance);
    const archivos = (await listarArchivos()).filter((a) => a.retiradoEn === null && (!sociedades || (a.sociedadId !== null && sociedades.includes(a.sociedadId))));
    return { alcance: alcanceParaRespuesta(alcance), datos: coberturaSegura(calcularCobertura(archivos)) };
  });

  app.get("/api/cuentas", async (req) => {
    const sociedades = await sociedadesDelAlcance(await alcanceDe(req, opts.modoPruebas));
    const cuentas = (await listarCuentas()).filter((c) => !sociedades || sociedades.includes(c.sociedadId));
    return {
      datos: cuentas.map((c) => ({
        id: c.id, sociedad: etiquetaSociedad(c.sociedad), numero: enmascararCuenta(c.numero), banco: c.banco, bancoPorConfirmar: c.bancoPorConfirmar,
        codigoBanco: c.codigoBanco, formato: c.formato, moneda: c.moneda, monedaPorConfirmar: c.monedaPorConfirmar,
      })),
    };
  });
}
