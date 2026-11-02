import type { FechasPorSociedadMes } from "../repositories/consultas.js";

/** Informe de verificacion de fechas: solo agregados (fechas y conteos), nunca montos, cuentas ni descripciones. */
export function informeFechas(base: string, filas: FechasPorSociedadMes[]): string {
  const L: string[] = [`Base de datos: ${base}`, ""];
  L.push("sociedad | mes del archivo | movimientos | fecha minima | fecha maxima | fuera de tolerancia | desvio maximo (dias)");
  for (const f of filas) {
    L.push(`${f.sociedad} | ${f.mes} | ${f.movimientos} | ${f.fechaMinima} | ${f.fechaMaxima} | ${f.fueraDeTolerancia} | ${f.desvioMaximoDias}`);
  }
  const total = filas.reduce((s, f) => s + f.movimientos, 0);
  const fuera = filas.reduce((s, f) => s + f.fueraDeTolerancia, 0);
  const gruposFuera = filas.filter((f) => f.fueraDeTolerancia > 0);
  L.push("", "RESUMEN");
  L.push(`movimientos revisados: ${total} en ${filas.length} grupos (sociedad y mes)`);
  L.push(`movimientos con fecha fuera del mes del archivo (tolerancia de 1 dia): ${fuera} en ${gruposFuera.length} grupos`);
  L.push(
    fuera === 0
      ? "resultado: todas las fechas caen dentro del mes de su archivo (o a un dia de sus bordes)"
      : `resultado: REVISAR; mayor desvio ${Math.max(...gruposFuera.map((f) => f.desvioMaximoDias))} dia(s)`,
  );
  return L.join("\n");
}
