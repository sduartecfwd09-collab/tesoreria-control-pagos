// «Diferencias con el Excel»: calcula las diferencias contra el archivo del catálogo y aplica lo que decide una persona. Cada resolución es una
// DecisionManual (tipo «diferencia_excel») con la HUELLA de lo decidido: si los datos cambian la diferencia vuelve a aparecer y la decisión anterior
// se cierra (no se borra). Cada acción escribe su línea del historial en la MISMA transacción. Los permisos (persona y sociedad) los verifica la ruta.
import { prisma } from "../db.js";
import { normalizarMotivo } from "../domain/cambio-dia.js";
import {
  ACCIONES_DE, calcularDiferencias, claveUnicaDiferencia, lineaDeDiferencia, type AccionDiferencia, type Diferencia, type TipoDiferencia,
} from "../domain/diferencias-excel.js";
import { enmascararIdentificador } from "../domain/enmascarar.js";
import { lineasDeEdicion } from "../domain/historial.js";
import { ErrorDeServicio } from "../domain/permisos.js";
import type { Reloj } from "../domain/reloj.js";
import { cambiarDia } from "../obligaciones/cambiar-dia.js";
import { crearDecisionDiferencia, decisionesDeDiferencias, decisionVigenteDeClave, obligacionesParaDiferencias, sociedadesParaResolver } from "../repositories/diferencias.js";
import { revertirDecision } from "../repositories/decisiones.js";
import { insertarHistorial, type AutorDelCambio } from "../repositories/historial.js";
import { obtenerObligacion } from "../repositories/obligaciones.js";
import { actualizarVencimientos } from "../vencimientos/mantenimiento.js";
import type { FuenteDeFilas } from "./fuente-excel.js";
import { resolverFilas } from "./fuente-excel.js";

const esViolacionUnica = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

export interface DiferenciaCalculada extends Diferencia {
  estado: "pendiente" | "decidida";
  decision: { accion: AccionDiferencia; quien: string; cuando: string; motivo: string } | null;
}

interface DatosDeDecision {
  a: AccionDiferencia;
  t: TipoDiferencia;
  /** lo que se veía al decidir (para mostrar una decidida que ya no es una diferencia): proveedores acortados e identificadores enmascarados */
  pp: string; ip: string; dp: number | null; pe: string | null; ie: string | null; de: number | null;
}

const recortar = (t: string) => t.slice(0, 60);
const leerDatos = (texto: string | null): DatosDeDecision | null => {
  try {
    const d = JSON.parse(texto ?? "") as DatosDeDecision;
    return d && typeof d.a === "string" && typeof d.t === "string" ? d : null;
  } catch {
    return null;
  }
};

/**
 * Las diferencias de ahora con su estado: «decidida» si hay una decisión vigente con la misma huella; «pendiente» si no (también cuando la decisión
 * era de datos que ya cambiaron). Además, las decididas que ya no son una diferencia (se desactivó la obligación, se usó el día del Excel), tomadas
 * de la propia decisión. `disponible` = false si no hay archivo del catálogo que leer: no se inventa ninguna diferencia.
 */
export async function listarDiferencias(fuente: FuenteDeFilas): Promise<{ disponible: boolean; filas: (DiferenciaCalculada & { sociedadNombre: string; tesoreroId: number | null })[] }> {
  const crudas = await fuente();
  const sociedades = new Map((await sociedadesParaResolver()).map((s) => [s.id, s]));
  const decisiones = new Map((await decisionesDeDiferencias()).map((d) => [d.unicaObligacionPeriodo!, d]));
  const calculadas = crudas === null ? [] : calcularDiferencias(await obligacionesParaDiferencias(), await resolverFilas(crudas));
  const conSociedad = (d: Omit<DiferenciaCalculada, "sociedadNombre">, sociedadId: number) => ({
    ...d, sociedadNombre: sociedades.get(sociedadId)?.nombreLargo ?? "Sociedad", tesoreroId: sociedades.get(sociedadId)?.tesoreroId ?? null,
  });
  const salida: (DiferenciaCalculada & { sociedadNombre: string; tesoreroId: number | null })[] = [];
  const vistas = new Set<string>();
  for (const d of calculadas) {
    const dec = decisiones.get(claveUnicaDiferencia(d));
    const datos = dec ? leerDatos(dec.datos) : null;
    const decidida = Boolean(dec && datos && dec.huella === d.huella);
    if (dec) vistas.add(claveUnicaDiferencia(d));
    salida.push(conSociedad({
      ...d, estado: decidida ? "decidida" : "pendiente",
      decision: decidida && dec && datos ? { accion: datos.a, quien: dec.nombreUsuario, cuando: dec.creadoEn.toISOString(), motivo: dec.motivo } : null,
    }, d.sociedadId));
  }
  // decididas que ya no figuran como diferencia (la obligación se desactivó, o el día del Excel ya rige): se muestran desde su propia decisión
  for (const [clave, dec] of decisiones) {
    const datos = leerDatos(dec.datos);
    if (vistas.has(clave) || !datos || dec.sociedadId === null || dec.obligacionId === null) continue;
    const partes = clave.slice(2).split("-");
    const nuevaId = partes[0] === "r" ? Number(partes[2]) || null : null;
    salida.push(conSociedad({
      clave: clave.slice(2), tipo: datos.t, sociedadId: dec.sociedadId, obligacionId: dec.obligacionId, nuevaId, huella: dec.huella ?? "",
      plataforma: { proveedor: datos.pp, identificador: datos.ip, dia: datos.dp },
      excel: datos.pe === null ? null : { proveedor: datos.pe, identificador: datos.ie ?? "", dia: datos.de },
      estado: "decidida", decision: { accion: datos.a, quien: dec.nombreUsuario, cuando: dec.creadoEn.toISOString(), motivo: dec.motivo },
    }, dec.sociedadId));
  }
  return { disponible: crudas !== null, filas: salida };
}

