// Mide el rendimiento del Histórico con un volumen SINTÉTICO generado aquí (nunca datos reales).
// Uso: npm run historico:medir  [-- <sociedades> <obligaciones por sociedad> <meses>]   (por defecto 66 x 15 x 60)
// Solo corre contra la base de pruebas (TEST_DATABASE_URL, nombre terminado en _test): crea el volumen, mide y lo borra.
// Imprime únicamente conteos y milisegundos.
import "dotenv/config";
import { exigirBaseDePruebas } from "../src/config/proteccion-pruebas.js";

process.env.DATABASE_URL = exigirBaseDePruebas(process.env.TEST_DATABASE_URL);

const [nSoc = 66, nObl = 15, nMeses = 60] = process.argv.slice(2).map(Number);
const { prisma } = await import("../src/db.js");
const { listarVencimientos } = await import("../src/repositories/vencimientos.js");
const { vaciarImportaciones } = await import("../tests/helpers/db.js");

const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const lote = async <T>(filas: T[], tam: number, f: (x: T[]) => Promise<unknown>) => {
  for (let i = 0; i < filas.length; i += tam) await f(filas.slice(i, i + tam));
};
async function medir(nombre: string, f: () => Promise<unknown>, repeticiones = 5) {
  const t: number[] = [];
  for (let i = 0; i < repeticiones; i++) {
    const ini = performance.now();
    await f();
    t.push(performance.now() - ini);
  }
  t.sort((a, b) => a - b);
  console.log(`  ${nombre}: mediana ${t[Math.floor(t.length / 2)]!.toFixed(0)} ms (mín ${t[0]!.toFixed(0)}, máx ${t[t.length - 1]!.toFixed(0)})`);
}

await vaciarImportaciones();
const categoria = await prisma.categoria.upsert({ where: { nombreNormalizado: "medicion" }, create: { nombre: "Medicion", nombreNormalizado: "medicion" }, update: {} });
console.log(`Generando ${nSoc} sociedades x ${nObl} obligaciones x ${nMeses} meses (sintético)...`);
for (let s = 0; s < nSoc; s++) {
  await prisma.sociedad.create({ data: { codigo: `S${s}`, nombreLargo: `Sociedad sintetica ${s}` } });
}
const sociedades = await prisma.sociedad.findMany({ select: { id: true } });
const cuentas = await Promise.all(sociedades.map((s) => prisma.cuenta.create({ data: { sociedadId: s.id, numero: `SINT${s.id}`, moneda: "CRC" } })));
const archivo = await prisma.archivoImportado.create({ data: { ruta: "sintetico.xlsx", hash: "s", estado: "leido", mes: "2026-01" } });
await lote(sociedades.flatMap((s) => Array.from({ length: nObl }, (_, i) => ({ sociedadId: s.id, categoriaId: categoria.id, proveedor: `Proveedor ${i}`, identificador: `${s.id}-${i}`, diaEsperadoPago: 10 }))), 1000, (x) => prisma.obligacion.createMany({ data: x }));
const obligaciones = await prisma.obligacion.findMany({ select: { id: true, sociedadId: true, proveedor: true } });
const estados = ["pagado", "pagado", "pagado", "pagado_con_inconsistencia", "vencido", "sin_informacion", "por_revisar"];
const inicio = { y: 2026, m: 10 - nMeses + 1 };
let n = 0;
for (const o of obligaciones) {
  const cuenta = cuentas.find((c) => c.sociedadId === o.sociedadId)!;
  const movs = [];
  const vencs = [];
  for (let k = 0; k < nMeses; k++) {
    const idx = inicio.y * 12 + inicio.m - 1 + k;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const estado = estados[(n + k) % estados.length]!;
    const pagado = estado.startsWith("pagado");
    movs.push(pagado ? { cuentaId: cuenta.id, archivoId: archivo.id, hoja: "h", fila: ++n, periodo: `${y}-${String(m).padStart(2, "0")}`, fecha: dia(y, m, 12), debito: 100000n, credito: 0n, claveDedup: String(n).padStart(40, "0") } : null);
    vencs.push({ obligacionId: o.id, sociedadId: o.sociedadId, categoriaId: categoria.id, proveedor: o.proveedor, moneda: "CRC", fecha: dia(y, m, 10), periodo: `${y}-${String(m).padStart(2, "0")}`, estado });
  }
  const reales = movs.filter((x): x is NonNullable<typeof x> => x !== null);
  if (reales.length) await prisma.movimiento.createMany({ data: reales });
  const creados = reales.length ? await prisma.movimiento.findMany({ where: { cuentaId: cuenta.id, claveDedup: { in: reales.map((r) => r.claveDedup) } }, select: { id: true, claveDedup: true } }) : [];
  const porClave = new Map(creados.map((c) => [c.claveDedup, c.id]));
  let r = 0;
  await prisma.vencimiento.createMany({
    data: vencs.map((v, k) => ({ ...v, movimientoId: movs[k] ? porClave.get(reales[r++]!.claveDedup) ?? null : null })),
  });
}
console.log(`Vencimientos: ${await prisma.vencimiento.count()} · movimientos: ${await prisma.movimiento.count()}`);

const hasta = "2026-10-31";
const doce = "2025-11-01";
const cinco = "2021-11-01";
const unaSociedad = sociedades[0]!.id;
const cincuenta = obligaciones.slice(0, 50).map((o) => o.id);
const base = { pagina: 1, porPagina: 50, orden: "desc" as const };
console.log("Mediciones (por defecto: 12 meses, 50 filas por página):");
await medir("12 meses, página 1", () => listarVencimientos({ ...base, fechaDesde: doce, fechaHasta: hasta }));
await medir("12 meses, página 100", () => listarVencimientos({ ...base, pagina: 100, fechaDesde: doce, fechaHasta: hasta }));
await medir("5 años, página 1", () => listarVencimientos({ ...base, fechaDesde: cinco, fechaHasta: hasta }));
await medir("12 meses, una sociedad", () => listarVencimientos({ ...base, fechaDesde: doce, fechaHasta: hasta, sociedadId: unaSociedad }));
await medir("12 meses, estado vencido", () => listarVencimientos({ ...base, fechaDesde: doce, fechaHasta: hasta, estados: ["vencido"] }));
await medir("12 meses, alcance de 50 obligaciones", () => listarVencimientos({ ...base, fechaDesde: doce, fechaHasta: hasta, obligacionIds: cincuenta }));
await medir("12 meses, búsqueda por texto", () => listarVencimientos({ ...base, fechaDesde: doce, fechaHasta: hasta, q: "Proveedor 7" }));
await medir("un solo mes (Pagos del mes)", () => listarVencimientos({ ...base, periodo: "2026-10", orden: "asc" }));

console.log("Plan de la consulta principal (EXPLAIN, sin filas):");
const plan = (await prisma.$queryRawUnsafe(`EXPLAIN SELECT id FROM Vencimiento WHERE fecha >= '${doce}' AND fecha <= '${hasta}' ORDER BY fecha DESC, id DESC LIMIT 50`)) as { key: string | null; type: string; rows: bigint | number; Extra: string | null }[];
for (const p of plan) console.log(`  tipo ${p.type} · índice ${p.key ?? "ninguno"} · filas estimadas ${String(p.rows)} · ${p.Extra ?? ""}`);

await vaciarImportaciones();
console.log("Volumen sintético borrado.");
await prisma.$disconnect();
