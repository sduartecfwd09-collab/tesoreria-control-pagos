// Marcar como revisada una obligación «En revisión», y quitar esa revisión. La decisión es una DecisionManual con una huella de los datos que causan la
// revisión; cada acción escribe su línea en el historial en la MISMA transacción. No se recalcula nada: una revisión no cambia los vencimientos (si el dato
// faltante impide generarlos, siguen sin generarse hasta que se complete). Los permisos (persona y sociedad) los verifica la ruta.
import { prisma } from "../db.js";
import { normalizarMotivo } from "../domain/cambio-dia.js";
import { lineaDeMarcarRevisada, lineaDeQuitarRevision } from "../domain/historial.js";
import type { identificadoresRepetidos, ObligacionCalidad } from "../domain/obligaciones.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import { huellaActual, revisionConEfecto } from "../domain/revision.js";
import { crearRevision, revertirDecision, revisionVigenteDeObligacion } from "../repositories/decisiones.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";

export interface ObligacionParaRevisar {
  id: number;
  sociedadId: number;
  /** la obligación tal como está ahora (para sus causas y su huella) */
  calidad: ObligacionCalidad;
  repetidos: ReturnType<typeof identificadoresRepetidos>;
}

const esViolacionUnica = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

export async function marcarRevisada(d: { obligacion: ObligacionParaRevisar; nota: unknown; autor: AutorDelCambio }): Promise<void> {
  const o = d.obligacion;
  const nota = normalizarMotivo(d.nota);
  if (nota === null) throw new ErrorDeServicio("validacion", "Escriba la nota (entre 3 y 300 caracteres)", "nota");
  const actual = huellaActual(o.calidad, o.repetidos);
  if (!actual) throw new ErrorDeServicio("conflicto", "Esta obligación no está en revisión: no hay nada que marcar como revisada.");
  try {
    await prisma.$transaction(async (tx) => {
      const vigente = await revisionVigenteDeObligacion(o.id, tx);
      if (vigente) {
        if (revisionConEfecto(vigente, actual)) throw new ErrorDeServicio("conflicto", "Esta obligación ya está revisada.");
        // una revisión anterior que ya no tiene efecto (cambiaron los datos o la causa) se cierra para dar paso a la nueva; no se borra
        await revertirDecision(tx, vigente.id, "Los datos o la causa de la revisión cambiaron", d.autor);
      }
      await crearRevision(tx, { sociedadId: o.sociedadId, obligacionId: o.id, nota, huella: actual.huella, datos: JSON.stringify({ causas: actual.causas.map((c) => c.codigo) }), autor: d.autor });
      await insertarHistorial(tx, { obligacionId: o.id, sociedadId: o.sociedadId, autor: d.autor, lineas: [lineaDeMarcarRevisada()], motivo: nota });
    });
  } catch (e) {
    if (esViolacionUnica(e)) throw new ErrorDeServicio("conflicto", "Esta obligación ya está revisada.");
    throw e;
  }
}

export async function quitarRevision(d: { obligacion: ObligacionParaRevisar; motivo: string; autor: AutorDelCambio }): Promise<void> {
  const o = d.obligacion;
  await prisma.$transaction(async (tx) => {
    const vigente = await revisionVigenteDeObligacion(o.id, tx);
    if (!vigente) throw new ErrorDeServicio("conflicto", "Esta obligación no está revisada.");
    if (!(await revertirDecision(tx, vigente.id, d.motivo, d.autor))) throw new ErrorDeServicio("conflicto", "La revisión ya se había quitado.");
    await insertarHistorial(tx, { obligacionId: o.id, sociedadId: o.sociedadId, autor: d.autor, lineas: [lineaDeQuitarRevision()], motivo: d.motivo });
  });
}
