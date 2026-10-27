// Diagnóstico del margen de búsqueda del cruce (sin cambiar ninguna regla): SOLO conteos. Nunca descripciones, montos,
// cuentas ni identificadores completos: los identificadores salen enmascarados a sus últimos 4 dígitos. Los nombres de
// proveedor se muestran porque se piden por sociedad y proveedor; las sociedades, por abreviatura.
import { nombresEnDescripcion, proveedorCanonico } from "../config/alias-proveedores.js";
import { leerPagoConForma } from "../config/patron-pago.js";
import { MOTIVOS, type ResultadoCruce } from "../domain/cruce.js";
import { identificadorClave, patronIdentificador } from "../domain/identificadores.js";
import { normalizar } from "../ingest/utiles.js";
import type { DebitoParaFormato } from "../repositories/cruce.js";
import type { ResumenCruce } from "./cruce.js";
import type { SociedadInforme } from "./diagnostico.js";

const MS_DIA = 86_400_000;
const dia = (f: Date) => Math.floor(f.getTime() / MS_DIA);
const iso = (f: Date) => f.toISOString().slice(0, 10);
const clave = (texto: string) => normalizar(texto).replace(/\s+/g, "");
const ultimos4 = (id: string) => `****${id.replace(/\s+/g, "").slice(-4)}`;
const signo = (d: number) => (d > 0 ? `+${d}` : String(d));

/** Hasta cuántos días de distancia del rango se considera «fuera del rango» al clasificar un vencimiento sin pago (punto 2). */
export const DIAS_LEJOS = 45;

const CATEGORIAS = {
  a: "(a) hay un débito con el número fuera del rango, antes",
  b: "(b) hay un débito con el número fuera del rango, después",
  c: "(c) el número aparece solo en una cuenta de otra sociedad",
  d: "(d) el número no aparece en ningún archivo",
  e: `(e) el número aparece en la sociedad, pero a más de ${DIAS_LEJOS} días del rango o en un pago que respalda otro vencimiento`,
  f: "(f) hay un pago dentro del rango, pero quedó con duda (por revisar)",
  g: "(g) la obligación no tiene un número de servicio utilizable",
} as const;
type Categoria = keyof typeof CATEGORIAS;

export interface ExtrasMargen {
  /** nombre de la categoría de cada obligación activa */
  categorias: Map<number, string>;
  debitosFormato: DebitoParaFormato[];
}

export interface CifrasAntes {
  diasDespues: number;
  porEstado: Record<string, number>;
}

const ESTADOS_CIFRAS: { clave: string; etiqueta: string; estados: string[] }[] = [
  { clave: "pagado", etiqueta: "Pagado (incluye pagado con inconsistencia)", estados: ["pagado", "pagado_con_inconsistencia"] },
  { clave: "por_revisar", etiqueta: "Por revisar", estados: ["por_revisar"] },
  { clave: "sin_informacion", etiqueta: "Sin información", estados: ["sin_informacion"] },
  { clave: "vencido", etiqueta: "Vencido", estados: ["vencido"] },
  { clave: "otros", etiqueta: "Por vencer o programado", estados: ["por_vencer", "proyectado"] },
];

const sumaDe = (porEstado: Record<string, number>, estados: string[]) => estados.reduce((a, e) => a + (porEstado[e] ?? 0), 0);

