// Diagnóstico de los grupos de obligaciones que comparten el mismo número de servicio dentro de una sociedad (caso GGDI).
// Imprime conteos, estados, fechas y los rótulos del banco con los números largos enmascarados: nunca el número de servicio,
// montos ni cuentas. Sirve para entender por qué una fila sale «Por revisar» y otra no, y si el nombre del proveedor se reconoce.
import { nombresEnDescripcion } from "../config/alias-proveedores.js";
import { enmascararNumerosLargos } from "../domain/enmascarar.js";
import { identificadorClave, patronIdentificador } from "../domain/identificadores.js";
import { NOMBRE_ESTADO } from "../domain/textos-pago.js";
import { normalizar } from "../ingest/utiles.js";
import type { ResumenCruce } from "./cruce.js";
import type { SociedadInforme } from "./diagnostico.js";

export interface MovimientoGrupo { sociedadId: number; fecha: Date; descripcion: string | null; esDebito: boolean }

const iso = (f: Date) => f.toISOString().slice(0, 10);
const plano = (t: string) => normalizar(t).replace(/\s+/g, "");

export function informeGruposCompartidos(r: ResumenCruce, sociedades: SociedadInforme[], movimientos: MovimientoGrupo[]): string {
  const nombre = (id: number) => sociedades.find((s) => s.id === id)?.codigo ?? `sociedad ${id}`;
  const L: string[] = [];
  const grupos = new Map<string, typeof r.datos.obligaciones>();
  for (const o of r.datos.obligaciones) {
    const k = `${o.sociedadId}|${identificadorClave(o.identificador)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), o]);
  }
  const compartidos = [...grupos.values()].filter((g) => g.length > 1);
  L.push(`Grupos de obligaciones con el mismo número de servicio en una misma sociedad: ${compartidos.length}`);
  const resultado = new Map(r.resultados.map((x) => [x.vencimientoId, x]));
  const rotulos = new Map(r.datos.obligaciones.map((o) => [o.id, nombresEnDescripcion(o.proveedor)]));
  let n = 0;
  for (const grupo of compartidos) {
    n++;
    const sociedadId = grupo[0]!.sociedadId;
    L.push("", `Grupo ${n} (${nombre(sociedadId)}): ${grupo.length} obligaciones`);
    for (const o of grupo) L.push(`  ${o.proveedor}: el nombre se busca en la descripción como ${(rotulos.get(o.id) ?? []).map((x) => `«${x}»`).join(", ")}`);

    L.push("  Estado de cada vencimiento por mes:");
    const ids = new Set(grupo.map((o) => o.id));
    for (const v of [...r.datos.vencimientos].filter((x) => ids.has(x.obligacionId)).sort((a, b) => iso(a.fecha).localeCompare(iso(b.fecha)))) {
      const q = resultado.get(v.id)!;
      const o = grupo.find((x) => x.id === v.obligacionId)!;
      L.push(`    ${iso(v.fecha)} | ${o.proveedor}: ${NOMBRE_ESTADO[q.estado] ?? q.estado}${q.motivo ? ` (${q.motivo})` : ""}`);
    }

    const patron = patronIdentificador(grupo[0]!.identificador);
    const movs = patron ? movimientos.filter((m) => m.sociedadId === sociedadId && patron.test((m.descripcion ?? "").toUpperCase())).sort((a, b) => iso(a.fecha).localeCompare(iso(b.fecha))) : [];
    L.push(`  Movimientos de la sociedad con ese número de servicio: ${movs.length}`);
    for (const m of movs) {
      const texto = plano(m.descripcion ?? "");
      const reconoce = grupo.map((o) => `${o.proveedor} ${(rotulos.get(o.id) ?? []).some((x) => texto.includes(x)) ? "sí" : "no"}`).join(" · ");
      L.push(`    ${iso(m.fecha)} | ${m.esDebito ? "débito" : "crédito"} | rótulo: ${m.descripcion ? enmascararNumerosLargos(m.descripcion) : "(sin descripción)"} | se reconoce el proveedor: ${reconoce}`);
    }
  }
  return L.join("\n");
}
