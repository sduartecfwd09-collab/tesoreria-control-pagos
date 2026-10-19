import { listarArchivos, type ArchivoFila } from "../repositories/consultas.js";

interface Detalle {
  continuidad?: { estado: string; verificados: number; fallos: number; orden: string; filasConFallo: number[]; usoSaldoApertura: boolean; motivo?: string };
  advertencias?: string[];
  discrepancias?: { tipo: string; mensaje: string }[];
  monedaOrigen?: string;
  moneda?: string | null;
}

const det = (a: ArchivoFila) => (a.detalle ?? {}) as Detalle;

/** Informe de la última importación para el reporte del hito. Solo conteos, rutas y mensajes: nunca descripciones. */
export async function informeImportacion(): Promise<string> {
  const archivos = await listarArchivos();
  const L: string[] = [];
  const tabla = (titulo: string, clave: (a: ArchivoFila) => string) => {
    const g = new Map<string, { leidos: number; error: number; movs: number; dup: number }>();
    for (const a of archivos) {
      const k = clave(a);
      const x = g.get(k) ?? { leidos: 0, error: 0, movs: 0, dup: 0 };
      if (a.estado === "error") x.error++;
      else x.leidos++;
      x.movs += a.numMovimientos;
      x.dup += a.numDuplicados;
      g.set(k, x);
    }
    L.push(`\n${titulo}`, "clave | leídos | con error | movimientos leídos | duplicados entre archivos");
    let t = { leidos: 0, error: 0, movs: 0, dup: 0 };
    for (const [k, x] of [...g].sort()) {
      L.push(`${k} | ${x.leidos} | ${x.error} | ${x.movs} | ${x.dup}`);
      t = { leidos: t.leidos + x.leidos, error: t.error + x.error, movs: t.movs + x.movs, dup: t.dup + x.dup };
    }
    L.push(`TOTAL | ${t.leidos} | ${t.error} | ${t.movs} | ${t.dup}`);
  };
  tabla("POR FORMATO", (a) => a.formato ?? "(sin formato)");
  tabla("POR SOCIEDAD", (a) => a.sociedad ?? "(sin sociedad)");

  L.push("\nARCHIVOS CON ERROR");
  for (const a of archivos.filter((x) => x.estado === "error")) L.push(`- ${a.ruta}: ${a.error}`);

  const noCuadran = archivos.filter((a) => det(a).continuidad?.estado === "no_cuadra");
  L.push(`\nSALDO QUE NO CUADRA (${noCuadran.length} archivos)`);
  for (const a of noCuadran) {
    const c = det(a).continuidad!;
    L.push(`- ${a.ruta} [${a.formato}] ${c.fallos}/${c.verificados} fallos, orden ${c.orden}, filas ${c.filasConFallo.join(",")}${c.usoSaldoApertura ? " (con saldo de apertura)" : ""}`);
  }
  const noVerif = archivos.filter((a) => a.estado === "leido" && det(a).continuidad?.estado === "no_verificable");
  const motivos = new Map<string, number>();
  for (const a of noVerif) motivos.set(det(a).continuidad?.motivo ?? "?", (motivos.get(det(a).continuidad?.motivo ?? "?") ?? 0) + 1);
  L.push(`Saldo no verificable: ${noVerif.length} archivos (${[...motivos].map(([m, n]) => `${m}: ${n}`).join("; ")})`);
  L.push(`Saldo cuadra: ${archivos.filter((a) => det(a).continuidad?.estado === "cuadra").length} archivos`);

  L.push("\nMONEDA");
  const origen = new Map<string, number>();
  for (const a of archivos.filter((x) => x.estado === "leido")) origen.set(det(a).monedaOrigen ?? "?", (origen.get(det(a).monedaOrigen ?? "?") ?? 0) + 1);
  L.push(`Origen de la moneda por archivo: ${[...origen].map(([k, n]) => `${k}=${n}`).join(", ")}`);
  const cuentas = new Map<string, ArchivoFila>();
  for (const a of archivos) if (a.cuenta) cuentas.set(`${a.sociedad}|${a.cuenta}`, a);
  const porConfirmar = [...cuentas.values()].filter((a) => a.monedaPorConfirmar);
  L.push(`Cuentas con moneda por confirmar: ${porConfirmar.length} de ${cuentas.size}`);
  for (const a of porConfirmar) L.push(`- ${a.sociedad} ${a.cuenta} moneda=${a.moneda ?? "(desconocida)"}`);

  const disc = archivos.flatMap((a) => (det(a).discrepancias ?? []).map((d) => ({ a, d })));
  L.push(`\nDISCREPANCIAS NOMBRE vs CONTENIDO (${disc.length})`);
  for (const { a, d } of disc) L.push(`- ${a.ruta}: [${d.tipo}] ${d.mensaje}`);
  const adv = new Map<string, number>();
  for (const a of archivos) for (const w of det(a).advertencias ?? []) adv.set(w.replace(/\d+/g, "N"), (adv.get(w.replace(/\d+/g, "N")) ?? 0) + 1);
  L.push("\nADVERTENCIAS (agrupadas)");
  for (const [w, n] of adv) L.push(`- ${w}: en ${n} archivo(s)`);
  return L.join("\n");
}
