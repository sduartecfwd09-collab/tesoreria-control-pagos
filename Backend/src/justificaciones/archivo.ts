// Justificar a mano un archivo de Estados de cuenta que requiere atención, y quitar la justificación. Se ancla al archivo (su id es estable: la
// reimportación actualiza la misma fila por su ruta) con su hash como huella y el tipo de problema en `datos`. Si el archivo cambia de contenido o
// aparece otro problema, la justificación queda sin efecto (no se borra). Solo «El banco confirma que no hubo movimientos» en una imagen no legible
// da cobertura (lo aplica la cobertura al leer la decisión); por eso, tras cada acción, se recalcula.
import { prisma } from "../db.js";
import {
  datosDeJustificacion, justificacionDeArchivoTieneEfecto, motivoParaHistorial, motivosDeProblema, problemaDeArchivo, validarMotivoYNota, type ProblemaArchivo,
} from "../domain/justificacion.js";
import { lineaDeJustificarArchivo, lineaDeQuitarJustificacionArchivo } from "../domain/historial.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import type { Reloj } from "../domain/reloj.js";
import { archivoParaJustificar } from "../repositories/consultas.js";
import { crearJustificacionArchivo, justificacionVigenteDeArchivo, revertirDecision } from "../repositories/decisiones.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";
import { actualizarVencimientos } from "../vencimientos/mantenimiento.js";

export type ArchivoJustificable = NonNullable<Awaited<ReturnType<typeof archivoParaJustificar>>>;

const leerDetalle = (t: string | null): unknown => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

/** La sociedad del archivo: la suya o, si no la tiene, la de su cuenta; null si su carpeta no tiene sociedad. */
export const sociedadDeArchivo = (a: ArchivoJustificable) => a.sociedad ?? a.cuenta?.sociedad ?? null;

/** El problema que tiene el archivo ahora (null = no requiere atención). */
export const problemaActualDeArchivo = (a: ArchivoJustificable): ProblemaArchivo | null =>
  problemaDeArchivo({ estado: a.estado, motivo: a.motivo, error: a.error, retiradoEn: a.retiradoEn, detalle: leerDetalle(a.detalle) });

export async function justificarArchivo(
  d: { archivo: ArchivoJustificable; motivo: unknown; nota: unknown; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ problema: ProblemaArchivo }> {
  const a = d.archivo;
  const problema = problemaActualDeArchivo(a);
  if (problema === null) throw new ErrorDeServicio("conflicto", "Este archivo no requiere atención: no hay nada que justificar.");
  const r = validarMotivoYNota(motivosDeProblema(problema), d.motivo, d.nota);
  if (!r.ok) throw new ErrorDeServicio("validacion", r.error, r.campo);
  const sociedadId = sociedadDeArchivo(a)?.id ?? null;
  try {
    await prisma.$transaction(async (tx) => {
      const vigente = await justificacionVigenteDeArchivo(a.id, tx);
      if (vigente) {
        if (justificacionDeArchivoTieneEfecto(vigente, { hash: a.hash, problema })) throw new ErrorDeServicio("conflicto", "Este archivo ya está justificado.");
        // una justificación anterior que ya no tiene efecto (el archivo cambió) se cierra para dar paso a la nueva; no se borra
        await revertirDecision(tx, vigente.id, "El archivo cambió o tiene otro problema", d.autor);
      }
      await crearJustificacionArchivo(tx, {
        sociedadId, archivoId: a.id, ruta: a.ruta, huella: a.hash, motivo: r.motivo.texto, datos: datosDeJustificacion({ clave: r.motivo.clave, nota: r.nota, problema }), autor: d.autor,
      });
      await insertarHistorial(tx, {
        obligacionId: null, sociedadId, autor: d.autor, lineas: [lineaDeJustificarArchivo(a.mes)], motivo: motivoParaHistorial(r.motivo.texto, r.nota), entidad: "archivo", entidadId: a.id,
      });
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") throw new ErrorDeServicio("conflicto", "Este archivo ya está justificado.");
    throw e;
  }
  await actualizarVencimientos(reloj); // la cobertura de la sociedad pudo cambiar
  return { problema };
}

export async function quitarJustificacionDeArchivo(d: { archivo: ArchivoJustificable; motivo: string; autor: AutorDelCambio }, reloj: Reloj): Promise<void> {
  const a = d.archivo;
  await prisma.$transaction(async (tx) => {
    const vigente = await justificacionVigenteDeArchivo(a.id, tx);
    if (!vigente) throw new ErrorDeServicio("conflicto", "Este archivo no está justificado.");
    if (!(await revertirDecision(tx, vigente.id, d.motivo, d.autor))) throw new ErrorDeServicio("conflicto", "La justificación ya se había quitado.");
    await insertarHistorial(tx, {
      obligacionId: null, sociedadId: vigente.sociedadId, autor: d.autor, lineas: [lineaDeQuitarJustificacionArchivo(a.mes)], motivo: d.motivo, entidad: "archivo", entidadId: a.id,
    });
  });
  await actualizarVencimientos(reloj);
}
