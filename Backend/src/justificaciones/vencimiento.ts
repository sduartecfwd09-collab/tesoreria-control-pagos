// Justificar a mano un vencimiento Vencido o Sin información, y quitar la justificación. La decisión es una DecisionManual que el motor de cruce
// consulta DESPUÉS de calcular el estado; cada acción escribe su línea en el historial en la MISMA transacción y luego se recalcula. Los permisos
// (persona y sociedad) los verifica la ruta; aquí van las reglas del negocio.
import { prisma } from "../db.js";
import { ESTADOS_JUSTIFICABLES, datosDeJustificacion, MOTIVOS_VENCIMIENTO, motivoParaHistorial, validarMotivoYNota } from "../domain/justificacion.js";
import { lineaDeJustificarVencimiento, lineaDeQuitarJustificacionVencimiento } from "../domain/historial.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import type { Reloj } from "../domain/reloj.js";
import { crearJustificacionVencimiento, justificacionVigenteDeVencimiento, revertirDecision } from "../repositories/decisiones.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";
import { vencimientoParaAsociar } from "../repositories/vencimientos.js";
import { actualizarVencimientos } from "../vencimientos/mantenimiento.js";

type VencimientoJustificable = NonNullable<Awaited<ReturnType<typeof vencimientoParaAsociar>>>;

const esViolacionUnica = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

export async function justificarVencimiento(
  d: { vencimiento: VencimientoJustificable; motivo: unknown; nota: unknown; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ estado: string }> {
  const v = d.vencimiento;
  if (!ESTADOS_JUSTIFICABLES.includes(v.estado)) throw new ErrorDeServicio("conflicto", "Este vencimiento no se puede justificar: solo los que están vencidos o sin información.");
  const r = validarMotivoYNota(MOTIVOS_VENCIMIENTO, d.motivo, d.nota);
  if (!r.ok) throw new ErrorDeServicio("validacion", r.error, r.campo);
  try {
    await prisma.$transaction(async (tx) => {
      if (await justificacionVigenteDeVencimiento(v.obligacionId, v.periodo, tx)) throw new ErrorDeServicio("conflicto", "Este vencimiento ya está justificado.");
      await crearJustificacionVencimiento(tx, {
        sociedadId: v.sociedadId, obligacionId: v.obligacionId, periodo: v.periodo, motivo: r.motivo.texto, datos: datosDeJustificacion({ clave: r.motivo.clave, nota: r.nota }), autor: d.autor,
      });
      await insertarHistorial(tx, {
        obligacionId: v.obligacionId, sociedadId: v.sociedadId, autor: d.autor, lineas: [lineaDeJustificarVencimiento(v.periodo)], motivo: motivoParaHistorial(r.motivo.texto, r.nota), entidad: "vencimiento", entidadId: v.id,
      });
    });
  } catch (e) {
    if (esViolacionUnica(e)) throw new ErrorDeServicio("conflicto", "Este vencimiento ya está justificado.");
    throw e;
  }
  await actualizarVencimientos(reloj, v.obligacionId);
  return { estado: (await vencimientoParaAsociar(v.id))?.estado ?? "justificado" };
}

export async function quitarJustificacionDeVencimiento(
  d: { vencimiento: VencimientoJustificable; motivo: string; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ estado: string }> {
  const v = d.vencimiento;
  await prisma.$transaction(async (tx) => {
    const vigente = await justificacionVigenteDeVencimiento(v.obligacionId, v.periodo, tx);
    if (!vigente) throw new ErrorDeServicio("conflicto", "Este vencimiento no está justificado.");
    if (!(await revertirDecision(tx, vigente.id, d.motivo, d.autor))) throw new ErrorDeServicio("conflicto", "La justificación ya se había quitado.");
    await insertarHistorial(tx, {
      obligacionId: v.obligacionId, sociedadId: v.sociedadId, autor: d.autor, lineas: [lineaDeQuitarJustificacionVencimiento(v.periodo)], motivo: d.motivo, entidad: "vencimiento", entidadId: v.id,
    });
  });
  await actualizarVencimientos(reloj, v.obligacionId);
  return { estado: (await vencimientoParaAsociar(v.id))?.estado ?? "vencido" };
}
