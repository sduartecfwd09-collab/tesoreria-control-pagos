// «Movimientos sin obligación»: débitos con la forma «Pago:PROVEEDOR número» cuyo número no corresponde a ninguna obligación
// del catálogo. Solo informa. Puro: recibe los débitos (nunca créditos: los créditos no cuentan como pago) y los identificadores.
import { createHash } from "node:crypto";
import { leerPagoConForma } from "../config/patron-pago.js";
import { identificadorEnmascarado } from "./avisos.js";
import { identificadorClave, patronIdentificador } from "./identificadores.js";

export interface DebitoConPago {
  fecha: Date;
  descripcion: string | null;
  sociedad: string;
  /** cuenta ya enmascarada (últimos 4) */
  cuenta: string;
  banco?: string | null;
  referencia?: string | null;
  /** centavos */
  monto?: number;
  moneda?: string | null;
  hoja?: string;
  fila?: number;
  archivo?: { id: number; rutaRelativa: string };
}

export interface GrupoSinObligacion {
  /** identifica el grupo para pedir su detalle: proveedor y número */
  clave: string;
  proveedor: string;
  /** identificador enmascarado a sus últimos 4 caracteres */
  identificador: string;
  pagos: number;
  primeraFecha: string;
  ultimaFecha: string;
  sociedades: string[];
  cuentas: string[];
}

export interface PagoSinObligacion {
  fecha: string;
  banco: string | null;
  cuenta: string;
  sociedad: string;
  /** la descripción completa, tal como viene del banco */
  descripcion: string;
  referencia: string | null;
  monto: number;
  moneda: string | null;
  /** el número completo extraído de la descripción */
  identificador: string;
  comoSeExtrajo: string;
  archivo: { id: number; nombre: string; rutaRelativa: string } | null;
  hoja: string | null;
  fila: number | null;
}

/** Clave opaca de un grupo (proveedor y número): sirve para pedir su detalle sin mostrar el número completo en la lista. */
export const claveDeGrupo = (proveedor: string, numero: string): string => createHash("sha1").update(`${proveedor}|${identificadorClave(numero)}`).digest("hex").slice(0, 16);

/** Los débitos con la forma de pago cuyo número no está en el catálogo, con su proveedor y número extraídos. */
function sinObligacion(debitos: DebitoConPago[], identificadoresDelCatalogo: string[]) {
  const patrones = identificadoresDelCatalogo.flatMap((id) => { const p = patronIdentificador(id); return p ? [p] : []; });
  return debitos.flatMap((d) => {
    const pago = leerPagoConForma(d.descripcion);
    if (!pago) return [];
    if (patrones.some((p) => p.test((d.descripcion ?? "").toUpperCase()))) return []; // el número es de una obligación del catálogo
    return [{ d, pago, clave: claveDeGrupo(pago.proveedor, pago.numero) }];
  });
}

export function movimientosSinObligacion(debitos: DebitoConPago[], identificadoresDelCatalogo: string[]): GrupoSinObligacion[] {
  const grupos = new Map<string, GrupoSinObligacion & { sociedadesSet: Set<string>; cuentasSet: Set<string> }>();
  for (const { d, pago, clave } of sinObligacion(debitos, identificadoresDelCatalogo)) {
    const fecha = d.fecha.toISOString().slice(0, 10);
    const g = grupos.get(clave) ?? { clave, proveedor: pago.proveedor, identificador: identificadorEnmascarado(pago.numero), pagos: 0, primeraFecha: fecha, ultimaFecha: fecha, sociedades: [], cuentas: [], sociedadesSet: new Set(), cuentasSet: new Set() };
    g.pagos++;
    if (fecha < g.primeraFecha) g.primeraFecha = fecha;
    if (fecha > g.ultimaFecha) g.ultimaFecha = fecha;
    g.sociedadesSet.add(d.sociedad);
    g.cuentasSet.add(d.cuenta);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map(({ sociedadesSet, cuentasSet, ...g }) => ({ ...g, sociedades: [...sociedadesSet].sort(), cuentas: [...cuentasSet].sort() }))
    .sort((a, b) => b.pagos - a.pagos || a.proveedor.localeCompare(b.proveedor, "es") || a.identificador.localeCompare(b.identificador));
}

/** Cada pago de un grupo, con todo lo que hace falta para reconocerlo: descripción completa, número completo y de dónde sale. */
export function detalleDeGrupo(debitos: DebitoConPago[], identificadoresDelCatalogo: string[], clave: string): { proveedor: string; pagos: PagoSinObligacion[] } | null {
  const del = sinObligacion(debitos, identificadoresDelCatalogo).filter((x) => x.clave === clave).sort((a, b) => a.d.fecha.getTime() - b.d.fecha.getTime());
  if (del.length === 0) return null;
  return {
    proveedor: del[0]!.pago.proveedor,
    pagos: del.map(({ d, pago }) => ({
      fecha: d.fecha.toISOString().slice(0, 10),
      banco: d.banco ?? null,
      cuenta: d.cuenta,
      sociedad: d.sociedad,
      descripcion: d.descripcion ?? "",
      referencia: d.referencia ?? null,
      monto: d.monto ?? 0,
      moneda: d.moneda ?? null,
      identificador: pago.numero,
      comoSeExtrajo: `Del texto «Pago:PROVEEDOR número» de la descripción: «${pago.proveedor}» es el nombre del proveedor y «${pago.numero}» es el número que lo sigue.`,
      archivo: d.archivo ? { id: d.archivo.id, nombre: d.archivo.rutaRelativa.split("/").pop() ?? d.archivo.rutaRelativa, rutaRelativa: d.archivo.rutaRelativa } : null,
      hoja: d.hoja ?? null,
      fila: d.fila ?? null,
    })),
  };
}
