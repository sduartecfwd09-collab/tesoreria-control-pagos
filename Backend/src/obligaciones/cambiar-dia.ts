// Cambio PERMANENTE del día de pago de una obligación, desde un mes (AAAA-MM) en adelante. No toca los meses anteriores; el calendario usa
// el día que rige en cada periodo (domain/vencimientos.ts, diaDelPeriodo). Si el cambio rige desde un mes posterior al actual y el vencimiento del
// mes en curso sigue pendiente, hay que decir si el nuevo día también aplica a este mes (aplicaAlMesEnCurso). Los permisos (persona y sociedad)
// los verifica la ruta; aquí van las reglas del negocio. El registro del historial se guarda en la MISMA transacción.
import { prisma } from "../db.js";
import { diaValido, normalizarMotivo } from "../domain/cambio-dia.js";
import { lineaDeCambiarDia, validarDesdeMes } from "../domain/mover-fecha.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import { hoyDe, periodoDe, type Reloj } from "../domain/reloj.js";
import { diaDelPeriodo, ESTADOS_PAGADOS } from "../domain/vencimientos.js";
import { cambiosDiaProgramados, registrarCambioPermanente, vencimientoDelPeriodo } from "../repositories/cambios-dia.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";
import { actualizarVencimientos } from "../vencimientos/mantenimiento.js";

export type ObligacionParaCambiarDia = { id: number; sociedadId: number; diaEsperadoPago: number | null };

export interface ResultadoCambioDia {
  /** el mes desde el que rige de verdad el nuevo día (el en curso si se eligió aplicarlo también a este mes) */
  desde: string;
  dia: number;
  /** vencimientos futuros del calendario que se corrigieron */
  actualizados: number;
}

/** ¿El vencimiento del mes en curso sigue pendiente y aún no pasó su fecha? (solo entonces tiene sentido preguntar). */
const estaPendienteYFuturo = (v: { fecha: Date; estado: string } | null, hoy: Date): boolean =>
  v !== null && v.fecha >= hoy && !ESTADOS_PAGADOS.includes(v.estado) && v.estado !== "justificado";

export async function cambiarDia(
  d: { obligacion: ObligacionParaCambiarDia; nuevoDia: unknown; desdeMes: unknown; aplicaAlMesEnCurso: unknown; motivo: unknown; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<ResultadoCambioDia> {
  const o = d.obligacion;
  const hoy = hoyDe(reloj);
  const mesEnCurso = periodoDe(hoy);
  if (!diaValido(d.nuevoDia)) throw new ErrorDeServicio("validacion", "El día de pago debe ser un número entero de 1 a 31", "nuevoDia");
  const desde = validarDesdeMes(d.desdeMes, mesEnCurso);
  if (!desde.ok) throw new ErrorDeServicio("validacion", desde.error, "desdeMes");
  const motivo = normalizarMotivo(d.motivo);
  if (motivo === null) throw new ErrorDeServicio("validacion", "Indique el motivo (entre 3 y 300 caracteres)", "motivo");
  if (o.diaEsperadoPago === null) throw new ErrorDeServicio("validacion", "Esta obligación todavía no tiene día de pago: indíquelo al editarla", "nuevoDia");

  const cambios = (await cambiosDiaProgramados([o.id])).get(o.id) ?? [];
  const planBase = { diaEsperadoPago: o.diaEsperadoPago, cambiosDia: cambios };
  if (diaDelPeriodo(planBase, desde.desde) === d.nuevoDia) throw new ErrorDeServicio("validacion", "Ese ya es el día de pago que rige desde ese mes", "nuevoDia");

  // ¿hay que preguntar por el mes en curso? Solo si el cambio empieza después, el pago de este mes sigue pendiente y el día cambiaría
  let efectivo = desde.desde;
  if (desde.desde > mesEnCurso) {
    const actual = await vencimientoDelPeriodo(o.id, mesEnCurso);
    const cambiaria = diaDelPeriodo(planBase, mesEnCurso) !== d.nuevoDia;
    if (cambiaria && estaPendienteYFuturo(actual, hoy)) {
      if (typeof d.aplicaAlMesEnCurso !== "boolean") {
        throw new ErrorDeServicio("validacion", "Este mes todavía hay un pago pendiente de esta obligación. Indique si el nuevo día también aplica a este mes.", "aplicaAlMesEnCurso");
      }
      if (d.aplicaAlMesEnCurso) efectivo = mesEnCurso;
    }
  }

  const diaAnterior = diaDelPeriodo(planBase, efectivo);
  await prisma.$transaction(async (tx) => {
    await registrarCambioPermanente(tx, {
      obligacionId: o.id, diaAnterior, diaNuevo: d.nuevoDia as number, desde: efectivo, motivo, usuarioId: d.autor.id, modoPruebas: d.autor.modoPruebas, cambiaElDiaBase: efectivo <= mesEnCurso,
    });
    await insertarHistorial(tx, { obligacionId: o.id, sociedadId: o.sociedadId, autor: d.autor, lineas: [lineaDeCambiarDia(diaAnterior, d.nuevoDia as number, efectivo)], motivo });
  });
  const { calendario } = await actualizarVencimientos(reloj, o.id);
  return { desde: efectivo, dia: d.nuevoDia as number, actualizados: calendario.actualizados };
}
