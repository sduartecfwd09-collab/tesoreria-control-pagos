// Simulación del cruce con un «hoy» elegido. SOLO LEE: no escribe nada en la base, no genera vencimientos y no reutiliza el
// camino que persiste (`cruzarVencimientos`). Sirve para ver cuántos pagos estarían Programados, Por vencer, Vencidos, etc.
// en otra fecha. Limitaciones: ver el comando `npm run cruzar:simular` y el README.
import { cruzar } from "../domain/cruce.js";
import { periodoDe } from "../domain/reloj.js";
import { periodosEntre, planificar } from "../domain/vencimientos.js";
import { cargarDatosCruce, contarDebitosPosteriores } from "../repositories/cruce.js";
import { obligacionesParaPlan } from "../repositories/vencimientos.js";
import { parametrosDeCruce } from "./cruce.js";
import { horizonteDeAviso } from "./generar.js";

const MS_DIA = 86_400_000;

export interface ResultadoSimulacion {
  hoy: string;
  porEstado: Record<string, number>;
  vencimientos: number;
  /** vencimientos que ya existen en el calendario de la base (con fecha dentro del horizonte de ese «hoy») */
  delCalendario: number;
  /** vencimientos que el calendario todavía no tiene para ese «hoy» y se planificaron en memoria */
  planificadosEnMemoria: number;
  /** débitos posteriores a ese «hoy» que se ignoraron */
  movimientosIgnorados: number;
}

/** `hoy`: la fecha simulada a medianoche UTC. */
export async function simularCruce(hoy: Date): Promise<ResultadoSimulacion> {
  const datos = await cargarDatosCruce(hoy); // movimientos y estados de cuenta hasta ese día
  const parametros = await parametrosDeCruce(hoy);
  // El calendario llega hasta fin de mes o hasta hoy + el mayor aviso (la misma regla que el calendario real).
  const finDeMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0));
  const conAviso = new Date(hoy.getTime() + (await horizonteDeAviso()) * MS_DIA);
  const limite = conAviso > finDeMes ? conAviso : finDeMes;

  const delCalendario = datos.vencimientos.filter((v) => v.fecha <= limite);
  const ocupados = new Set(datos.vencimientos.map((v) => `${v.obligacionId}|${v.periodo}`));
  let id = 0;
  const planificados = (await obligacionesParaPlan()).filter((o) => o.activa).flatMap((o) => {
    const desde = o.controlDesde ?? periodoDe(hoy);
    const ultimo = periodoDe(limite);
    if (desde > ultimo) return [];
    return planificar([o], periodosEntre(desde, ultimo)).vencimientos
      .filter((v) => !ocupados.has(`${v.obligacionId}|${v.periodo}`) && v.fecha <= limite)
      .map((v) => ({ id: --id, obligacionId: v.obligacionId, sociedadId: v.sociedadId, fecha: v.fecha, periodo: v.periodo }));
  });

  const vencimientos = [...delCalendario.map((v) => ({ id: v.id, obligacionId: v.obligacionId, sociedadId: v.sociedadId, fecha: v.fecha, periodo: v.periodo })), ...planificados];
  const { resultados } = cruzar({ obligaciones: datos.obligaciones, movimientos: datos.movimientos, cuentas: datos.cuentas, vencimientos, ...parametros });
  const porEstado: Record<string, number> = {};
  for (const r of resultados) porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1;
  return {
    hoy: hoy.toISOString().slice(0, 10),
    porEstado,
    vencimientos: resultados.length,
    delCalendario: delCalendario.length,
    planificadosEnMemoria: planificados.length,
    movimientosIgnorados: await contarDebitosPosteriores(hoy),
  };
}

const NOMBRES: Record<string, string> = {
  proyectado: "Programado", por_vencer: "Por vencer", vencido: "Vencido", pagado: "Pagado", pagado_con_inconsistencia: "Pagado con inconsistencia",
  sin_informacion: "Sin información", por_revisar: "Por revisar",
};

/** Texto del informe: solo conteos. */
export function textoSimulacion(r: ResultadoSimulacion): string {
  const L = [
    `Cruce simulado con hoy = ${r.hoy} (no se escribió nada en la base)`,
    `Vencimientos evaluados: ${r.vencimientos} (del calendario: ${r.delCalendario} · planificados en memoria: ${r.planificadosEnMemoria})`,
    `Débitos posteriores a esa fecha que se ignoraron: ${r.movimientosIgnorados}`,
    "",
    "Por estado:",
  ];
  for (const [e, n] of Object.entries(r.porEstado).sort((a, b) => b[1] - a[1])) L.push(`  ${NOMBRES[e] ?? e}: ${n}`);
  if (Object.keys(r.porEstado).length === 0) L.push("  ninguno");
  return L.join("\n");
}
