// Generación y regeneración de vencimientos. Todos nacen "proyectado": los demás estados llegan con el
// cruce (Hito 4). Un vencimiento con conciliación nunca se toca.
import { hoyDe, periodoDe, type Reloj } from "../domain/reloj.js";
import { periodosEntre, planificar, TEXTO_OMISION, type Omitida, type VencimientoPlan } from "../domain/vencimientos.js";
import {
  aplicarCambios, crearFaltantes, describirObligaciones, horizonte, obligacionesParaPlan, obligacionParaPlan,
  vencimientosDeObligacionDesde,
} from "../repositories/vencimientos.js";

export interface OmitidaDetalle extends Omitida {
  sociedad: string;
  proveedor: string;
  identificador: string;
  texto: string;
}

export interface ResumenGeneracion {
  desde: string;
  hasta: string;
  creados: number;
  yaExistentes: number;
  porPeriodo: { periodo: string; creados: number; yaExistentes: number }[];
  omitidas: OmitidaDetalle[];
}

let enCurso = false;
export const hayGeneracionEnCurso = () => enCurso;

/** Crea los vencimientos que faltan de las obligaciones activas entre desde y hasta (AAAA-MM). Idempotente. */
export async function generarVencimientos(desde: string, hasta: string): Promise<ResumenGeneracion> {
  enCurso = true;
  try {
    const periodos = periodosEntre(desde, hasta);
    const { vencimientos, omitidas } = planificar(await obligacionesParaPlan(), periodos);
    const resultado = await crearFaltantes(vencimientos);
    const porPeriodo = periodos.map((periodo) => {
      const del = resultado.filter((r) => r.periodo === periodo);
      const creados = del.filter((r) => r.creado).length;
      return { periodo, creados, yaExistentes: del.length - creados };
    });
    const info = new Map((await describirObligaciones(omitidas.map((o) => o.obligacionId))).map((o) => [o.id, o]));
    return {
      desde, hasta,
      creados: porPeriodo.reduce((s, p) => s + p.creados, 0),
      yaExistentes: porPeriodo.reduce((s, p) => s + p.yaExistentes, 0),
      porPeriodo,
      omitidas: omitidas.map((o) => {
        const d = info.get(o.obligacionId)!;
        return { ...o, sociedad: d.sociedad.codigo, proveedor: d.proveedor, identificador: d.identificador, texto: TEXTO_OMISION[o.motivo] };
      }),
    };
  } finally {
    enCurso = false;
  }
}

export interface ResumenRegeneracion {
  creados: number;
  actualizados: number;
  eliminados: number;
  /** vencimientos futuros que no se tocaron por tener conciliación */
  protegidos: number;
}

/**
 * Tras editar una obligación, ajusta sus vencimientos de hoy en adelante, hasta el horizonte ya generado:
 * crea los que faltan, corrige fecha y monto de los que siguen correspondiendo y elimina los que ya no
 * corresponden (frecuencia distinta o desactivada). Nunca toca los pasados ni los que tienen conciliación.
 */
export async function regenerarObligacion(obligacionId: number, reloj: Reloj): Promise<ResumenRegeneracion> {
  const r: ResumenRegeneracion = { creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 };
  const o = await obligacionParaPlan(obligacionId);
  if (!o) return r;
  const hoy = hoyDe(reloj);
  const desde = periodoDe(hoy);
  const fin = await horizonte();
  const plan = fin && fin >= desde ? planificar([o], periodosEntre(desde, fin)).vencimientos : [];
  const deseados = new Map(plan.map((v) => [v.periodo, v]));

  const actualizar: { id: number; fecha: Date; montoEsperado: number | null }[] = [];
  const eliminar: number[] = [];
  const ocupados = new Set<string>();
  for (const v of await vencimientosDeObligacionDesde(obligacionId, desde)) {
    ocupados.add(v.periodo);
    if (v.fecha < hoy) continue; // pasado: no se toca
    if (v._count.conciliaciones > 0 || v._count.alertas > 0) { r.protegidos++; continue; }
    const d = deseados.get(v.periodo);
    if (!d) { eliminar.push(v.id); continue; }
    if (d.fecha.getTime() !== v.fecha.getTime() || d.montoEsperado !== v.montoEsperado) {
      actualizar.push({ id: v.id, fecha: d.fecha, montoEsperado: d.montoEsperado });
    }
  }
  // solo se crean los que caen de hoy en adelante; un existente futuro sí puede moverse a una fecha ya pasada del mes
  const crear: VencimientoPlan[] = plan.filter((v) => !ocupados.has(v.periodo) && v.fecha >= hoy);
  await aplicarCambios({ crear, actualizar, eliminar });
  return { ...r, creados: crear.length, actualizados: actualizar.length, eliminados: eliminar.length };
}
