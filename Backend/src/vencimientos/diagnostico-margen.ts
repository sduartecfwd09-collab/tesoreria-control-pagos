// Diagnóstico del margen de búsqueda del cruce (sin cambiar ninguna regla): SOLO conteos. Nunca descripciones, montos,
// cuentas ni identificadores completos: los identificadores salen enmascarados a sus últimos 4 dígitos. Los nombres de
// proveedor se muestran porque se piden por sociedad y proveedor; las sociedades, por abreviatura.
// Toda cifra se separa en sociedades con cobertura completa y parcial de ese mes (todas sus cuentas conocidas tienen archivo
// leído de ese mes = completa) y mantiene su total.
import { nombresEnDescripcion, proveedorCanonico } from "../config/alias-proveedores.js";
import { leerPagoConForma } from "../config/patron-pago.js";
import { cruzar, MOTIVOS, type ResultadoCruce } from "../domain/cruce.js";
import { NOMBRE_ESTADO } from "../domain/textos-pago.js";
import { identificadorClave, patronIdentificador } from "../domain/identificadores.js";
import { estadoDeArchivo } from "../domain/estado-archivo.js";
import { razonDeContinuidad, TEXTO_RAZON, type ContinuidadGuardada } from "../domain/saldo.js";
import { FORMATOS } from "../ingest/formatos.js";
import { normalizar } from "../ingest/utiles.js";
import type { CreditoParaDiagnostico, DebitoParaFormato } from "../repositories/cruce.js";
import type { ResumenCruce } from "./cruce.js";
import type { SociedadInforme } from "./diagnostico.js";

const MS_DIA = 86_400_000;
const dia = (f: Date) => Math.floor(f.getTime() / MS_DIA);
const iso = (f: Date) => f.toISOString().slice(0, 10);
const clave = (texto: string) => normalizar(texto).replace(/\s+/g, "");
const ultimos4 = (id: string) => `****${id.replace(/\s+/g, "").slice(-4)}`;
const signo = (d: number) => (d > 0 ? `+${d}` : String(d));

/** Valor de respaldo de «Distancia máxima para el diagnóstico de pagos» (parámetro `diagnostico_dias_lejos`). */
export const DIAS_LEJOS_DEFECTO = 45;

const NOMBRE_CATEGORIA = (lejos: number) => ({
  a: "(a) hay un débito con el número fuera del rango, antes",
  b: "(b) hay un débito con el número fuera del rango, después",
  c: "(c) el número aparece solo en una cuenta de otra sociedad",
  d: "(d) el número no aparece en ningún archivo",
  e: `(e) el número aparece en la sociedad, pero a más de ${lejos} días del rango o en un pago que respalda otro vencimiento`,
  f: "(f) hay un pago dentro del rango, pero quedó con duda (por revisar)",
  g: "(g) la obligación no tiene un número de servicio utilizable",
  h: "(h) el número aparece en un crédito y en ningún débito de la sociedad",
});
type Categoria = keyof ReturnType<typeof NOMBRE_CATEGORIA>;
const ORDEN_CATEGORIAS: Categoria[] = ["a", "b", "c", "d", "e", "f", "g", "h"];

export interface ArchivoMargen { cuentaId: number | null; mes: string | null; formato: string | null; estado: string; detalle: unknown; retiradoEn: Date | null }

export interface ExtrasMargen {
  /** nombre de la categoría de cada obligación activa */
  categorias: Map<number, string>;
  debitosFormato: DebitoParaFormato[];
  creditos: CreditoParaDiagnostico[];
  archivos: ArchivoMargen[];
  /** parámetro «Distancia máxima para el diagnóstico de pagos» */
  diasLejos: number;
}

export interface CifrasAntes {
  diasDespues: number;
  resultados: ResultadoCruce[];
}

type Grupo = "completa" | "parcial";

/** Un conteo con su total y su separación por cobertura. */
class Conteo {
  completa = 0;
  parcial = 0;
  add(g: Grupo, n = 1) { this[g] += n; }
  get total() { return this.completa + this.parcial; }
  texto() { return `${this.total} (cobertura completa ${this.completa} · parcial ${this.parcial})`; }
}
const conteoDe = <K>(m: Map<K, Conteo>, k: K) => m.get(k) ?? m.set(k, new Conteo()).get(k)!;

const ESTADOS_CIFRAS: { etiqueta: string; estados: string[] }[] = [
  { etiqueta: "Pagado (incluye pagado con inconsistencia)", estados: ["pagado", "pagado_con_inconsistencia"] },
  { etiqueta: "Por revisar", estados: ["por_revisar"] },
  { etiqueta: "Sin información", estados: ["sin_informacion"] },
  { etiqueta: "Vencido", estados: ["vencido"] },
  { etiqueta: "Por vencer o programado", estados: ["por_vencer", "proyectado"] },
];

