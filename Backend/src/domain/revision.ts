// «Revisada»: una obligación «En revisión» (falta el día, falta el mes de arranque, identificador repetido o con formato de IBAN) se puede marcar
// como revisada con una nota. La nota explica; NO corrige el dato. La decisión guarda una HUELLA de los datos que causan la revisión: si cambian los
// datos o cambia la causa, la revisión queda sin efecto (la decisión no se borra) y la obligación vuelve a «En revisión». Reglas puras.
import { createHash } from "node:crypto";
import { identificadorClave } from "./identificadores.js";
import { etiquetasDe, type Etiqueta, type ObligacionCalidad, type identificadoresRepetidos } from "./obligaciones.js";

export const TIPO_REVISION_OBLIGACION = "revision_obligacion";

/** Clave de la columna única de una revisión vigente por obligación («r|», distinta de «j|…», «a|…» y de las asociaciones). */
export const claveUnicaRevision = (obligacionId: number) => `r|${obligacionId}`;

type Repetidos = ReturnType<typeof identificadoresRepetidos>;

/**
 * Lo que entra en la huella: las causas detectadas (ordenadas), el día, la frecuencia y el mes de arranque, el identificador normalizado, el proveedor
 * y, si el identificador está repetido, los otros proveedores del grupo (ordenados). NO entran monto, cuenta, moneda, «Control desde» ni activa.
 */
export interface DatosDeHuella {
  causas: string[];
  dia: number | null;
  frecuencia: string;
  mesArranque: number | null;
  identificador: string;
  proveedor: string;
  otrosProveedores: string[];
}

export function datosDeHuella(o: ObligacionCalidad, causas: Etiqueta[], repetidos: Repetidos): DatosDeHuella {
  const grupo = repetidos.find((g) => g.obligaciones.includes(o.id));
  return {
    causas: causas.map((c) => c.codigo).sort(),
    dia: o.diaEsperadoPago,
    frecuencia: o.frecuencia,
    mesArranque: o.mesArranque,
    identificador: identificadorClave(o.identificador),
    proveedor: o.proveedor.trim().toLowerCase(),
    otrosProveedores: grupo ? grupo.proveedores.filter((p) => p !== o.proveedor).map((p) => p.trim().toLowerCase()).sort() : [],
  };
}

/** SHA-256 en hexadecimal (64 caracteres: cabe justo en la columna `huella`) de los datos en un orden fijo. */
export function huellaDeRevision(d: DatosDeHuella): string {
  const canonico = JSON.stringify([d.causas, d.dia, d.frecuencia, d.mesArranque, d.identificador, d.proveedor, d.otrosProveedores]);
  return createHash("sha256").update(canonico).digest("hex");
}

/** La huella de una obligación tal como está ahora (con sus causas actuales); null si no tiene ninguna causa de revisión. */
export function huellaActual(o: ObligacionCalidad, repetidos: Repetidos): { huella: string; causas: Etiqueta[] } | null {
  if (!o.activa) return null;
  const causas = etiquetasDe(o, repetidos);
  return causas.length === 0 ? null : { huella: huellaDeRevision(datosDeHuella(o, causas, repetidos)), causas };
}

/** ¿La revisión sigue teniendo efecto? Sí solo si la obligación sigue «En revisión» y la huella de ahora es la de cuando se revisó. */
export const revisionConEfecto = (decision: { huella: string | null } | null | undefined, actual: { huella: string } | null): boolean =>
  decision !== null && decision !== undefined && actual !== null && decision.huella === actual.huella;

/** Los identificadores de las obligaciones con una revisión vigente Y con efecto (las que salen de «En revisión»). */
export function revisionesConEfecto(obs: ObligacionCalidad[], repetidos: Repetidos, decisiones: Map<number, { huella: string | null }>): Set<number> {
  const r = new Set<number>();
  for (const o of obs) {
    const d = decisiones.get(o.id);
    if (d && revisionConEfecto(d, huellaActual(o, repetidos))) r.add(o.id);
  }
  return r;
}
