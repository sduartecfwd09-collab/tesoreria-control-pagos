// Informe de la importacion pensado para compartirse: SOLO conteos. Nunca incluye rutas ni nombres de archivo
// (llevan el IBAN), numeros de cuenta, beneficiarios, descripciones ni montos. Los motivos de error se agrupan y
// se les enmascara cualquier numero largo por si algun mensaje futuro llegara a incluir uno.

export interface FilaConteo {
  sociedad: string | null;
  mes: string | null; // AAAA-MM del nombre del archivo; null si el nombre no se reconoce
  estado: string; // leido | error | en_revision | pendiente
  /** movimientos que quedaron guardados en la base para este archivo */
  movimientos: number;
  error: string | null;
  /** motivo fijo del sistema si el archivo quedo en revision */
  motivo?: string | null;
}

export interface ResumenCorrida {
  leidos: number;
  conError: number;
  enRevision: number;
  sinCambios: number;
  movimientos: number;
  duplicados: number;
}

/** Quita lo que pudiera identificar algo: secuencias de 4 o mas digitos y prefijos de IBAN. */
export function enmascarar(texto: string): string {
  return texto.replace(/\bCR\d(?:[\d ]*\d)?/gi, "CR#").replace(/\d{4,}/g, "#").slice(0, 120);
}

const esNombreFueraDeConvencion = (e: string) => e.startsWith("El nombre no cumple");
const esFormatoNoReconocido = (e: string) => e.startsWith("Formato no reconocido") || e.startsWith("Encabezado ambiguo") || e.startsWith("El formato detectado");

function agrupar(textos: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const t of textos) {
    const k = enmascarar(t ?? "(sin motivo)");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}

interface Totales { leidos: number; error: number; revision: number; movs: number }
const sumar = (g: Totales, f: FilaConteo) => {
  if (f.estado === "error") g.error++;
  else if (f.estado === "en_revision") g.revision++;
  else g.leidos++;
  g.movs += f.movimientos;
};

export function informeConteos(base: string, corrida: ResumenCorrida, filas: FilaConteo[]): string {
  const L: string[] = [];
  const leidos = filas.filter((f) => f.estado === "leido");
  const errores = filas.filter((f) => f.estado === "error");
  const enRevision = filas.filter((f) => f.estado === "en_revision");
  const sinReconocer = errores.filter((f) => f.error && (esNombreFueraDeConvencion(f.error) || esFormatoNoReconocido(f.error)));

  L.push(`Base de datos: ${base}`);
  L.push("\nESTA CORRIDA");
  L.push(`archivos leidos: ${corrida.leidos} | sin cambios: ${corrida.sinCambios} | con error: ${corrida.conError} | en revision: ${corrida.enRevision}`);
  L.push(`movimientos importados: ${corrida.movimientos} | duplicados entre archivos: ${corrida.duplicados}`);

  L.push("\nESTADO ACTUAL DE LA BASE");
  L.push(`archivos leidos: ${leidos.length} | con error: ${errores.length} (no reconocidos: ${sinReconocer.length}) | en revision: ${enRevision.length}`);
  L.push(`movimientos guardados: ${filas.reduce((s, f) => s + f.movimientos, 0)}`);

  L.push("\nMOTIVOS DE ERROR (agrupados)");
  const motivos = agrupar(errores.map((f) => f.error));
  if (motivos.length === 0) L.push("ninguno");
  for (const [m, n] of motivos) L.push(`${n} archivo(s): ${m}`);

  L.push("\nARCHIVOS EN REVISION (agrupados por motivo; no se importaron y requieren una decision)");
  const revision = agrupar(enRevision.map((f) => f.motivo));
  if (revision.length === 0) L.push("ninguno");
  for (const [m, n] of revision) L.push(`${n} archivo(s): ${m}`);

  L.push("\nPOR SOCIEDAD Y MES");
  L.push("sociedad | mes | leidos | con error | en revision | movimientos");
  const grupos = new Map<string, Totales & { sociedad: string; mes: string }>();
  for (const f of filas) {
    const sociedad = f.sociedad ?? "(sin sociedad)";
    const mes = f.mes ?? "(sin mes)";
    const k = `${sociedad}|${mes}`;
    const g = grupos.get(k) ?? { sociedad, mes, leidos: 0, error: 0, revision: 0, movs: 0 };
    sumar(g, f);
    grupos.set(k, g);
  }
  for (const g of [...grupos.values()].sort((a, b) => a.sociedad.localeCompare(b.sociedad) || a.mes.localeCompare(b.mes))) {
    L.push(`${g.sociedad} | ${g.mes} | ${g.leidos} | ${g.error} | ${g.revision} | ${g.movs}`);
  }

  L.push("\nPOR SOCIEDAD (total)");
  L.push("sociedad | leidos | con error | en revision | movimientos");
  const porSoc = new Map<string, Totales>();
  for (const f of filas) {
    const k = f.sociedad ?? "(sin sociedad)";
    const g = porSoc.get(k) ?? { leidos: 0, error: 0, revision: 0, movs: 0 };
    sumar(g, f);
    porSoc.set(k, g);
  }
  for (const [k, g] of [...porSoc].sort()) L.push(`${k} | ${g.leidos} | ${g.error} | ${g.revision} | ${g.movs}`);
  return L.join("\n");
}
