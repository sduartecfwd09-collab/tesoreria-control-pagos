// Servicios del cambio del día de pago. El «día» es el día de pago interno de Tesorería (antes del vencimiento real
// del recibo); «Vencido» = ese día pasó sin pago. Reciben a quien actúa y verifican el permiso: el tesorero asignado
// a la sociedad (en sus sociedades) y Jefatura (en todas). No hay ruta HTTP: la identidad llega con el login (Hito 4A).
import { diaValido, fechaDesdeTexto, normalizarMotivo } from "../domain/cambio-dia.js";
import { ErrorDeServicio, puedeCambiarDiaDe } from "../domain/permisos.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { ESTADOS_PAGADOS } from "../domain/vencimientos.js";
import {
  obligacionConSociedad, registrarCambioDeUnaVez, registrarCambioPermanente, vencimientoConSociedad,
} from "../repositories/cambios-dia.js";
import { obtenerActor } from "../repositories/usuarios.js";

const SIN_PERMISO = "No tiene permiso para cambiar el día de pago de esta sociedad";
const MOTIVO_OBLIGATORIO = "Indique el motivo del cambio (entre 3 y 300 caracteres)";

async function actorDe(id: number) {
  const a = await obtenerActor(id);
  if (!a) throw new ErrorDeServicio("permiso", SIN_PERMISO);
  return a;
}

export interface ResultadoPermanente {
  vencimientosMovidos: number;
}

/** Cambio permanente: afecta solo a los vencimientos futuros no pagados. Los pasados y los pagados no se tocan. */
export async function cambiarDiaPermanente(
  d: { actorId: number; obligacionId: number; diaNuevo: number; motivo: unknown },
  reloj: Reloj,
): Promise<ResultadoPermanente> {
  const actor = await actorDe(d.actorId);
  const o = await obligacionConSociedad(d.obligacionId);
  if (!o) throw new ErrorDeServicio("no_encontrado", "Obligación no encontrada");
  if (!puedeCambiarDiaDe(actor, o.sociedad)) throw new ErrorDeServicio("permiso", SIN_PERMISO);
  const motivo = normalizarMotivo(d.motivo);
  if (!motivo) throw new ErrorDeServicio("validacion", MOTIVO_OBLIGATORIO);
  if (!diaValido(d.diaNuevo)) throw new ErrorDeServicio("validacion", "El día de pago debe ser un número entero de 1 a 31");
  if (o.diaEsperadoPago === d.diaNuevo) throw new ErrorDeServicio("validacion", "El día indicado es el mismo que ya tiene la obligación");
  return registrarCambioPermanente({
    obligacionId: o.id, diaAnterior: o.diaEsperadoPago, diaNuevo: d.diaNuevo, motivo, usuarioId: actor.id, hoy: hoyDe(reloj),
  });
}

/** De una sola vez: cambia la fecha de un vencimiento concreto; el vencimiento conserva su fecha original. */
export async function cambiarFechaDeUnaVez(d: { actorId: number; vencimientoId: number; fechaNueva: unknown; motivo: unknown }): Promise<void> {
  const actor = await actorDe(d.actorId);
  const v = await vencimientoConSociedad(d.vencimientoId);
  if (!v) throw new ErrorDeServicio("no_encontrado", "Vencimiento no encontrado");
  if (!puedeCambiarDiaDe(actor, v.obligacion.sociedad)) throw new ErrorDeServicio("permiso", SIN_PERMISO);
  const motivo = normalizarMotivo(d.motivo);
  if (!motivo) throw new ErrorDeServicio("validacion", MOTIVO_OBLIGATORIO);
  const fechaNueva = fechaDesdeTexto(d.fechaNueva);
  if (!fechaNueva) throw new ErrorDeServicio("validacion", "La fecha nueva debe tener el formato AAAA-MM-DD y ser una fecha real");
  if (ESTADOS_PAGADOS.includes(v.estado) || v._count.conciliaciones > 0) {
    throw new ErrorDeServicio("conflicto", "Un vencimiento pagado o conciliado no se puede mover");
  }
  if (fechaNueva.getTime() === v.fecha.getTime()) throw new ErrorDeServicio("validacion", "La fecha indicada es la misma que ya tiene el vencimiento");
  await registrarCambioDeUnaVez({
    vencimientoId: v.id, obligacionId: v.obligacionId, fechaActual: v.fecha, fechaOriginalActual: v.fechaOriginal,
    fechaNueva, motivo, usuarioId: actor.id,
  });
}
