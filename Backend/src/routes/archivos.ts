import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enmascararCuenta, nombreDeArchivoSeguro } from "../domain/enmascarar.js";
import { estadoDeArchivo, motivoDeArchivo } from "../domain/estado-archivo.js";
import { textoSaldo, type ContinuidadGuardada } from "../domain/saldo.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { alcanceDe, sociedadesDelAlcance } from "../identidad/alcance.js";
import { obtenerArchivoRegistrado } from "../repositories/consultas.js";

// Información de un archivo registrado y entrega de una COPIA suya (solo lectura): nunca escribe, mueve ni borra nada en la
// carpeta de fuentes. Privadas y con el mismo alcance que Estados de cuenta (un tesorero, solo las sociedades de su
// responsabilidad). El archivo se identifica SOLO por su id en la base: nunca por una ruta que escriba la persona.
type DetalleArchivo = {
  hojaLeida?: string;
  continuidad?: ContinuidadGuardada;
  saldoInicial?: number | null;
  saldoFinal?: number | null;
  periodoDeclarado?: { del: string | null; al: string | null } | null;
  fechas?: { del: string; al: string } | null;
};

const TAMANO_MAXIMO = 25 * 1024 * 1024;
const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Ruta relativa registrada que es segura de unir con la carpeta de fuentes: relativa, sin «..» ni caracteres raros, y .xlsx. */
export function rutaRelativaSegura(ruta: string): boolean {
  if (!ruta || ruta.includes("\0") || ruta.includes("\\") || path.isAbsolute(ruta) || /^[a-zA-Z]:/.test(ruta)) return false;
  if (ruta.split("/").some((p) => p === ".." || p === "." || p === "")) return false;
  return ruta.toLowerCase().endsWith(".xlsx");
}

export async function rutasArchivos(app: FastifyInstance, opts: { modoPruebas: boolean; raizFuentes?: string }) {
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
        // la ruta relativa dentro de la carpeta de fuentes (no la de la computadora): sirve para ubicar el archivo
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
        saldo: textoSaldo(d.continuidad),
      },
    };
  });

  app.get("/api/archivos/:id/descargar", async (req, reply) => {
    const noSePudo = () => reply.code(404).send({ error: "No se pudo abrir el archivo" });
    const a = await visible(req, (req.params as { id: string }).id);
    if (!a || !opts.raizFuentes || !rutaRelativaSegura(a.ruta)) return noSePudo();
    let contenido: Buffer;
    try {
      const raiz = await realpath(opts.raizFuentes);
      const real = await realpath(path.resolve(raiz, ...a.ruta.split("/")));
      if (!real.startsWith(raiz + path.sep)) return noSePudo(); // un enlace que salga de la carpeta de fuentes
      const info = await stat(real);
      if (!info.isFile() || info.size > TAMANO_MAXIMO) return noSePudo();
      contenido = await readFile(real);
    } catch {
      return noSePudo();
    }
    const nombre = a.ruta.split("/").pop()!;
    const ascii = nombre.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return reply
      .header("Content-Type", TIPO_XLSX)
      .header("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`)
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(contenido);
  });
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}
