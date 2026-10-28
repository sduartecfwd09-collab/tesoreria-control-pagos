// «Movimientos sin obligación»: débitos con la forma «Pago:PROVEEDOR número» cuyo número no corresponde a ninguna obligación
// del catálogo. Solo informa. Puro: recibe los débitos (nunca créditos: los créditos no cuentan como pago) y los identificadores.
import { leerPagoConForma } from "../config/patron-pago.js";
import { identificadorEnmascarado } from "./avisos.js";
import { identificadorClave, patronIdentificador } from "./identificadores.js";

export interface DebitoConPago {
  fecha: Date;
  descripcion: string | null;
  sociedad: string;
  /** cuenta ya enmascarada (últimos 4) */
  cuenta: string;
}

export interface GrupoSinObligacion {
  proveedor: string;
  /** identificador enmascarado a sus últimos 4 caracteres */
  identificador: string;
  pagos: number;
  primeraFecha: string;
  ultimaFecha: string;
  sociedades: string[];
  cuentas: string[];
}

export function movimientosSinObligacion(debitos: DebitoConPago[], identificadoresDelCatalogo: string[]): GrupoSinObligacion[] {
  const patrones = identificadoresDelCatalogo.flatMap((id) => { const p = patronIdentificador(id); return p ? [p] : []; });
  const grupos = new Map<string, GrupoSinObligacion & { sociedadesSet: Set<string>; cuentasSet: Set<string> }>();
  for (const d of debitos) {
    const pago = leerPagoConForma(d.descripcion);
    if (!pago) continue;
    const texto = (d.descripcion ?? "").toUpperCase();
    if (patrones.some((p) => p.test(texto))) continue; // el número es de una obligación del catálogo
    const k = `${pago.proveedor}|${identificadorClave(pago.numero)}`;
    const fecha = d.fecha.toISOString().slice(0, 10);
    const g = grupos.get(k) ?? { proveedor: pago.proveedor, identificador: identificadorEnmascarado(pago.numero), pagos: 0, primeraFecha: fecha, ultimaFecha: fecha, sociedades: [], cuentas: [], sociedadesSet: new Set(), cuentasSet: new Set() };
    g.pagos++;
    if (fecha < g.primeraFecha) g.primeraFecha = fecha;
    if (fecha > g.ultimaFecha) g.ultimaFecha = fecha;
    g.sociedadesSet.add(d.sociedad);
    g.cuentasSet.add(d.cuenta);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map(({ sociedadesSet, cuentasSet, ...g }) => ({ ...g, sociedades: [...sociedadesSet].sort(), cuentas: [...cuentasSet].sort() }))
    .sort((a, b) => b.pagos - a.pagos || a.proveedor.localeCompare(b.proveedor, "es") || a.identificador.localeCompare(b.identificador));
}