export function informeMargenCruce(r: ResumenCruce, antes: CifrasAntes, sociedades: SociedadInforme[], x: ExtrasMargen): string {
  const nombre = (id: number) => sociedades.find((s) => s.id === id)?.codigo ?? `sociedad ${id}`;
  const { diasAntes, diasDespues } = r.parametros;
  const lejos = x.diasLejos;
  const CATEGORIAS = NOMBRE_CATEGORIA(lejos);
  const L: string[] = [];
  const venc = new Map(r.datos.vencimientos.map((v) => [v.id, v]));
  const obl = new Map(r.datos.obligaciones.map((o) => [o.id, o]));
  const mesDe = (f: Date) => iso(f).slice(0, 7);
  const mesHoy = mesDe(r.parametros.hoy);
  const porSociedad = <T>(m: Map<number, T>) => [...m].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])));

  // Cobertura de una sociedad en un mes: completa si todas sus cuentas conocidas tienen archivo leído de ese mes.
  const memo = new Map<string, Grupo>();
  const grupoDe = (sociedadId: number, mes: string): Grupo => {
    const k = `${sociedadId}|${mes}`;
    let g = memo.get(k);
    if (g === undefined) {
      const cuentas = r.datos.cuentas.get(sociedadId) ?? [];
      g = cuentas.length > 0 && cuentas.every((c) => c.meses.has(mes)) ? "completa" : "parcial";
      memo.set(k, g);
    }
    return g;
  };
  const etiqueta = (sociedadId: number, mes: string) => `${nombre(sociedadId)} | ${mes}${grupoDe(sociedadId, mes) === "parcial" ? " [cobertura parcial]" : ""}`;
  const grupoVenc = (vencimientoId: number) => { const v = venc.get(vencimientoId)!; return grupoDe(v.sociedadId, mesDe(v.fecha)); };

  L.push("", "Cobertura usada para separar las cifras: una sociedad tiene cobertura completa en un mes si todas sus cuentas conocidas tienen archivo leído de ese mes; si falta alguna, parcial.");
  const meses = [...new Set(r.datos.vencimientos.map((v) => mesDe(v.fecha)))].sort();
  for (const mes of meses) {
    const sociedadesDelMes = [...new Set(r.datos.vencimientos.filter((v) => mesDe(v.fecha) === mes).map((v) => v.sociedadId))];
    const parciales = sociedadesDelMes.filter((s) => grupoDe(s, mes) === "parcial").map(nombre).sort();
    L.push(`  ${mes}: ${sociedadesDelMes.length - parciales.length} sociedades con cobertura completa · ${parciales.length} con cobertura parcial${parciales.length ? ` (${parciales.join(", ")})` : ""}`);
  }

  // Débitos preparados una sola vez y, por obligación, todos los débitos de cualquier sociedad que traen su número.
  const debitos = r.datos.movimientos.map((m) => ({ id: m.id, sociedadId: m.sociedadId, dia: dia(m.fecha), texto: (m.descripcion ?? "").toUpperCase() }));
  const patron = new Map(r.datos.obligaciones.map((o) => [o.id, patronIdentificador(o.identificador)]));
  const coinciden = new Map<number, typeof debitos>();
  const conObligacion = new Set<number>();
  for (const o of r.datos.obligaciones) {
    const p = patron.get(o.id);
    if (!p) continue;
    const lista = debitos.filter((m) => p.test(m.texto));
    coinciden.set(o.id, lista);
    for (const m of lista) conObligacion.add(m.id);
  }
  const respaldados = new Set(r.resultados.flatMap((q) => (q.movimientoId === null ? [] : [q.movimientoId])));
  // Créditos: qué obligaciones traen su número en algún crédito (de cualquier sociedad) y cuántos créditos por formato traen alguno.
  const patrones = r.datos.obligaciones.flatMap((o) => { const p = patron.get(o.id); return p ? [{ id: o.id, p }] : []; });
  const creditoEn = new Set<number>();
  const creditosPorFormato = new Map<string, { total: Conteo; conId: Conteo }>();
  for (const c of x.creditos) {
    const hallados = patrones.filter((q) => q.p.test(c.descripcion));
    for (const q of hallados) creditoEn.add(q.id);
    const f = creditosPorFormato.get(c.formato ?? "sin formato") ?? { total: new Conteo(), conId: new Conteo() };
    const g = grupoDe(c.sociedadId, mesDe(c.fecha));
    f.total.add(g);
    if (hallados.length > 0) f.conId.add(g);
    creditosPorFormato.set(c.formato ?? "sin formato", f);
  }

  // 0. Cifras antes y después del margen
  L.push("", `0. Cifras con el margen de ${antes.diasDespues} días después y con el de ${diasDespues} (${diasAntes} días antes en ambos), con su separación por cobertura:`);
  L.push(`  vencimientos evaluados: ${r.vencimientos}`);
  for (const f of ESTADOS_CIFRAS) {
    const cuenta = (resultados: ResultadoCruce[]) => {
      const c = new Conteo();
      for (const q of resultados) if (f.estados.includes(q.estado)) c.add(grupoVenc(q.vencimientoId));
      return c;
    };
    const a = cuenta(antes.resultados);
    const d = cuenta(r.resultados);
    L.push(`  ${f.etiqueta}: ${a.total} -> ${d.total} · cobertura completa ${a.completa} -> ${d.completa} · parcial ${a.parcial} -> ${d.parcial}`);
  }

  // 1. Fecha de pago menos fecha del vencimiento, de -10 a +20, por sociedad
  L.push("", "1. Fecha de pago menos fecha del vencimiento, en días (de -10 a +20), por sociedad y cobertura (pagados y pagados con inconsistencia):");
  const dist = new Map<string, { sociedadId: number; grupo: Grupo; hist: Map<number, number>; antes: number; despues: number; total: number }>();
  const totalDist = new Conteo();
  for (const q of r.resultados) {
    if (q.diferenciaDias === null) continue;
    const s = venc.get(q.vencimientoId)!.sociedadId;
    const g = grupoVenc(q.vencimientoId);
    totalDist.add(g);
    const k = `${s}|${g}`;
    const f = dist.get(k) ?? { sociedadId: s, grupo: g, hist: new Map(), antes: 0, despues: 0, total: 0 };
    f.total++;
    if (q.diferenciaDias < -10) f.antes++;
    else if (q.diferenciaDias > 20) f.despues++;
    else f.hist.set(q.diferenciaDias, (f.hist.get(q.diferenciaDias) ?? 0) + 1);
    dist.set(k, f);
  }
  L.push(`  total de pagos: ${totalDist.texto()}`);
  for (const f of [...dist.values()].sort((a, b) => nombre(a.sociedadId).localeCompare(nombre(b.sociedadId)) || a.grupo.localeCompare(b.grupo))) {
    const dias = [...f.hist].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${signo(d)}: ${n}`).join(" · ");
    L.push(`  ${nombre(f.sociedadId)} [cobertura ${f.grupo}]: ${f.total} pagos · antes de -10: ${f.antes} · después de +20: ${f.despues}`);
    if (dias) L.push(`    ${dias}`);
  }
  if (dist.size === 0) L.push("  ninguno");

  // Clasificación de un vencimiento sin pago (puntos 2 y 8)
  const clasificar = (vencimientoId: number): Categoria => {
    const v = venc.get(vencimientoId)!;
    if (!patron.get(v.obligacionId)) return "g";
    const todos = coinciden.get(v.obligacionId) ?? [];
    const propios = todos.filter((m) => m.sociedadId === v.sociedadId);
    const f = dia(v.fecha);
    if (propios.some((m) => m.dia - f >= -diasAntes && m.dia - f <= diasDespues)) return "f";
    let mejor: number | null = null;
    for (const m of propios) {
      if (respaldados.has(m.id)) continue;
      const d = m.dia - f;
      if (Math.abs(d) > lejos) continue;
      if (mejor === null || Math.abs(d) < Math.abs(mejor) || (Math.abs(d) === Math.abs(mejor) && d < mejor)) mejor = d;
    }
    if (mejor !== null) return mejor < 0 ? "a" : "b";
    if (propios.length > 0) return "e";
    if (creditoEn.has(v.obligacionId)) return "h";
    return todos.length > 0 ? "c" : "d";
  };

  // 2. Vencimientos que no quedan pagados, clasificados
  L.push("", `2. Vencimientos que no quedan pagados (vencido, sin información o por revisar), clasificados; «fuera del rango» = fuera de -${diasAntes}/+${diasDespues} días y a no más de ${lejos} días (parámetro de distancia máxima), sin contar pagos que respaldan otro vencimiento; (h) se evalúa antes que (c) y (d):`);
  const sinPago = r.resultados.filter((q) => q.estado === "vencido" || q.estado === "sin_informacion" || q.estado === "por_revisar");
  const clasificados = new Map<number, Categoria>(sinPago.map((q) => [q.vencimientoId, clasificar(q.vencimientoId)]));
  const totales = new Map<Categoria, Conteo>();
  const tabla = new Map<string, Map<Categoria, number>>();
  const totalSinPago = new Conteo();
  for (const q of sinPago) {
    const v = venc.get(q.vencimientoId)!;
    const c = clasificados.get(q.vencimientoId)!;
    const g = grupoVenc(q.vencimientoId);
    totalSinPago.add(g);
    conteoDe(totales, c).add(g);
    const k = etiqueta(v.sociedadId, mesDe(v.fecha));
    const fila = tabla.get(k) ?? new Map();
    fila.set(c, (fila.get(c) ?? 0) + 1);
    tabla.set(k, fila);
  }
  L.push(`  total: ${totalSinPago.texto()} · vencido ${sinPago.filter((q) => q.estado === "vencido").length} · sin información ${sinPago.filter((q) => q.estado === "sin_informacion").length} · por revisar ${sinPago.filter((q) => q.estado === "por_revisar").length}`);
  for (const c of ORDEN_CATEGORIAS) L.push(`  ${CATEGORIAS[c]}: ${(totales.get(c) ?? new Conteo()).texto()}`);
  L.push("  por sociedad y mes:");
  for (const [k, fila] of [...tabla].sort(([a], [b]) => a.localeCompare(b))) {
    L.push(`    ${k}: ${ORDEN_CATEGORIAS.filter((c) => fila.has(c)).map((c) => `${c} ${fila.get(c)}`).join(" · ")}`);
  }

  // 2b. Créditos con un identificador del catálogo, por formato
  L.push("", "2b. Créditos que traen un número de servicio del catálogo, por formato de archivo (E1 a E7):");
  const tot = new Conteo();
  const totId = new Conteo();
  for (const f of creditosPorFormato.values()) { tot.completa += f.total.completa; tot.parcial += f.total.parcial; totId.completa += f.conId.completa; totId.parcial += f.conId.parcial; }
  L.push(`  todos los formatos: ${tot.total} créditos · con un número del catálogo: ${totId.texto()}`);
  for (const [k, f] of [...creditosPorFormato].sort(([a], [b]) => a.localeCompare(b))) L.push(`  ${k}: ${f.total.total} créditos · con un número del catálogo: ${f.conId.texto()}`);
  if (creditosPorFormato.size === 0) L.push("  sin créditos");

  // 3. Obligaciones sin ninguna coincidencia en todo el periodo cargado (cobertura del mes de hoy)
  L.push("", `3. Obligaciones sin ninguna coincidencia: ningún débito de ningún archivo cargado trae su número (cualquier fecha), por sociedad y proveedor; cobertura de su sociedad en ${mesHoy}:`);
  type FilaObl = { sociedadId: number; proveedor: string; n: Conteo };
  const sin = new Map<string, FilaObl>();
  const soloOtra = new Map<string, FilaObl>();
  let sinNumero = 0;
  const totalObl = new Conteo();
  for (const o of r.datos.obligaciones) {
    const g = grupoDe(o.sociedadId, mesHoy);
    totalObl.add(g);
    if (!patron.get(o.id)) { sinNumero++; continue; }
    const todos = coinciden.get(o.id) ?? [];
    const destino = todos.length === 0 ? sin : todos.some((m) => m.sociedadId === o.sociedadId) ? null : soloOtra;
    if (!destino) continue;
    const k = `${o.sociedadId}|${o.proveedor}`;
    const f = destino.get(k) ?? { sociedadId: o.sociedadId, proveedor: o.proveedor, n: new Conteo() };
    f.n.add(g);
    destino.set(k, f);
  }
  const ordenar = (m: Map<string, FilaObl>) => [...m.values()].sort((a, b) => nombre(a.sociedadId).localeCompare(nombre(b.sociedadId)) || a.proveedor.localeCompare(b.proveedor, "es"));
  const suma = (m: Map<string, FilaObl>) => { const c = new Conteo(); for (const f of m.values()) { c.completa += f.n.completa; c.parcial += f.n.parcial; } return c; };
  L.push(`  obligaciones activas: ${totalObl.texto()} · sin número de servicio utilizable: ${sinNumero}`);
  L.push(`  sin ninguna coincidencia en ningún archivo: ${suma(sin).texto()}`);
  for (const f of ordenar(sin)) L.push(`    ${nombre(f.sociedadId)} | ${f.proveedor}: ${f.n.texto()}`);
  L.push(`  con coincidencia solo en cuentas de otra sociedad: ${suma(soloOtra).texto()}`);
  for (const f of ordenar(soloOtra)) L.push(`    ${nombre(f.sociedadId)} | ${f.proveedor}: ${f.n.texto()}`);

  // Proveedores reconocidos por alias: nombre del banco (sin mayúsculas, tildes ni espacios) -> proveedor canónico
  const reconocidos = new Map<string, string>();
  for (const o of r.datos.obligaciones) for (const n of nombresEnDescripcion(o.proveedor)) reconocidos.set(n, proveedorCanonico(o.proveedor));
  const canonicos = [...new Set(r.datos.obligaciones.map((o) => proveedorCanonico(o.proveedor)))];
  const sanear = (t: string) => t.replace(/\d/g, "#").slice(0, 40);
  const conForma = r.datos.movimientos.flatMap((m) => {
    const p = leerPagoConForma(m.descripcion);
    return p ? [{ id: m.id, sociedadId: m.sociedadId, grupo: grupoDe(m.sociedadId, mesDe(m.fecha)), ...p }] : [];
  });

  // 4. Débitos «Pago:<PROVEEDOR> <número>» sin obligación (cobertura del mes del débito)
  L.push("", "4. Débitos con la forma «Pago:<PROVEEDOR> <número>» que no tienen obligación (ninguna obligación activa trae ese número); cobertura de la sociedad en el mes del débito:");
  const huerfanos = conForma.filter((m) => !conObligacion.has(m.id));
  const totalHuerfanos = new Conteo();
  const porSoc = new Map<number, Conteo>();
  const porReconocido = new Map<string, Conteo>();
  const porDesconocido = new Map<string, Conteo>();
  for (const m of huerfanos) {
    totalHuerfanos.add(m.grupo);
    conteoDe(porSoc, m.sociedadId).add(m.grupo);
    const canonico = reconocidos.get(clave(m.proveedor));
    conteoDe(canonico !== undefined ? porReconocido : porDesconocido, canonico ?? sanear(m.proveedor)).add(m.grupo);
  }
  L.push(`  total: ${totalHuerfanos.texto()} · identificadores distintos: ${new Set(huerfanos.map((m) => identificadorClave(m.numero))).size} (de ${conForma.length} débitos con esa forma)`);
  L.push("  por sociedad:");
  for (const [s, n] of porSociedad(porSoc)) L.push(`    ${nombre(s)}: ${n.texto()}`);
  const porConteo = (m: Map<string, Conteo>) => [...m].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], "es"));
  L.push("  por proveedor reconocido (por alias o por nombre de una obligación):");
  for (const [k, n] of porConteo(porReconocido)) L.push(`    ${k}: ${n.texto()}`);
  L.push("  por proveedor NO reconocido:");
  for (const [k, n] of porConteo(porDesconocido)) L.push(`    ${k}: ${n.texto()}`);

  // 5. Por banco y formato de archivo
  L.push("", "5. Por banco (código del IBAN) y formato de archivo: débitos, con la forma «Pago:<PROVEEDOR> <número>» y con un número de 8 o más dígitos en cada columna de texto (cobertura del mes del débito):");
  const largo = /\d{8,}/;
  const nuevo = () => ({ total: new Conteo(), forma: new Conteo(), desc: new Conteo(), ref: new Conteo(), cod: new Conteo(), cualquiera: new Conteo(), idExtraido: new Conteo() });
  const porFormato = new Map<string, ReturnType<typeof nuevo>>();
  for (const d of x.debitosFormato) {
    const k = `banco ${d.codigoBanco ?? "sin código"} | formato ${d.formato ?? "sin formato"}`;
    const f = porFormato.get(k) ?? nuevo();
    const g = grupoDe(d.sociedadId, mesDe(d.fecha));
    const enDesc = largo.test(d.descripcion ?? "");
    const enRef = largo.test(d.referencia ?? "");
    const enCod = largo.test(d.codigo ?? "");
    f.total.add(g);
    if (leerPagoConForma(d.descripcion)) f.forma.add(g);
    if (enDesc) f.desc.add(g);
    if (enRef) f.ref.add(g);
    if (enCod) f.cod.add(g);
    if (enDesc || enRef || enCod) f.cualquiera.add(g);
    if (d.tieneIdExtraido) f.idExtraido.add(g);
    porFormato.set(k, f);
  }
  for (const [k, f] of [...porFormato].sort(([a], [b]) => a.localeCompare(b))) {
    L.push(`  ${k}: ${f.total.total} débitos`);
    for (const g of ["completa", "parcial"] as Grupo[]) {
      L.push(`    cobertura ${g}: ${f.total[g]} débitos · con la forma de pago: ${f.forma[g]} · con 8+ dígitos en descripción: ${f.desc[g]}, en referencia: ${f.ref[g]}, en código: ${f.cod[g]}, en cualquiera: ${f.cualquiera[g]} · con identificador extraído al importar: ${f.idExtraido[g]}`);
    }
  }
  if (porFormato.size === 0) L.push("  sin débitos");

  // 5b. Saldo por formato y continuidad de cada archivo (la calcula el lector al importar: saldo anterior + créditos - débitos = saldo siguiente)
  L.push("", "5b. Saldo por formato (E1 a E7): ¿trae columna de saldo? y archivos que cuadran (saldo anterior + créditos - débitos = saldo siguiente en todas las filas), con la cobertura de la sociedad en el mes del archivo:");
  const sociedadDeCuenta = new Map<number, number>();
  for (const [sociedadId, cuentas] of r.datos.cuentas) for (const c of cuentas) sociedadDeCuenta.set(c.cuentaId, sociedadId);
  type Saldo = { leidos: Conteo; cuadran: Conteo; noCuadran: Conteo; noVerificables: Conteo; razones: Map<string, Conteo>; conApertura: Conteo; conFechas: Conteo; declaran: Conteo; declaranYCoinciden: Conteo };
  const nuevoSaldo = (): Saldo => ({ leidos: new Conteo(), cuadran: new Conteo(), noCuadran: new Conteo(), noVerificables: new Conteo(), razones: new Map(), conApertura: new Conteo(), conFechas: new Conteo(), declaran: new Conteo(), declaranYCoinciden: new Conteo() });
  const porSaldo = new Map<string, Saldo>();
  for (const a of x.archivos) {
    if (estadoDeArchivo(a) !== "leido") continue;
    const k = a.formato ?? "sin formato";
    const f = porSaldo.get(k) ?? nuevoSaldo();
    const s = a.cuentaId === null ? undefined : sociedadDeCuenta.get(a.cuentaId);
    const g: Grupo = s !== undefined && a.mes !== null ? grupoDe(s, a.mes) : "parcial";
    const det = a.detalle as { continuidad?: ContinuidadGuardada & { usoSaldoApertura?: boolean }; fechas?: { del: string; al: string } | null; periodoDeclarado?: { del: string | null; al: string | null } | null } | null;
    const c = det?.continuidad;
    f.leidos.add(g);
    if (c?.estado === "cuadra") f.cuadran.add(g);
    else if (c?.estado === "no_cuadra") f.noCuadran.add(g);
    else { f.noVerificables.add(g); conteoDe(f.razones, TEXTO_RAZON[razonDeContinuidad(c) ?? "otro"]).add(g); }
    if (c?.usoSaldoApertura) f.conApertura.add(g);
    if (det?.fechas) f.conFechas.add(g);
    if (det?.periodoDeclarado) {
      f.declaran.add(g);
      if (det.fechas && det.periodoDeclarado.del === det.fechas.del && det.periodoDeclarado.al === det.fechas.al) f.declaranYCoinciden.add(g);
    }
    porSaldo.set(k, f);
  }
  for (const [k, f] of [...porSaldo].sort(([a], [b]) => a.localeCompare(b))) {
    const spec = FORMATOS.find((e) => e.id === k);
    const columna = spec ? (spec.columnas.saldo ? `sí${spec.saldoDiario ? " (saldo de cierre del día)" : ""}` : "no") : "no se sabe";
    L.push(`  ${k}: columna de saldo en el formato: ${columna} · archivos leídos: ${f.leidos.texto()}`);
    L.push(`    cuadran: ${f.cuadran.texto()} · no cuadran: ${f.noCuadran.texto()} · no verificables: ${f.noVerificables.texto()} · comparados con saldo de apertura: ${f.conApertura.texto()}`);
    for (const [razon, n] of [...f.razones].sort((a, b) => b[1].total - a[1].total)) L.push(`      no verificables porque ${razon}: ${n.texto()}`);
    L.push(`    Del y Al reales guardados: ${f.conFechas.texto()} · declaran el período en el encabezado: ${f.declaran.texto()} · de ellos, con el mismo Del y Al que las fechas reales: ${f.declaranYCoinciden.texto()}`);
  }
  if (porSaldo.size === 0) L.push("  sin archivos leídos");

  // 6. Variantes del nombre del proveedor sin alias
  L.push("", "6. Variantes del nombre de proveedor en «Pago:» que no están reconocidas (sin alias ni nombre de obligación), con el proveedor al que podrían corresponder:");
  const variantes = new Map<string, { debitos: Conteo; numeros: Set<string> }>();
  for (const m of conForma) {
    if (reconocidos.has(clave(m.proveedor))) continue;
    const k = sanear(m.proveedor);
    const f = variantes.get(k) ?? { debitos: new Conteo(), numeros: new Set() };
    f.debitos.add(m.grupo);
    f.numeros.add(identificadorClave(m.numero));
    variantes.set(k, f);
  }
  const sugerir = (variante: string) => {
    const v = clave(variante);
    return canonicos.filter((c) => {
      const k = clave(c);
      return k.length >= 3 && v.length >= 3 && (v.startsWith(k) || k.startsWith(v) || (k.length >= 4 && v.includes(k)));
    });
  };
  for (const [k, f] of [...variantes].sort((a, b) => b[1].debitos.total - a[1].debitos.total || a[0].localeCompare(b[0], "es"))) {
    const s = sugerir(k);
    L.push(`  ${k}: ${f.debitos.texto()} débitos · ${f.numeros.size} identificadores distintos · correspondería a: ${s.length ? s.join(" / ") : "sin sugerencia (ningún proveedor de las obligaciones se le parece)"}`);
  }
  if (variantes.size === 0) L.push("  ninguna");

  // 7. Vencimientos cuyo rango empieza antes de la primera fecha con datos de su sociedad
  L.push("", "7. Vencimientos cuyo rango de búsqueda empieza antes de la primera fecha con datos de su sociedad, por sociedad y mes:");
  L.push("  (A = antes de la primera fecha de cualquiera de sus cuentas; B = antes de la primera fecha de todas sus cuentas, es decir, la más tardía)");
  const primeras = new Map<number, { a: number; b: number }>();
  for (const [sociedadId, cuentas] of r.datos.cuentas) {
    const fechas = cuentas.map((c) => c.primeraFecha).filter((f): f is Date => f instanceof Date).map(dia);
    if (fechas.length > 0) primeras.set(sociedadId, { a: Math.min(...fechas), b: Math.max(...fechas) });
  }
  const antesDeDatos = new Map<string, { a: number; b: number }>();
  const estadoA = new Map<string, number>();
  const totA = new Conteo();
  const totB = new Conteo();
  const resultadoDe = new Map(r.resultados.map((q) => [q.vencimientoId, q.estado]));
  for (const v of r.datos.vencimientos) {
    const p = primeras.get(v.sociedadId);
    const inicio = dia(v.fecha) - diasAntes;
    const esA = !p || inicio < p.a;
    const esB = !p || inicio < p.b;
    if (!esB) continue;
    const g = grupoDe(v.sociedadId, mesDe(v.fecha));
    const k = etiqueta(v.sociedadId, mesDe(v.fecha));
    const f = antesDeDatos.get(k) ?? { a: 0, b: 0 };
    totB.add(g);
    f.b++;
    if (esA) { f.a++; totA.add(g); const e = resultadoDe.get(v.id) ?? "sin resultado"; estadoA.set(e, (estadoA.get(e) ?? 0) + 1); }
    antesDeDatos.set(k, f);
  }
  L.push(`  total B: ${totB.texto()} · de ellos A: ${totA.texto()}`);
  L.push(`  estado de los A: ${[...estadoA].sort().map(([e, n]) => `${e} ${n}`).join(" · ") || "ninguno"}`);
  for (const [k, f] of [...antesDeDatos].sort(([a], [b]) => a.localeCompare(b))) L.push(`  ${k}: A ${f.a} · B ${f.b}`);

  // 8. Lista para validar con José
  L.push("", `8. Para validar con José: vencimientos que siguen Vencido o Sin información con el margen de ${diasDespues} días después (sociedad | proveedor | categoría | mes | número | estado | cobertura | motivo):`);
  const ESTADO_TEXTO: Record<string, string> = { vencido: "Vencido", sin_informacion: "Sin información" };
  const abiertos = r.resultados
    .filter((q: ResultadoCruce) => q.estado === "vencido" || q.estado === "sin_informacion")
    .map((q) => {
      const v = venc.get(q.vencimientoId)!;
      const o = obl.get(v.obligacionId)!;
      const categoria = CATEGORIAS[clasificados.get(q.vencimientoId) ?? clasificar(q.vencimientoId)];
      return {
        socNombre: nombre(v.sociedadId), proveedor: o.proveedor, categoria: x.categorias.get(o.id) ?? "sin categoría", mes: mesDe(v.fecha), id: ultimos4(o.identificador),
        estado: ESTADO_TEXTO[q.estado]!, grupo: grupoVenc(q.vencimientoId),
        motivo: q.estado === "sin_informacion" && q.motivo === MOTIVOS.sinInformacionDesde ? `sin estados de cuenta anteriores a la primera fecha cargada; ${categoria}` : categoria,
      };
    });
  abiertos.sort((a, b) => a.socNombre.localeCompare(b.socNombre) || a.proveedor.localeCompare(b.proveedor, "es") || a.mes.localeCompare(b.mes));
  const totalAbiertos = new Conteo();
  for (const a of abiertos) totalAbiertos.add(a.grupo);
  L.push(`  total: ${totalAbiertos.texto()}`);
  for (const a of abiertos) L.push(`  ${a.socNombre} | ${a.proveedor} | ${a.categoria} | ${a.mes} | ${a.id} | ${a.estado} | cobertura ${a.grupo} | ${a.motivo}`);

  // 9. Rango de búsqueda: qué pasa con más días antes (los días después quedan como están). Solo en memoria: no guarda nada.
  L.push("", `9. Más días antes de la fecha de pago (días después = ${diasDespues}); cifras por estado con su separación por cobertura:`);
  for (const dAntes of DIAS_ANTES_PRUEBA) {
    const { resultados } = cruzar({ ...r.datos, ...r.parametros, diasAntes: dAntes });
    const partes = ESTADOS_CIFRAS.slice(0, 4).map((f) => {
      const c = new Conteo();
      for (const q of resultados) if (f.estados.includes(q.estado)) c.add(grupoVenc(q.vencimientoId));
      return `${f.etiqueta.split(" (")[0]} ${c.total} (completa ${c.completa} · parcial ${c.parcial})`;
    });
    // un pago nunca respalda dos vencimientos: se cuenta cuántos movimientos aparecen en más de un resultado
    const usados = new Map<number, number>();
    for (const q of resultados) if (q.movimientoId !== null) usados.set(q.movimientoId, (usados.get(q.movimientoId) ?? 0) + 1);
    const repetidos = [...usados.values()].filter((n) => n > 1).length;
    L.push(`  ${dAntes} días antes${dAntes === diasAntes ? " (valor actual)" : ""}: ${partes.join(" · ")} · pagos que respaldan más de un vencimiento: ${repetidos}`);
  }

  // 10. Regla «desde»: la cobertura de una cuenta empieza en el «Del» que declara su primer archivo (o el día 1 del mes del archivo).
  // Se compara con la regla anterior (primera fecha con movimientos de cada cuenta). Solo en memoria.
  L.push("", "10. Vencimientos que cambian de estado por la regla «desde» (cobertura desde el Del declarado por el primer archivo de cada cuenta, o el día 1 de su mes), frente a la regla anterior (primera fecha con movimientos):");
  const cuentasAntes = new Map([...r.datos.cuentas].map(([s, cs]) => [s, cs.map((c) => ({ ...c, inicioCobertura: c.primeraFecha ?? null }))]));
  const estadoAntes = new Map(cruzar({ ...r.datos, ...r.parametros, cuentas: cuentasAntes }).resultados.map((q) => [q.vencimientoId, q.estado]));
  const cambian = r.resultados.filter((q) => estadoAntes.get(q.vencimientoId) !== q.estado);
  const totalCambian = new Conteo();
  for (const q of cambian) totalCambian.add(grupoVenc(q.vencimientoId));
  L.push(`  vencimientos que cambian: ${totalCambian.texto()}`);
  const nombreEstado = (e: string | undefined) => NOMBRE_ESTADO[e ?? ""] ?? "sin estado";
  for (const q of cambian.slice().sort((a, b) => nombre(venc.get(a.vencimientoId)!.sociedadId).localeCompare(nombre(venc.get(b.vencimientoId)!.sociedadId)) || mesDe(venc.get(a.vencimientoId)!.fecha).localeCompare(mesDe(venc.get(b.vencimientoId)!.fecha)))) {
    const v = venc.get(q.vencimientoId)!;
    const o = obl.get(v.obligacionId)!;
    L.push(`  ${nombre(v.sociedadId)} | ${o.proveedor} | ${mesDe(v.fecha)} | ${ultimos4(o.identificador)} | ${nombreEstado(estadoAntes.get(q.vencimientoId))} -> ${nombreEstado(q.estado)} | cobertura ${grupoVenc(q.vencimientoId)}`);
  }
  return L.join("\n");
}

/** Días antes que prueba la tabla 9. */
const DIAS_ANTES_PRUEBA = [3, 5, 7, 10];
