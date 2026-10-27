// Diagnóstico adicional del cruce (sin cambiar ninguna regla): SOLO conteos. Nunca descripciones, montos ni identificadores.
// Los nombres de proveedor se muestran porque se piden por sociedad y proveedor; las sociedades, por abreviatura.
import { conImagenesDe } from "../domain/cobertura.js";
import { estadoDeArchivo } from "../domain/estado-archivo.js";
import { patronIdentificador } from "../domain/identificadores.js";
import type { ResumenCruce } from "./cruce.js";
import type { SociedadInforme } from "./diagnostico.js";

const MS_DIA = 86_400_000;
const dia = (f: Date) => Math.floor(f.getTime() / MS_DIA);
const iso = (f: Date) => f.toISOString().slice(0, 10);

export interface ExtrasDiagnostico {
  /** descripciones en mayúsculas de todos los movimientos vigentes de cada sociedad (débitos y créditos) */
  descripcionesPorSociedad: Map<number, string[]>;
  primeraFechaPorCuenta: Map<number, Date>;
  archivos: { cuentaId: number | null; mes: string | null; estado: string; numMovimientos: number; detalle: unknown; retiradoEn: Date | null }[];
}

export function informeAdicionalCruce(r: ResumenCruce, sociedades: SociedadInforme[], x: ExtrasDiagnostico): string {
  const nombre = (id: number) => sociedades.find((s) => s.id === id)?.codigo ?? `sociedad ${id}`;
  const { diasAntes, diasDespues } = r.parametros;
  const L: string[] = [];
  const obl = new Map(r.datos.obligaciones.map((o) => [o.id, o]));
  const venc = new Map(r.datos.vencimientos.map((v) => [v.id, v]));
  const patron = new Map(r.datos.obligaciones.map((o) => [o.id, patronIdentificador(o.identificador)]));

  // 1. Vencido y Sin información: ¿hay un débito de la sociedad con el identificador, fuera de la ventana?
  L.push("", `1. Vencidos y sin información: débito de la sociedad con el identificador FUERA de la ventana (de -15 a +15 días, fuera de -${diasAntes}/+${diasDespues}):`);
  const debitos = new Map<number, typeof r.datos.movimientos>();
  for (const m of r.datos.movimientos) {
    const lista = debitos.get(m.sociedadId);
    if (lista) lista.push(m);
    else debitos.set(m.sociedadId, [m]);
  }
  for (const estado of ["vencido", "sin_informacion"] as const) {
    const evaluados = r.resultados.filter((q) => q.estado === estado);
    const hist = new Map<number, number>();
    let con = 0;
    for (const q of evaluados) {
      const v = venc.get(q.vencimientoId)!;
      const p = patron.get(v.obligacionId);
      if (!p) continue;
      let mejor: number | null = null;
      for (const m of debitos.get(v.sociedadId) ?? []) {
        const d = dia(m.fecha) - dia(v.fecha);
        if (Math.abs(d) > 15 || (d >= -diasAntes && d <= diasDespues)) continue;
        if (!p.test((m.descripcion ?? "").toUpperCase())) continue;
        if (mejor === null || Math.abs(d) < Math.abs(mejor) || (Math.abs(d) === Math.abs(mejor) && d < mejor)) mejor = d;
      }
      if (mejor !== null) {
        con++;
        hist.set(mejor, (hist.get(mejor) ?? 0) + 1);
      }
    }
    L.push(`  ${estado}: ${evaluados.length} evaluados · con un débito fuera de la ventana: ${con} · sin ninguno en ±15 días: ${evaluados.length - con}`);
    for (const [d, n] of [...hist].sort((a, b) => a[0] - b[0])) L.push(`    ${d > 0 ? "+" : ""}${d} días: ${n}`);
  }

  // 2. Obligaciones sin ninguna coincidencia en ningún mes
  L.push("", "2. Obligaciones sin ninguna coincidencia en ningún mes (ningún vencimiento con movimiento asociado ni por revisar), por sociedad y proveedor:");
  const porObl = new Map<number, typeof r.resultados>();
  for (const q of r.resultados) {
    const id = venc.get(q.vencimientoId)!.obligacionId;
    const lista = porObl.get(id);
    if (lista) lista.push(q);
    else porObl.set(id, [q]);
  }
  const filas = new Map<string, { sociedadId: number; proveedor: string; obligaciones: number; conIdEnDescripcion: number }>();
  let sinCoincidencia = 0;
  let conIdEnAlgunaDescripcion = 0;
  for (const [obligacionId, qs] of porObl) {
    if (qs.some((q) => q.movimientoId !== null || q.estado === "por_revisar")) continue;
    const o = obl.get(obligacionId)!;
    const p = patron.get(obligacionId);
    const aparece = p ? (x.descripcionesPorSociedad.get(o.sociedadId) ?? []).some((t) => p.test(t)) : false;
    sinCoincidencia++;
    if (aparece) conIdEnAlgunaDescripcion++;
    const k = `${o.sociedadId}|${o.proveedor}`;
    const f = filas.get(k) ?? { sociedadId: o.sociedadId, proveedor: o.proveedor, obligaciones: 0, conIdEnDescripcion: 0 };
    f.obligaciones++;
    if (aparece) f.conIdEnDescripcion++;
    filas.set(k, f);
  }
  L.push(`  total: ${sinCoincidencia} · de ellas con el identificador en alguna descripción de cualquier movimiento de la sociedad (cualquier fecha y cuenta, débito o crédito): ${conIdEnAlgunaDescripcion}`);
  for (const f of [...filas.values()].sort((a, b) => nombre(a.sociedadId).localeCompare(nombre(b.sociedadId)) || a.proveedor.localeCompare(b.proveedor, "es"))) {
    L.push(`  ${nombre(f.sociedadId)} | ${f.proveedor}: ${f.obligaciones} (con el identificador en alguna descripción: ${f.conIdEnDescripcion})`);
  }

  // 3. Vencidos cuya ventana empieza antes de la primera fecha con datos
  L.push("", "3. Vencidos cuya ventana empieza antes de la primera fecha con datos, por sociedad y mes:");
  L.push("  (A = antes de la primera fecha de cualquier cuenta de la sociedad; B = antes de la primera fecha de todas sus cuentas, es decir, la más tardía)");
  const primeras = new Map<number, { a: Date; b: Date }>();
  for (const [sociedadId, cuentas] of r.datos.cuentas) {
    const fechas = cuentas.map((c) => x.primeraFechaPorCuenta.get(c.cuentaId)).filter((f): f is Date => f !== undefined);
    if (fechas.length === 0) continue;
    primeras.set(sociedadId, { a: fechas.reduce((m, f) => (f < m ? f : m)), b: fechas.reduce((m, f) => (f > m ? f : m)) });
  }
  for (const [sociedadId, p] of [...primeras].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])))) L.push(`  primera fecha de ${nombre(sociedadId)}: A ${iso(p.a)} · B ${iso(p.b)}`);
  const tabla = new Map<string, { a: number; b: number; total: number }>();
  for (const q of r.resultados.filter((q) => q.estado === "vencido")) {
    const v = venc.get(q.vencimientoId)!;
    const p = primeras.get(v.sociedadId);
    const k = `${nombre(v.sociedadId)} | ${iso(v.fecha).slice(0, 7)}`;
    const f = tabla.get(k) ?? { a: 0, b: 0, total: 0 };
    f.total++;
    const inicio = dia(v.fecha) - diasAntes;
    if (!p || inicio < dia(p.a)) f.a++;
    if (!p || inicio < dia(p.b)) f.b++;
    tabla.set(k, f);
  }
  for (const [k, f] of [...tabla].sort(([a], [b]) => a.localeCompare(b))) L.push(`  ${k}: ${f.total} vencidos · A ${f.a} · B ${f.b}`);

  // 4. Archivos con imagen y cero movimientos: ¿tenían un pago esperado ese mes?
  const imagenSinMov = x.archivos.filter((a) => estadoDeArchivo(a) === "leido" && conImagenesDe(a.detalle) === true && a.numMovimientos === 0);
  const sociedadDeCuenta = new Map<number, number>();
  for (const [sociedadId, cuentas] of r.datos.cuentas) for (const c of cuentas) sociedadDeCuenta.set(c.cuentaId, sociedadId);
  let porCuenta = 0;
  let porSociedad = 0;
  for (const a of imagenSinMov) {
    const sociedadId = a.cuentaId === null ? undefined : sociedadDeCuenta.get(a.cuentaId);
    const delMes = r.datos.vencimientos.filter((v) => iso(v.fecha).slice(0, 7) === a.mes);
    if (a.cuentaId !== null && delMes.some((v) => v.cuentaEsperadaId === a.cuentaId)) porCuenta++;
    if (sociedadId !== undefined && delMes.some((v) => v.sociedadId === sociedadId)) porSociedad++;
  }
  L.push("", `4. Archivos con imagen y cero movimientos: ${imagenSinMov.length}`);
  L.push(`  con un pago esperado ese mes en esa cuenta (cuenta de pago esperada de algún vencimiento del mes): ${porCuenta}`);
  L.push(`  con algún vencimiento ese mes en la sociedad de la cuenta (cualquier cuenta): ${porSociedad}`);
  return L.join("\n");
}
