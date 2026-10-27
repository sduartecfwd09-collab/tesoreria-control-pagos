// Informe de diagnóstico del cruce: SOLO conteos y fechas agregadas. Nunca descripciones, montos, identificadores,
// proveedores ni números de cuenta. Las sociedades se nombran por su abreviatura interna.
import { corteDeMes } from "../domain/cobertura-corte.js";
import type { ResumenCruce } from "./cruce.js";

export interface SociedadInforme { id: number; codigo: string | null }

const iso = (f: Date) => f.toISOString().slice(0, 10);

export function informeDiagnosticoCruce(r: ResumenCruce, sociedades: SociedadInforme[]): string {
  const nombre = (id: number) => sociedades.find((s) => s.id === id)?.codigo ?? `sociedad ${id}`;
  const L: string[] = [];
  const { hoy } = r.parametros;
  L.push(`Cruce al ${iso(hoy)} · ventana ${r.parametros.diasAntes} días antes y ${r.parametros.diasDespues} después · aviso ${r.parametros.diasAviso} días`);
  L.push(`Vencimientos evaluados: ${r.vencimientos} · débitos considerados: ${r.datos.movimientos.length}`);

  L.push("", "Vencimientos por estado:");
  for (const [estado, n] of Object.entries(r.porEstado).sort()) L.push(`  ${estado}: ${n}`);

  L.push("", "Vencimientos por sociedad, mes y estado:");
  const venc = new Map(r.datos.vencimientos.map((v) => [v.id, v]));
  const tabla = new Map<string, number>();
  for (const x of r.resultados) {
    const v = venc.get(x.vencimientoId)!;
    const k = `${nombre(v.sociedadId)} | ${iso(v.fecha).slice(0, 7)} | ${x.estado}`;
    tabla.set(k, (tabla.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...tabla].sort(([a], [b]) => a.localeCompare(b))) L.push(`  ${k}: ${n}`);

  L.push("", "Pagados: fecha de pago menos fecha vigente, en días (pagado y pagado con inconsistencia):");
  const dist = new Map<string, number>();
  for (const x of r.resultados) {
    if (x.diferenciaDias === null) continue;
    const d = x.diferenciaDias;
    const k = d < -10 ? "menos de -10" : d > 10 ? "más de +10" : d > 0 ? `+${d}` : String(d);
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  const orden = ["menos de -10", ...Array.from({ length: 21 }, (_, i) => (i - 10 > 0 ? `+${i - 10}` : String(i - 10))), "más de +10"];
  for (const k of orden) if (dist.has(k)) L.push(`  ${k}: ${dist.get(k)}`);

  L.push("", "Por revisar y empates:");
  L.push(`  vencimientos por revisar: ${r.porEstado.por_revisar ?? 0}`);
  L.push(`  movimientos que empataron entre dos vencimientos de una obligación: ${r.estadisticas.empates}`);
  L.push(`  identificador compartido resuelto por proveedor: ${r.estadisticas.desempatadosPorProveedor}`);
  L.push(`  identificador compartido sin resolver: ${r.estadisticas.compartidosSinResolver}`);

  L.push("", "Débitos sin obligación, por sociedad:");
  for (const [id, n] of [...r.estadisticas.sinObligacionPorSociedad].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])))) L.push(`  ${nombre(id)}: ${n}`);

  L.push("", "Débitos con el identificador de una obligación de otra sociedad, por sociedad de la cuenta:");
  for (const [id, n] of [...r.estadisticas.deOtraSociedadPorSociedad].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])))) L.push(`  ${nombre(id)}: ${n}`);
  if (r.estadisticas.deOtraSociedadPorSociedad.size === 0) L.push("  ninguno");

  L.push("", "Cobertura por sociedad y mes (cuentas con archivo leído / cuentas conocidas, y fecha de corte mínima):");
  for (const [sociedadId, cuentas] of [...r.datos.cuentas].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])))) {
    const meses = [...new Set(cuentas.flatMap((c) => [...c.meses.keys()]))].sort();
    for (const mes of meses) {
      const cortes = cuentas.map((c) => corteDeMes(c, mes, hoy));
      const con = cortes.filter((c) => c !== null) as Date[];
      const minimo = con.length === cuentas.length ? iso(con.reduce((m, c) => (c < m ? c : m), con[0]!)) : "no cubre (falta alguna cuenta)";
      L.push(`  ${nombre(sociedadId)} | ${mes}: ${cuentas.filter((c) => c.meses.has(mes)).length}/${cuentas.length} cuentas · corte ${minimo}`);
    }
  }
  const mesActual = iso(hoy).slice(0, 7);
  L.push("", `Cuentas sin archivo leído de ${mesActual}, por sociedad:`);
  for (const [sociedadId, cuentas] of [...r.datos.cuentas].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])))) {
    L.push(`  ${nombre(sociedadId)}: ${cuentas.filter((c) => !c.meses.has(mesActual)).length} de ${cuentas.length}`);
  }
  return L.join("\n");
}
