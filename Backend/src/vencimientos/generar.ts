// Calendario automático de vencimientos. El sistema crea solo, para cada obligación activa, los vencimientos desde su
// «Control desde» hasta el fin del mes de hoy + N meses (parámetro `meses_vencimientos_adelante`, 12; o hoy + los días de aviso si
// eso llega más lejos) y mantiene al día los futuros. Los de fechas futuras quedan «Programado» (el motor de cruce no los marca Vencido
// ni Sin información, y Programado no genera avisos). Todos nacen «proyectado»: el estado real lo calcula el motor de cruce. Es idempotente y nunca toca un vencimiento
// pasado, pagado, conciliado o con avisos.
import { hoyDe, periodoDe, type Reloj } from "../domain/reloj.js";
import { aNumero } from "../domain/montos.js";
import { copiaDe, ESTADOS_PAGADOS, periodosEntre, planificar, type VencimientoPlan } from "../domain/vencimientos.js";
import { valorGlobal } from "../repositories/parametros.js";
import { mayorAvisoDeUsuarios } from "../repositories/usuarios.js";
import { aplicarCambios, type CambiosVencimientos, obligacionesParaPlan, obligacionParaPlan, vencimientosDeObligaciones } from "../repositories/vencimientos.js";

const MS_DIA = 86_400_000;
const MESES_ADELANTE_DEFECTO = 12;

export interface ResumenSincronizacion {
  creados: number;
  actualizados: number;
  eliminados: number;
  /** vencimientos futuros que no se tocaron por estar pagados, conciliados, con avisos o movidos a mano */
  protegidos: number;
}

/** Días de aviso (parámetro de Configuración): hasta cuántos días por delante de hoy se generan vencimientos. */
export async function diasDeAviso(): Promise<number> {
  const n = Number(await valorGlobal("aviso_dias"));
  return Number.isInteger(n) && n >= 0 ? n : 3;
}

/** Meses por delante del actual para los que se generan vencimientos (parámetro; sin fila o con un valor inválido, 12). */
export async function mesesAdelante(): Promise<number> {
  const texto = await valorGlobal("meses_vencimientos_adelante");
  const n = texto === null || texto.trim() === "" ? NaN : Number(texto);
  return Number.isInteger(n) && n >= 0 ? n : MESES_ADELANTE_DEFECTO;
}

/** Horizonte del calendario: el mayor de todos los avisos (el general y los propios de cada tesorero). */
export async function horizonteDeAviso(): Promise<number> {
  return Math.max(await diasDeAviso(), (await mayorAvisoDeUsuarios()) ?? 0);
}

/**
 * Deja el calendario al día. Sin `obligacionId` revisa todas las obligaciones; con él, solo esa. Crea los vencimientos
 * que faltan, corrige fecha, monto y copia de los futuros que siguen correspondiendo y elimina los futuros que ya no
 * corresponden (frecuencia distinta o desactivada). Los pasados y los pagados nunca se tocan.
 */
export async function sincronizarVencimientos(reloj: Reloj, obligacionId?: number): Promise<ResumenSincronizacion> {
  const r: ResumenSincronizacion = { creados: 0, actualizados: 0, eliminados: 0, protegidos: 0 };
  const hoy = hoyDe(reloj);
  // Se genera hasta el fin del mes de hoy + N meses o, si hoy + los días de aviso llega más lejos, hasta ahí.
  const finDeMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + (await mesesAdelante()) + 1, 0));
  const conAviso = new Date(hoy.getTime() + (await horizonteDeAviso()) * MS_DIA);
  const limite = conAviso > finDeMes ? conAviso : finDeMes;
  const obligaciones = obligacionId === undefined ? await obligacionesParaPlan() : [await obligacionParaPlan(obligacionId)].filter((o) => o !== null);
  const existentes = new Map<number, Awaited<ReturnType<typeof vencimientosDeObligaciones>>>();
  for (const v of await vencimientosDeObligaciones(obligaciones.map((o) => o.id))) {
    const lista = existentes.get(v.obligacionId);
    if (lista) lista.push(v);
    else existentes.set(v.obligacionId, [v]);
  }

  const cambios: CambiosVencimientos = { crear: [], actualizar: [], eliminar: [] };
  for (const o of obligaciones) {
    const propios = existentes.get(o.id) ?? [];
    // sin «Control desde» definido se controla desde el mes de hoy
    const desde = o.controlDesde ?? periodoDe(hoy);
    const ultimo = propios.reduce((m, v) => (v.periodo > m ? v.periodo : m), periodoDe(limite));
    const plan = desde <= ultimo ? planificar([o], periodosEntre(desde, ultimo)).vencimientos : [];
    const deseados = new Map(plan.map((v) => [v.periodo, v]));
    const ocupados = new Set(propios.map((v) => v.periodo));

    for (const v of propios) {
      if (v.fecha < hoy) continue; // pasado: no se toca
      if (v._count.conciliaciones > 0 || v._count.alertas > 0 || ESTADOS_PAGADOS.includes(v.estado)) { r.protegidos++; continue; }
      const d = deseados.get(v.periodo);
      const movido = v.fechaOriginal !== null; // movido «de una sola vez»: conserva su fecha vigente y su historial
      if (!d) {
        if (movido || v._count.cambiosDia > 0) r.protegidos++;
        else cambios.eliminar.push(v.id);
        continue;
      }
      const fecha = movido ? v.fecha : d.fecha;
      const fechaOriginal = movido && d.fecha.getTime() !== v.fecha.getTime() ? d.fecha : null;
      // la copia de los datos de la obligación también se actualiza (solo en estos vencimientos futuros, no pagados y sin conciliación)
      const copia = copiaDe(o);
      const copiaIgual = (Object.keys(copia) as (keyof typeof copia)[]).every((k) => v[k] === copia[k]);
      if (!copiaIgual || fecha.getTime() !== v.fecha.getTime() || fechaOriginal?.getTime() !== v.fechaOriginal?.getTime() || d.montoEsperado !== aNumero(v.montoEsperado)) {
        cambios.actualizar.push({ id: v.id, fecha, fechaOriginal, montoEsperado: d.montoEsperado, ...copia });
      }
    }
    const nuevos: VencimientoPlan[] = plan.filter((v) => !ocupados.has(v.periodo) && v.fecha <= limite);
    cambios.crear.push(...nuevos);
  }
  await aplicarCambios(cambios);
  return { ...r, creados: cambios.crear.length, actualizados: cambios.actualizar.length, eliminados: cambios.eliminar.length };
}