/** Lo que se guarda de lo que se veía al decidir: nunca un identificador completo. */
function datosParaGuardar(d: Diferencia, accion: AccionDiferencia): string {
  const x: DatosDeDecision = {
    a: accion, t: d.tipo, pp: recortar(d.plataforma.proveedor), ip: enmascararIdentificador(d.plataforma.identificador), dp: d.plataforma.dia,
    pe: d.excel ? recortar(d.excel.proveedor) : null, ie: d.excel ? enmascararIdentificador(d.excel.identificador) : null, de: d.excel?.dia ?? null,
  };
  return JSON.stringify(x);
}

/** Resuelve UNA diferencia pendiente. `d.diferencia` ya viene validada como pendiente y de este tipo; aquí van las reglas de cada acción. */
export async function resolverDiferencia(
  d: { diferencia: Diferencia; accion: AccionDiferencia; motivo: unknown; desdeMes?: unknown; aplicaAlMesEnCurso?: unknown; autor: AutorDelCambio },
  reloj: Reloj,
): Promise<void> {
  const dif = d.diferencia;
  if (!ACCIONES_DE[dif.tipo].includes(d.accion)) throw new ErrorDeServicio("validacion", "Esa acción no corresponde a este tipo de diferencia", "accion");
  const motivo = normalizarMotivo(d.motivo);
  if (motivo === null) throw new ErrorDeServicio("validacion", "Indique el motivo (entre 3 y 300 caracteres)", "motivo");
  const clave = claveUnicaDiferencia(dif);
  const nueva = dif.nuevaId !== null ? await obtenerObligacion(dif.nuevaId) : null;
  const linea = lineaDeDiferencia(d.accion, nueva?.proveedor);

  /** la decisión y su línea del historial; cierra (sin borrar) una decisión anterior de datos que ya cambiaron */
  const dejarDecision = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    const previa = await decisionVigenteDeClave(tx, clave);
    if (previa) {
      if (previa.huella === dif.huella) throw new ErrorDeServicio("conflicto", "Esta diferencia ya está decidida.");
      await revertirDecision(tx, previa.id, "Los datos cambiaron", d.autor);
    }
    await crearDecisionDiferencia(tx, { sociedadId: dif.sociedadId, obligacionId: dif.obligacionId, clave, huella: dif.huella, motivo, datos: datosParaGuardar(dif, d.accion), autor: d.autor });
    await insertarHistorial(tx, { obligacionId: dif.obligacionId, sociedadId: dif.sociedadId, autor: d.autor, lineas: [linea], motivo });
  };

  try {
    if (d.accion === "usar_excel") {
      const o = await obtenerObligacion(dif.obligacionId);
      if (!o) throw new ErrorDeServicio("no_encontrado", "Obligación no encontrada");
      if (dif.excel?.dia == null) throw new ErrorDeServicio("conflicto", "El Excel ya no trae un día para esta obligación.");
      // el mismo servicio del cambio permanente: mismas reglas («Desde el mes», pregunta del mes en curso, motivo) y su propia línea del historial
      await cambiarDia({ obligacion: o, nuevoDia: dif.excel.dia, desdeMes: d.desdeMes, aplicaAlMesEnCurso: d.aplicaAlMesEnCurso, motivo, autor: d.autor, enLaTransaccion: dejarDecision }, reloj);
      return;
    }
    if (d.accion === "es_la_misma" || d.accion === "desactivar") {
      await prisma.$transaction(async (tx) => {
        const antes = await tx.obligacion.findUnique({ where: { id: dif.obligacionId } });
        if (!antes) throw new ErrorDeServicio("no_encontrado", "Obligación no encontrada");
        if (!antes.activa) throw new ErrorDeServicio("conflicto", "Esta obligación ya está desactivada.");
        const despues = await tx.obligacion.update({ where: { id: antes.id }, data: { activa: false } });
        await insertarHistorial(tx, { obligacionId: antes.id, sociedadId: antes.sociedadId, autor: d.autor, lineas: lineasDeEdicion(antes, despues), motivo });
        await dejarDecision(tx);
      });
      await actualizarVencimientos(reloj, dif.obligacionId); // los vencimientos futuros sin pagar de la desactivada se retiran; lo pasado y lo decidido se conserva
      return;
    }
    await prisma.$transaction(dejarDecision);
  } catch (e) {
    if (esViolacionUnica(e)) throw new ErrorDeServicio("conflicto", "Esta diferencia ya está decidida.");
    throw e;
  }
}
