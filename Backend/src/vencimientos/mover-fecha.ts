// «Mover fecha» (solo este mes): cambia la fecha de UN vencimiento sin tocar el día de la obligación ni los demás meses, y «Quitar movimiento»
// lo devuelve a su fecha original. Cada acción escribe su línea en el historial en la MISMA transacción y luego se recalcula el cruce.
// Los permisos (persona y sociedad) los verifica la ruta; aquí van las reglas del negocio.
import { prisma } from "../db.js";
import { normalizarMotivo } from "../domain/cambio-dia.js";
import { ESTADOS_MOVIBLES, lineaDeMoverFecha, lineaDeQuitarMovimiento, topeDeMover, validarNuevaFecha } from "../domain/mover-fecha.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import type { Reloj } from "../domain/reloj.js";
import { registrarMovimiento, registrarQuitarMovimiento } from "../repositories/cambios-dia.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";
import { valorGlobal } from "../repositories/parametros.js";
import { vencimientoParaAsociar } from "../repositories/vencimientos.js";
import { actualizarVencimientos } from "./mantenimiento.js";

type VencimientoMovible = NonNullable<Awaited<ReturnType<typeof vencimientoParaAsociar>>>;
const iso = (f: Date) => f.toISOString().slice(0, 10);
const CONFLICTO = "Este vencimiento cambió mientras lo veía. Actualice la pantalla y vuelva a intentarlo.";

/** Solo se mueve en Programado, Por vencer, Vencido o Sin información; el resto se explica con su propia salida. */
function exigirMovible(estado: string): void {
  if (ESTADOS_MOVIBLES.includes(estado)) return;
  if (estado === "justificado") throw new ErrorDeServicio("conflicto", "Este vencimiento está justificado: primero quite la justificación para poder mover la fecha.");
  if (estado === "pagado" || estado === "pagado_con_inconsistencia") throw new ErrorDeServicio("conflicto", "Un vencimiento pagado no se puede mover.");
  throw new ErrorDeServicio("conflicto", "Este vencimiento no admite mover la fecha: solo los programados, por vencer, vencidos o sin información.");
}

export async function moverFecha(
  d: { vencimiento: VencimientoMovible; nuevaFecha: unknown; motivo: unknown; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ fecha: string; fechaOriginal: string }> {
  const v = d.vencimiento;
  exigirMovible(v.estado);
  const motivo = normalizarMotivo(d.motivo);
  if (motivo === null) throw new ErrorDeServicio("validacion", "Indique el motivo (entre 3 y 300 caracteres)", "motivo");
  const original = v.fechaOriginal ?? v.fecha;
  const r = validarNuevaFecha(d.nuevaFecha, v.fecha, original, topeDeMover(await valorGlobal("mover_fecha_max_dias")));
  if (!r.ok) throw new ErrorDeServicio("validacion", r.error, "nuevaFecha");
  await prisma.$transaction(async (tx) => {
    const ok = await registrarMovimiento(tx, {
      vencimientoId: v.id, obligacionId: v.obligacionId, fechaVista: v.fecha, fechaNueva: r.fecha, fechaOriginal: original, motivo, usuarioId: d.autor.id, modoPruebas: d.autor.modoPruebas,
    });
    if (!ok) throw new ErrorDeServicio("conflicto", CONFLICTO);
    await insertarHistorial(tx, {
      obligacionId: v.obligacionId, sociedadId: v.sociedadId, autor: d.autor, lineas: [lineaDeMoverFecha(iso(v.fecha), iso(r.fecha))], motivo, entidad: "vencimiento", entidadId: v.id,
    });
  });
  await actualizarVencimientos(reloj, v.obligacionId);
  return { fecha: iso(r.fecha), fechaOriginal: iso(original) };
}

export async function quitarMovimiento(
  d: { vencimiento: VencimientoMovible; motivo: unknown; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ fecha: string }> {
  const v = d.vencimiento;
  if (v.fechaOriginal === null) throw new ErrorDeServicio("conflicto", "Este vencimiento no tiene la fecha movida.");
  exigirMovible(v.estado);
  const motivo = normalizarMotivo(d.motivo);
  if (motivo === null) throw new ErrorDeServicio("validacion", "Indique el motivo (entre 3 y 300 caracteres)", "motivo");
  const original = v.fechaOriginal;
  await prisma.$transaction(async (tx) => {
    const ok = await registrarQuitarMovimiento(tx, { vencimientoId: v.id, obligacionId: v.obligacionId, fechaVista: v.fecha, fechaOriginal: original, motivo, usuarioId: d.autor.id, modoPruebas: d.autor.modoPruebas });
    if (!ok) throw new ErrorDeServicio("conflicto", CONFLICTO);
    await insertarHistorial(tx, {
      obligacionId: v.obligacionId, sociedadId: v.sociedadId, autor: d.autor, lineas: [lineaDeQuitarMovimiento(iso(v.fecha), iso(original))], motivo, entidad: "vencimiento", entidadId: v.id,
    });
  });
  await actualizarVencimientos(reloj, v.obligacionId);
  return { fecha: iso(original) };
}
