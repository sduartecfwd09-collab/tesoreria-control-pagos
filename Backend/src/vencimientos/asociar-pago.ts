// Asociar a mano un pago a un vencimiento, y quitar esa asociación. La decisión es una DecisionManual que el motor de cruce consulta antes de
// calcular; cada acción escribe su línea en el historial en la MISMA transacción y después se recalcula como lo hacen las demás ediciones.
// Los permisos (persona y sociedad) los verifica la ruta; aquí van las reglas del negocio.
import { ESTADOS_ASOCIABLES, marcasDeCoincidencia, ordenarCandidatos, rangoDeCandidatos, ventanaDeAsociacion } from "../domain/asociacion.js";
import { enmascararCuenta, enmascararNumerosLargos } from "../domain/enmascarar.js";
import { lineaDeAsociarPago, lineaDeQuitarAsociacion } from "../domain/historial.js";
import { aNumero } from "../domain/montos.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import type { Reloj } from "../domain/reloj.js";
import { prisma } from "../db.js";
import { asociacionVigente, crearAsociacion, huellasAsociadas, revertirDecision } from "../repositories/decisiones.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";
import { valorGlobal } from "../repositories/parametros.js";
import { debitosLibresDeSociedad, vencimientoParaAsociar } from "../repositories/vencimientos.js";
import { actualizarVencimientos } from "./mantenimiento.js";

type VencimientoAsociable = NonNullable<Awaited<ReturnType<typeof vencimientoParaAsociar>>>;

export interface Candidato {
  /** identificador del pago para pedir la asociación */
  movimientoId: number;
  fecha: string;
  /** con los números largos enmascarados */
  descripcion: string | null;
  /** últimos 4 de la cuenta */
  cuenta: string;
  banco: string | null;
  monto: number;
  moneda: string | null;
  /** el identificador de la obligación aparece en la descripción o en la referencia del pago */
  traeNumero: boolean;
  /** el nombre del proveedor (o un alias conocido) aparece en la descripción del pago */
  traeProveedor: boolean;
}

const iso = (f: Date) => f.toISOString().slice(0, 10);

/**
 * Pagos que se pueden asociar a este vencimiento: de su misma sociedad, libres y dentro de la ventana. Primero los que traen el número y el
 * proveedor, luego solo el número, luego solo el proveedor y luego el resto; dentro de cada grupo, los más cercanos a la fecha vigente. Hasta 50,
 * aplicado después de ordenar.
 */
export async function candidatosDe(v: VencimientoAsociable): Promise<(Candidato & { clave: string })[]> {
  const ventana = ventanaDeAsociacion(await valorGlobal("ventana_asociacion_manual_dias"));
  const { desde, hastaExclusivo } = rangoDeCandidatos(v.fecha, ventana);
  const libres = await debitosLibresDeSociedad(v.sociedadId, desde, hastaExclusivo, await huellasAsociadas());
  const conMarcas = libres.map((m) => ({ ...m, ...marcasDeCoincidencia(m, v.obligacion) }));
  return ordenarCandidatos(conMarcas, v.fecha).map((m) => ({
    movimientoId: m.id,
    clave: m.claveDedup,
    fecha: iso(m.fecha),
    descripcion: m.descripcion === null ? null : enmascararNumerosLargos(m.descripcion),
    cuenta: enmascararCuenta(m.cuenta.numero),
    banco: m.cuenta.banco,
    monto: aNumero(m.debito) ?? 0,
    moneda: m.cuenta.moneda,
    traeNumero: m.traeNumero,
    traeProveedor: m.traeProveedor,
  }));
}

/** Los candidatos tal como se envían (sin la huella interna). */
export async function listarCandidatos(v: VencimientoAsociable): Promise<Candidato[]> {
  if (!ESTADOS_ASOCIABLES.includes(v.estado)) throw new ErrorDeServicio("conflicto", "Este vencimiento no admite asociar un pago a mano: solo los que están por revisar, vencidos o sin información.");
  return (await candidatosDe(v)).map(({ clave: _clave, ...c }) => c);
}

const esViolacionUnica = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

export async function asociarPago(
  d: { vencimiento: VencimientoAsociable; movimientoId: number; motivo: string; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ estado: string }> {
  const v = d.vencimiento;
  if (!ESTADOS_ASOCIABLES.includes(v.estado)) throw new ErrorDeServicio("conflicto", "Este vencimiento no admite asociar un pago a mano: solo los que están por revisar, vencidos o sin información.");
  const elegido = (await candidatosDe(v)).find((c) => c.movimientoId === d.movimientoId);
  if (!elegido) throw new ErrorDeServicio("conflicto", "Ese pago ya no está disponible para este vencimiento. Elija otro de la lista.");
  try {
    await prisma.$transaction(async (tx) => {
      if (await asociacionVigente(v.obligacionId, v.periodo, tx)) throw new ErrorDeServicio("conflicto", "Este vencimiento ya tiene un pago asociado a mano.");
      await crearAsociacion(tx, {
        sociedadId: v.sociedadId, obligacionId: v.obligacionId, periodo: v.periodo, movimientoId: elegido.movimientoId, claveMovimiento: elegido.clave, motivo: d.motivo, autor: d.autor,
      });
      await insertarHistorial(tx, {
        obligacionId: v.obligacionId, sociedadId: v.sociedadId, autor: d.autor, lineas: [lineaDeAsociarPago(v.periodo)], motivo: d.motivo, entidad: "vencimiento", entidadId: v.id,
      });
    });
  } catch (e) {
    // otra persona asoció el mismo pago o el mismo vencimiento al mismo tiempo: la base lo impide
    if (esViolacionUnica(e)) throw new ErrorDeServicio("conflicto", "Ese pago o este vencimiento ya tiene una asociación manual.");
    throw e;
  }
  await actualizarVencimientos(reloj, v.obligacionId);
  return { estado: (await vencimientoParaAsociar(v.id))?.estado ?? "pagado" };
}

export async function quitarAsociacion(
  d: { vencimiento: VencimientoAsociable; motivo: string; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<{ estado: string }> {
  const v = d.vencimiento;
  await prisma.$transaction(async (tx) => {
    const vigente = await asociacionVigente(v.obligacionId, v.periodo, tx);
    if (!vigente) throw new ErrorDeServicio("conflicto", "Este vencimiento no tiene un pago asociado a mano.");
    if (!(await revertirDecision(tx, vigente.id, d.motivo, d.autor))) throw new ErrorDeServicio("conflicto", "La asociación ya se había quitado.");
    await insertarHistorial(tx, {
      obligacionId: v.obligacionId, sociedadId: v.sociedadId, autor: d.autor, lineas: [lineaDeQuitarAsociacion(v.periodo)], motivo: d.motivo, entidad: "vencimiento", entidadId: v.id,
    });
  });
  await actualizarVencimientos(reloj, v.obligacionId);
  return { estado: (await vencimientoParaAsociar(v.id))?.estado ?? "vencido" };
}
