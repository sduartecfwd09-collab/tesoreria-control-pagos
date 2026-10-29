import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enmascararCuenta, nombreDeArchivoSeguro } from "../domain/enmascarar.js";
import { estadoDeArchivo, motivoDeArchivo } from "../domain/estado-archivo.js";
import { esSoloImagen, textoSaldoDeDetalle, type ContinuidadGuardada } from "../domain/saldo.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { alcanceDe, sociedadesDelAlcance } from "../identidad/alcance.js";
import { obtenerArchivoRegistrado } from "../repositories/consultas.js";

// Información de un archivo registrado (solo lectura). Privada y con el mismo alcance que Estados de cuenta (un tesorero,
// solo las sociedades de su responsabilidad). No entrega el archivo ni lo abre: Tesorería pidió no duplicar los archivos en
// los computadores; el archivo se abre desde su OneDrive con la ruta relativa que muestra la ficha.
type DetalleArchivo = {
  hojaLeida?: string;
  continuidad?: ContinuidadGuardada;
  conImagenes?: boolean;
  saldoInicial?: number | null;
  saldoFinal?: number | null;
  periodoDeclarado?: { del: string | null; al: string | null } | null;
  fechas?: { del: string; al: string } | null;
};

export async function rutasArchivos(app: FastifyInstance, opts: { modoPruebas: boolean }) {
  const idParam = z.coerce.number().int().positive();

  /** El archivo si existe, no está retirado y es de una sociedad del alcance; null si no (no se distingue «no existe» de «no es suyo»). */
  const visible = async (req: Parameters<typeof alcanceDe>[0], idTexto: string) => {
    const id = idParam.safeParse(idTexto);
    if (!id.success) return null;
    const a = await obtenerArchivoRegistrado(id.data);
    if (!a || a.retiradoEn) return null;
    const sociedades = await sociedadesDelAlcance(await alcanceDe(req, opts.modoPruebas));
    if (sociedades && (a.sociedadId === null || !sociedades.includes(a.sociedadId))) return null;
    return a;
  };

  app.get("/api/archivos/:id", async (req, reply) => {
    const a = await visible(req, (req.params as { id: string }).id);
    if (!a) return reply.code(404).send({ error: "Archivo no encontrado" });
    const d = (a.detalle ? safeJson(a.detalle) : {}) as DetalleArchivo;
    return {
      datos: {
        id: a.id,
        nombre: nombreDeArchivoSeguro(a.ruta),
        // la ruta relativa dentro de la carpeta de fuentes (no la de la computadora): sirve para ubicar el archivo en OneDrive
        rutaRelativa: a.ruta,
        estado: estadoDeArchivo(a),
        motivoArchivo: motivoDeArchivo(a),
        sociedad: a.sociedad ? etiquetaSociedad(a.sociedad) : null,
        cuenta: a.cuenta ? enmascararCuenta(a.cuenta.numero) : null,
        banco: a.cuenta?.banco ?? null,
        moneda: a.cuenta?.moneda ?? null,
        formato: a.formato,
        mes: a.mes,
        hoja: d.hojaLeida ?? null,
        periodoDeclarado: d.periodoDeclarado ?? null,
        fechas: d.fechas ?? null,
        filasLeidas: a.numMovimientos + a.numDuplicados,
        movimientos: a.numMovimientos,
        duplicados: a.numDuplicados,
        // en centavos; null = no detectado (o archivo leído antes de registrar este dato)
        saldoInicial: d.saldoInicial ?? null,
        saldoFinal: d.saldoFinal ?? null,
        saldo: textoSaldoDeDetalle(d, a.numMovimientos + a.numDuplicados),
        soloImagen: esSoloImagen(d.conImagenes, a.numMovimientos + a.numDuplicados),
      },
    };
  });
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}
