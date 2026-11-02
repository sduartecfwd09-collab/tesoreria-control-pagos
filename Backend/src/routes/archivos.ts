import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enmascararCuenta, nombreDeArchivoSeguro } from "../domain/enmascarar.js";
import { estadoDeArchivo, motivoDeArchivo } from "../domain/estado-archivo.js";
import { esImagenNoLegible, esSinMovimientos, textoSaldoDeDetalle, type ContinuidadGuardada } from "../domain/saldo.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { alcanceDe, sociedadesDelAlcance } from "../identidad/alcance.js";
import { archivoParaJustificar, obtenerArchivoRegistrado } from "../repositories/consultas.js";
import { normalizarMotivo } from "../domain/cambio-dia.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import { justificacionDeArchivoTieneEfecto, leerDatos, motivosDeProblema } from "../domain/justificacion.js";
import { autorDe, exigirPersona, puedeEscribirEnSociedad, SIN_PERMISO_SOCIEDAD } from "../identidad/exigir-persona.js";
import { usuarioActual } from "../identidad/usuario-actual.js";
import { justificacionVigenteDeArchivo } from "../repositories/decisiones.js";
import { justificarArchivo, problemaActualDeArchivo, quitarJustificacionDeArchivo, sociedadDeArchivo } from "../justificaciones/archivo.js";
import type { Reloj } from "../domain/reloj.js";

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
    // justificación: el problema de ahora, quién la hizo y si sigue teniendo efecto, y si esta persona puede actuar
    const j = await archivoParaJustificar(a.id);
    const problema = j ? problemaActualDeArchivo(j) : null;
    const vigente = await justificacionVigenteDeArchivo(a.id);
    const conEfecto = vigente !== null && j !== null && problema !== null && justificacionDeArchivoTieneEfecto(vigente, { hash: j.hash, problema });
    const persona = await usuarioActual(req, opts.modoPruebas);
    const puedeActuar = persona !== null && j !== null && puedeEscribirEnSociedad(persona, sociedadDeArchivo(j) ?? { tesoreroId: null });
    return {
      datos: {
        problema,
        justificacion: vigente ? { quien: vigente.nombreUsuario, cuando: vigente.creadoEn.toISOString(), motivo: vigente.motivo, nota: leerDatos(vigente.datos).nota, sinEfecto: !conEfecto } : null,
        motivosPosibles: problema ? motivosDeProblema(problema) : [],
        puedeJustificar: puedeActuar && problema !== null && !conEfecto,
        puedeQuitarJustificacion: puedeActuar && vigente !== null,
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
        saldo: textoSaldoDeDetalle(d),
        sinMovimientos: esSinMovimientos(d.continuidad),
        imagenNoLegible: esImagenNoLegible(d.continuidad),
      },
    };
  });
}

/** Justificar un archivo que requiere atención y quitar la justificación. 401 sin persona, 404 si no existe, 403 fuera de su sociedad (sin sociedad, solo Jefatura). */
export async function rutasJustificarArchivos(app: FastifyInstance, opts: { modoPruebas: boolean; reloj: Reloj }) {
  const cargar = async (req: Parameters<typeof exigirPersona>[0], reply: Parameters<typeof exigirPersona>[1]) => {
    const persona = await exigirPersona(req, reply, opts.modoPruebas);
    if (!persona) return null;
    const id = z.coerce.number().int().positive().safeParse((req.params as { id: string }).id);
    if (!id.success) {
      reply.code(400).send({ error: "Identificador inválido" });
      return null;
    }
    const archivo = await archivoParaJustificar(id.data);
    if (!archivo || archivo.retiradoEn) {
      reply.code(404).send({ error: "Archivo no encontrado" });
      return null;
    }
    if (!puedeEscribirEnSociedad(persona, sociedadDeArchivo(archivo) ?? { tesoreroId: null })) {
      reply.code(403).send({ error: SIN_PERMISO_SOCIEDAD });
      return null;
    }
    return { persona, archivo };
  };
  const responder = (reply: Parameters<typeof exigirPersona>[1], e: unknown) => {
    if (!(e instanceof ErrorDeServicio)) throw e;
    const estado = { permiso: 403, validacion: 422, no_encontrado: 404, conflicto: 409 }[e.codigo];
    return reply.code(estado).send({ error: e.message, ...(e.campo ? { campo: e.campo } : {}) });
  };

  app.post("/api/archivos/:id/justificar", async (req, reply) => {
    const g = await cargar(req, reply);
    if (!g) return reply;
    const cuerpo = (req.body ?? {}) as { motivo?: unknown; nota?: unknown };
    try {
      return { datos: await justificarArchivo({ archivo: g.archivo, motivo: cuerpo.motivo, nota: cuerpo.nota, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj) };
    } catch (e) {
      return responder(reply, e);
    }
  });

  app.post("/api/archivos/:id/quitar-justificacion", async (req, reply) => {
    const g = await cargar(req, reply);
    if (!g) return reply;
    const motivo = normalizarMotivo(((req.body ?? {}) as { motivo?: unknown }).motivo);
    if (motivo === null) return reply.code(422).send({ error: "Indique el motivo (entre 3 y 300 caracteres)", campo: "motivo" });
    try {
      await quitarJustificacionDeArchivo({ archivo: g.archivo, motivo, autor: autorDe(g.persona, opts.modoPruebas) }, opts.reloj);
      return { datos: { ok: true } };
    } catch (e) {
      return responder(reply, e);
    }
  });
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}