export function informeMargenCruce(r: ResumenCruce, antes: CifrasAntes, sociedades: SociedadInforme[], x: ExtrasMargen): string {
  const nombre = (id: number) => sociedades.find((s) => s.id === id)?.codigo ?? `sociedad ${id}`;
  const { diasAntes, diasDespues } = r.parametros;
  const L: string[] = [];
  const venc = new Map(r.datos.vencimientos.map((v) => [v.id, v]));
  const obl = new Map(r.datos.obligaciones.map((o) => [o.id, o]));
  const mesDe = (f: Date) => iso(f).slice(0, 7);
  const porSociedad = <T>(m: Map<number, T>) => [...m].sort((a, b) => nombre(a[0]).localeCompare(nombre(b[0])));

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

  // 0. Cifras antes y después del margen
  L.push("", `0. Cifras con el margen de ${antes.diasDespues} días después y con el de ${diasDespues} (antes ${diasAntes} días antes, igual en ambos):`);
  L.push(`  vencimientos evaluados: ${r.vencimientos}`);
  for (const f of ESTADOS_CIFRAS) L.push(`  ${f.etiqueta}: ${sumaDe(antes.porEstado, f.estados)} -> ${sumaDe(r.porEstado, f.estados)}`);

  // 1. Fecha de pago menos fecha del vencimiento, de -10 a +20, por sociedad
  L.push("", "1. Fecha de pago menos fecha del vencimiento, en días (de -10 a +20), por sociedad (pagados y pagados con inconsistencia):");
  const dist = new Map<number, { hist: Map<number, number>; antes: number; despues: number; total: number }>();
  for (const q of r.resultados) {
    if (q.diferenciaDias === null) continue;
    const s = venc.get(q.vencimientoId)!.sociedadId;
    const f = dist.get(s) ?? { hist: new Map(), antes: 0, despues: 0, total: 0 };
    f.total++;
    if (q.diferenciaDias < -10) f.antes++;
    else if (q.diferenciaDias > 20) f.despues++;
    else f.hist.set(q.diferenciaDias, (f.hist.get(q.diferenciaDias) ?? 0) + 1);
    dist.set(s, f);
  }
  for (const [s, f] of porSociedad(dist)) {
    const dias = [...f.hist].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${signo(d)}: ${n}`).join(" · ");
    L.push(`  ${nombre(s)}: ${f.total} pagos · antes de -10: ${f.antes} · después de +20: ${f.despues}`);
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
      if (Math.abs(d) > DIAS_LEJOS) continue;
      if (mejor === null || Math.abs(d) < Math.abs(mejor) || (Math.abs(d) === Math.abs(mejor) && d < mejor)) mejor = d;
    }
    if (mejor !== null) return mejor < 0 ? "a" : "b";
    if (propios.length > 0) return "e";
    return todos.length > 0 ? "c" : "d";
  };

  // 2. Vencimientos que no quedan pagados, clasificados
  L.push("", `2. Vencimientos que no quedan pagados (vencido, sin información o por revisar), clasificados; «fuera del rango» = fuera de -${diasAntes}/+${diasDespues} días y a no más de ${DIAS_LEJOS} días, sin contar pagos que respaldan otro vencimiento:`);
  const sinPago = r.resultados.filter((q) => q.estado === "vencido" || q.estado === "sin_informacion" || q.estado === "por_revisar");
  const clasificados = new Map<number, Categoria>(sinPago.map((q) => [q.vencimientoId, clasificar(q.vencimientoId)]));
  const totales = new Map<Categoria, number>();
  const tabla = new Map<string, Map<Categoria, number>>();
  for (const q of sinPago) {
    const v = venc.get(q.vencimientoId)!;
    const c = clasificados.get(q.vencimientoId)!;
    totales.set(c, (totales.get(c) ?? 0) + 1);
    const k = `${nombre(v.sociedadId)} | ${mesDe(v.fecha)}`;
    const fila = tabla.get(k) ?? new Map();
    fila.set(c, (fila.get(c) ?? 0) + 1);
    tabla.set(k, fila);
  }
  L.push(`  total: ${sinPago.length} (vencido ${sinPago.filter((q) => q.estado === "vencido").length} · sin información ${sinPago.filter((q) => q.estado === "sin_informacion").length} · por revisar ${sinPago.filter((q) => q.estado === "por_revisar").length})`);
  for (const c of Object.keys(CATEGORIAS) as Categoria[]) L.push(`  ${CATEGORIAS[c]}: ${totales.get(c) ?? 0}`);
  L.push("  por sociedad y mes:");
  for (const [k, fila] of [...tabla].sort(([a], [b]) => a.localeCompare(b))) {
    L.push(`    ${k}: ${(Object.keys(CATEGORIAS) as Categoria[]).filter((c) => fila.has(c)).map((c) => `${c} ${fila.get(c)}`).join(" · ")}`);
  }

  // 3. Obligaciones sin ninguna coincidencia en todo el periodo cargado
  L.push("", "3. Obligaciones sin ninguna coincidencia: ningún débito de ningún archivo cargado trae su número (cualquier fecha), por sociedad y proveedor:");
  const sin = new Map<string, { sociedadId: number; proveedor: string; n: number }>();
  const soloOtra = new Map<string, { sociedadId: number; proveedor: string; n: number }>();
  let sinNumero = 0;
  for (const o of r.datos.obligaciones) {
    if (!patron.get(o.id)) { sinNumero++; continue; }
    const todos = coinciden.get(o.id) ?? [];
    const destino = todos.length === 0 ? sin : todos.some((m) => m.sociedadId === o.sociedadId) ? null : soloOtra;
    if (!destino) continue;
    const k = `${o.sociedadId}|${o.proveedor}`;
    const f = destino.get(k) ?? { sociedadId: o.sociedadId, proveedor: o.proveedor, n: 0 };
    f.n++;
    destino.set(k, f);
  }
  const ordenar = (m: Map<string, { sociedadId: number; proveedor: string; n: number }>) =>
    [...m.values()].sort((a, b) => nombre(a.sociedadId).localeCompare(nombre(b.sociedadId)) || a.proveedor.localeCompare(b.proveedor, "es"));
  const suma = (m: Map<string, { n: number }>) => [...m.values()].reduce((a, f) => a + f.n, 0);
  L.push(`  obligaciones activas: ${r.datos.obligaciones.length} · sin número de servicio utilizable: ${sinNumero}`);
  L.push(`  sin ninguna coincidencia en ningún archivo: ${suma(sin)}`);
  for (const f of ordenar(sin)) L.push(`    ${nombre(f.sociedadId)} | ${f.proveedor}: ${f.n}`);
  L.push(`  con coincidencia solo en cuentas de otra sociedad: ${suma(soloOtra)}`);
  for (const f of ordenar(soloOtra)) L.push(`    ${nombre(f.sociedadId)} | ${f.proveedor}: ${f.n}`);

  // Proveedores reconocidos por alias: nombre del banco (sin mayúsculas, tildes ni espacios) -> proveedor canónico
  const reconocidos = new Map<string, string>();
  for (const o of r.datos.obligaciones) for (const n of nombresEnDescripcion(o.proveedor)) reconocidos.set(n, proveedorCanonico(o.proveedor));
  const canonicos = [...new Set(r.datos.obligaciones.map((o) => proveedorCanonico(o.proveedor)))];
  const sanear = (t: string) => t.replace(/\d/g, "#").slice(0, 40);
  const conForma = r.datos.movimientos.flatMap((m) => {
    const p = leerPagoConForma(m.descripcion);
    return p ? [{ id: m.id, sociedadId: m.sociedadId, ...p }] : [];
  });

  // 4. Débitos «Pago:<PROVEEDOR> <número>» sin obligación
  L.push("", "4. Débitos con la forma «Pago:<PROVEEDOR> <número>» que no tienen obligación (ninguna obligación activa trae ese número):");
  const huerfanos = conForma.filter((m) => !conObligacion.has(m.id));
  const porSoc = new Map<number, number>();
  const porReconocido = new Map<string, number>();
  const porDesconocido = new Map<string, number>();
  for (const m of huerfanos) {
    porSoc.set(m.sociedadId, (porSoc.get(m.sociedadId) ?? 0) + 1);
    const canonico = reconocidos.get(clave(m.proveedor));
    const [mapa, k] = canonico !== undefined ? [porReconocido, canonico] : [porDesconocido, sanear(m.proveedor)];
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  L.push(`  total: ${huerfanos.length} · identificadores distintos: ${new Set(huerfanos.map((m) => identificadorClave(m.numero))).size} (de ${conForma.length} débitos con esa forma)`);
  L.push("  por sociedad:");
  for (const [s, n] of porSociedad(porSoc)) L.push(`    ${nombre(s)}: ${n}`);
  L.push("  por proveedor reconocido (por alias o por nombre de una obligación):");
  for (const [k, n] of [...porReconocido].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))) L.push(`    ${k}: ${n}`);
  L.push("  por proveedor NO reconocido:");
  for (const [k, n] of [...porDesconocido].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))) L.push(`    ${k}: ${n}`);

  // 5. Por banco y formato de archivo
  L.push("", "5. Por banco (código del IBAN) y formato de archivo: débitos, con la forma «Pago:<PROVEEDOR> <número>» y con un número de 8 o más dígitos en cada columna de texto:");
  const largo = /\d{8,}/;
  const porFormato = new Map<string, { total: number; forma: number; desc: number; ref: number; cod: number; cualquiera: number; idExtraido: number }>();
  for (const d of x.debitosFormato) {
    const k = `banco ${d.codigoBanco ?? "sin código"} | formato ${d.formato ?? "sin formato"}`;
    const f = porFormato.get(k) ?? { total: 0, forma: 0, desc: 0, ref: 0, cod: 0, cualquiera: 0, idExtraido: 0 };
    const enDesc = largo.test(d.descripcion ?? "");
    const enRef = largo.test(d.referencia ?? "");
    const enCod = largo.test(d.codigo ?? "");
    f.total++;
    if (leerPagoConForma(d.descripcion)) f.forma++;
    if (enDesc) f.desc++;
    if (enRef) f.ref++;
    if (enCod) f.cod++;
    if (enDesc || enRef || enCod) f.cualquiera++;
    if (d.tieneIdExtraido) f.idExtraido++;
    porFormato.set(k, f);
  }
  for (const [k, f] of [...porFormato].sort(([a], [b]) => a.localeCompare(b))) {
    L.push(`  ${k}: ${f.total} débitos · con la forma de pago: ${f.forma} · con 8+ dígitos en descripción: ${f.desc}, en referencia: ${f.ref}, en código: ${f.cod}, en cualquiera: ${f.cualquiera} · con identificador extraído al importar: ${f.idExtraido}`);
  }
  if (porFormato.size === 0) L.push("  sin débitos");

  // 6. Variantes del nombre del proveedor sin alias
  L.push("", "6. Variantes del nombre de proveedor en «Pago:» que no están reconocidas (sin alias ni nombre de obligación), con el proveedor al que podrían corresponder:");
  const variantes = new Map<string, { debitos: number; numeros: Set<string> }>();
  for (const m of conForma) {
    if (reconocidos.has(clave(m.proveedor))) continue;
    const k = sanear(m.proveedor);
    const f = variantes.get(k) ?? { debitos: 0, numeros: new Set() };
    f.debitos++;
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
  for (const [k, f] of [...variantes].sort((a, b) => b[1].debitos - a[1].debitos || a[0].localeCompare(b[0], "es"))) {
    const s = sugerir(k);
    L.push(`  ${k}: ${f.debitos} débitos · ${f.numeros.size} identificadores distintos · correspondería a: ${s.length ? s.join(" / ") : "sin sugerencia (ningún proveedor de las obligaciones se le parece)"}`);
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
  const antesDeDatos = new Map<string, { total: number; a: number; b: number }>();
  const estadoA = new Map<string, number>();
  for (const v of r.datos.vencimientos) {
    const p = primeras.get(v.sociedadId);
    const inicio = dia(v.fecha) - diasAntes;
    const esA = !p || inicio < p.a;
    const esB = !p || inicio < p.b;
    if (!esB) continue;
    const k = `${nombre(v.sociedadId)} | ${mesDe(v.fecha)}`;
    const f = antesDeDatos.get(k) ?? { total: 0, a: 0, b: 0 };
    f.total++;
    if (esA) { f.a++; const e = r.resultados.find((q) => q.vencimientoId === v.id)?.estado ?? "sin resultado"; estadoA.set(e, (estadoA.get(e) ?? 0) + 1); }
    f.b++;
    antesDeDatos.set(k, f);
  }
  L.push(`  total (B): ${[...antesDeDatos.values()].reduce((a, f) => a + f.b, 0)} · de ellos A: ${[...antesDeDatos.values()].reduce((a, f) => a + f.a, 0)}`);
  L.push(`  estado de los A: ${[...estadoA].sort().map(([e, n]) => `${e} ${n}`).join(" · ") || "ninguno"}`);
  for (const [k, f] of [...antesDeDatos].sort(([a], [b]) => a.localeCompare(b))) L.push(`  ${k}: A ${f.a} · B ${f.b}`);

  // 8. Lista para validar con José
  L.push("", `8. Para validar con José: vencimientos que siguen Vencido o Sin información con el margen de ${diasDespues} días después (sociedad | proveedor | categoría | mes | número | estado | motivo):`);
  const ESTADO_TEXTO: Record<string, string> = { vencido: "Vencido", sin_informacion: "Sin información" };
  const abiertos = r.resultados
    .filter((q: ResultadoCruce) => q.estado === "vencido" || q.estado === "sin_informacion")
    .map((q) => {
      const v = venc.get(q.vencimientoId)!;
      const o = obl.get(v.obligacionId)!;
      return {
        socNombre: nombre(v.sociedadId), proveedor: o.proveedor, categoria: x.categorias.get(o.id) ?? "sin categoría", mes: mesDe(v.fecha), id: ultimos4(o.identificador),
        estado: ESTADO_TEXTO[q.estado]!, motivo: q.estado === "sin_informacion" && q.motivo === MOTIVOS.sinInformacionDesde ? `sin estados de cuenta anteriores a la primera fecha cargada; ${CATEGORIAS[clasificarSeguro(q.vencimientoId)]}` : CATEGORIAS[clasificarSeguro(q.vencimientoId)],
      };
    });
  function clasificarSeguro(id: number): Categoria {
    return clasificados.get(id) ?? clasificar(id);
  }
  abiertos.sort((a, b) => a.socNombre.localeCompare(b.socNombre) || a.proveedor.localeCompare(b.proveedor, "es") || a.mes.localeCompare(b.mes));
  L.push(`  total: ${abiertos.length}`);
  for (const a of abiertos) L.push(`  ${a.socNombre} | ${a.proveedor} | ${a.categoria} | ${a.mes} | ${a.id} | ${a.estado} | ${a.motivo}`);
  return L.join("\n");
}
