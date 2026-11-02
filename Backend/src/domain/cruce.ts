// Motor de cruce: decide el estado de cada vencimiento a partir de los débitos de los estados de cuenta. Puro (sin base):
// recibe todo lo que necesita y devuelve resultados deterministas; repetirlo con los mismos datos da lo mismo.
//
// Reglas (V = vencimiento con fecha vigente F; ventana = [F - díasAntes, F + díasDespués], días calendario):
//  1. Candidatos: débitos cuya descripción contiene el identificador de la obligación, con fecha en la ventana. Un movimiento
//     no se usa en dos vencimientos de la misma obligación: va al más cercano; si empata en cercanía, Por revisar.
//  2. Un candidato en una cuenta de la misma sociedad: Pagado (con los días de diferencia si pagó después de F).
//  3. Candidato solo en cuenta de otra sociedad: Pagado con inconsistencia («pagado por otra sociedad»).
//  4. Dos o más movimientos distintos en la ventana: Pagado con inconsistencia («pago repetido»).
//  5. Identificador compartido por varias obligaciones (las de una misma sociedad se evalúan como grupo): desempata el nombre
//     del proveedor en la descripción (sin distinguir mayúsculas, tildes ni espacios) si además la fecha coincide con su
//     vencimiento; si no hay certeza, TODOS los vencimientos del grupo de ese mes pasan a Por revisar y el movimiento no se asigna.
//  6. Sin candidatos y hoy antes de F menos los días de aviso: Proyectado; desde ahí hasta F: Por vencer.
//  7. Sin candidatos y hoy posterior a F: Vencido solo si los estados de cuenta cubren todo el rango (desde F - díasAntes, y
//     no empieza antes de la primera fecha con movimientos cargados) hasta F + díasDespués; si hay
//     duda de cobertura, Sin información (con la fecha hasta la que hay datos): es un estado que requiere atención y nunca
//     se muestra como Vencido, salvo que el parámetro «Marcar Vencido aunque falte el estado de cuenta» esté encendido.
//
// ORDEN DE EVALUACIÓN de los estados de un vencimiento (el primero que se cumple gana):
//  1. Empate de un pago entre dos vencimientos de la misma obligación -> Por revisar.
//  2. Pago dudoso por número de servicio compartido (grupo) -> Por revisar.
//  3. Hay pago asignado -> Pagado, o Pagado con inconsistencia (pago repetido u otra sociedad).
//  4. Hoy antes de F menos los días de aviso (los del responsable de la obligación) -> Programado; hasta F -> Por vencer.
//  4b. Pasó F pero hoy <= F + días de espera -> Por vencer («se espera el pago»).
//  5. Pasó F + días de espera y la cobertura de estados de cuenta cubre el rango hasta ayer (o hasta F + días después, si ya pasó) -> Vencido
//     («se sigue buscando» hasta F + días después; después, «no se encontró pago»).
//  6. No cubre y algún estado de cuenta del rango no cuadra con su saldo -> Sin información (siempre; ni el parámetro lo vuelve Vencido).
//  6b. No cubre y algún archivo del rango trae los movimientos como imagen (sin movimientos y con imagen grande) -> Sin información (siempre).
//  7. No cubre y el parámetro «Marcar Vencido aunque falte el estado de cuenta» está encendido -> Vencido con nota.
//  8. No cubre porque el rango empieza antes de la primera fecha con datos -> Sin información.
//  9. No cubre por otra causa -> Sin información con la fecha hasta la que hay datos.
// Por eso un pago candidato con duda (1 o 2) prevalece sobre Sin información: Por revisar se decide antes de mirar la cobertura.
// Los créditos nunca cuentan como pago: solo se cruzan débitos.
//
// DECISIONES MANUALES (antes de todo lo anterior): una asociación de pago vigente (obligación + periodo + huella del movimiento) deja ese
// vencimiento en Pagado con ese movimiento, gana a lo automático y a Por revisar, y saca el movimiento de los candidatos de cualquier
// otro vencimiento (esos se recalculan solos). Si el movimiento ya no se encuentra (o no es de la misma sociedad), la decisión sigue
// vigente pero no tiene efecto y el vencimiento vuelve a su estado calculado. Sin decisiones vigentes el resultado es idéntico al de siempre.
// JUSTIFICACIÓN de un vencimiento: se aplica DESPUÉS de calcular el estado y solo si ese estado es Vencido o Sin información: queda «Justificado».
// Si hay un pago (automático o asociación manual), el pago manda: queda Pagado y la justificación no tiene efecto. No cuenta como pagado.
import { nombresEnDescripcion } from "../config/alias-proveedores.js";
import { normalizar } from "../ingest/utiles.js";
import { coberturaDeSociedad, noCuadraEnRango, sinLecturaEnRango, type CuentaCorte } from "./cobertura-corte.js";
import { identificadorClave, patronIdentificador } from "./identificadores.js";

export type EstadoCruce = "proyectado" | "por_vencer" | "vencido" | "pagado" | "pagado_con_inconsistencia" | "sin_informacion" | "por_revisar" | "justificado";

export const MOTIVOS = {
  pagado: "Pago encontrado en una cuenta de la sociedad",
  otraSociedad: "Pagado por otra sociedad",
  repetido: "Pago repetido",
  empate: "El pago podría corresponder a dos meses distintos de este servicio",
  asociadoAMano: "Pago asociado a mano",
  justificado: "Justificado a mano",
  compartido: "No se pudo saber con certeza a cuál servicio corresponde el pago: el número de servicio está en varias obligaciones",
  vencido: "Pasó la fecha de pago y no hay pago en los estados de cuenta",
  vencidoBuscando: "El pago no aparece todavía; se sigue buscando",
  esperaPago: "Pasó el día de pago; se espera el pago",
  sinInformacion: "Faltan estados de cuenta para confirmar si hubo pago",
  sinInformacionSaldo: "Un estado de cuenta no cuadra con su saldo: no se usa para confirmar si hubo pago",
  sinInformacionImagen: "Un estado de cuenta trae los movimientos como imagen y no se puede leer: no se usa para confirmar si hubo pago",
  sinInformacionDesde: "No hay estados de cuenta anteriores a la primera fecha cargada: el pago pudo hacerse antes",
  vencidoSinEstado: "Pasó la fecha de pago; sin estado de cuenta que lo confirme",
} as const;

export interface ObligacionCruce { id: number; sociedadId: number; proveedor: string; identificador: string }
export interface VencimientoCruce { id: number; obligacionId: number; sociedadId: number; fecha: Date; /** AAAA-MM; si falta se toma de la fecha */ periodo?: string }
export interface MovimientoCruce {
  id: number;
  sociedadId: number;
  fecha: Date;
  descripcion: string | null;
  /** huella estable del movimiento (claveDedup); solo hace falta para localizar las asociaciones manuales */
  clave?: string;
}
/** Un vencimiento justificado a mano (obligación + periodo): solo aplica si el estado calculado es Vencido o Sin información. */
export interface JustificacionManual { obligacionId: number; periodo: string }
/** Asociación manual de un pago a un vencimiento (obligación + periodo), por la huella del movimiento. */
export interface AsociacionManual { obligacionId: number; periodo: string; claveMovimiento: string }

export interface EntradaCruce {
  /** solo obligaciones activas */
  obligaciones: ObligacionCruce[];
  vencimientos: VencimientoCruce[];
  /** solo débitos de archivos que no están retirados */
  movimientos: MovimientoCruce[];
  /** asociaciones manuales vigentes; sin ellas (o vacías) el cruce es el automático de siempre */
  asociaciones?: AsociacionManual[];
  /** justificaciones manuales vigentes de vencimientos; sin ellas (o vacías) el cruce es el de siempre */
  justificaciones?: JustificacionManual[];
  /** cuentas conocidas por sociedad */
  cuentas: Map<number, CuentaCorte[]>;
  diasAntes: number;
  diasDespues: number;
  diasAviso: number;
  /** avisos propios del responsable efectivo de cada obligación (id de obligación -> días); sin entrada se usa `diasAviso` */
  avisoPorObligacion?: Map<number, number>;
  /** días de espera después del día de pago antes de marcar Vencido (valor general); 0 = sin espera */
  diasEspera?: number;
  /** espera propia del responsable efectivo de cada obligación (id de obligación -> días); sin entrada se usa `diasEspera` */
  esperaPorObligacion?: Map<number, number>;
  /** parámetro «Marcar Vencido aunque falte el estado de cuenta»: apagado por defecto */
  marcarVencidoSinEstado?: boolean;
  hoy: Date;
}

export interface ResultadoCruce {
  vencimientoId: number;
  estado: EstadoCruce;
  movimientoId: number | null;
  motivo: string | null;
  diferenciaDias: number | null;
  sinInfoHasta: Date | null;
}

/** Conteos para el diagnóstico (nunca contenido de movimientos). */
export interface EstadisticasCruce {
  /** débitos que no contienen el identificador de ninguna obligación activa, por sociedad de su cuenta */
  sinObligacionPorSociedad: Map<number, number>;
  /** débitos con el identificador de una obligación, pero la sociedad de su cuenta no tiene esa obligación */
  deOtraSociedadPorSociedad: Map<number, number>;
  /** identificador compartido: resueltos por el nombre del proveedor y sin resolver */
  desempatadosPorProveedor: number;
  compartidosSinResolver: number;
  /** movimientos que empataron entre dos vencimientos de la misma obligación */
  empates: number;
}

const MS_DIA = 86_400_000;
const clave = (texto: string) => normalizar(texto).replace(/\s+/g, "");
const diaDe = (f: Date) => Math.floor(f.getTime() / MS_DIA);

interface MovPrep extends MovimientoCruce { plano: string; dia: number }

function agregar<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const lista = m.get(k);
  if (lista) lista.push(v);
  else m.set(k, [v]);
}

export function cruzar(e: EntradaCruce): { resultados: ResultadoCruce[]; estadisticas: EstadisticasCruce } {
  const est: EstadisticasCruce = {
    sinObligacionPorSociedad: new Map(), deOtraSociedadPorSociedad: new Map(), desempatadosPorProveedor: 0, compartidosSinResolver: 0, empates: 0,
  };
  const sumar = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);

  const obls = e.obligaciones
    .map((o) => ({
      ...o,
      patron: patronIdentificador(o.identificador),
      nombres: nombresEnDescripcion(o.proveedor),
    }))
    .filter((o): o is typeof o & { patron: RegExp } => o.patron !== null);

  const vencDe = new Map<number, VencimientoCruce[]>();
  for (const v of e.vencimientos) agregar(vencDe, v.obligacionId, v);
  const enVentana = (m: { dia: number }, v: VencimientoCruce) => m.dia >= diaDe(v.fecha) - e.diasAntes && m.dia <= diaDe(v.fecha) + e.diasDespues;
  const periodoDe = (v: VencimientoCruce) => v.periodo ?? v.fecha.toISOString().slice(0, 7);

  // Decisiones manuales primero: vencimiento -> pago elegido; esos pagos salen de los candidatos de todos los demás.
  const manual = new Map<number, MovimientoCruce>();
  const excluidos = new Set<number>();
  if (e.asociaciones && e.asociaciones.length > 0) {
    const porClave = new Map(e.movimientos.flatMap((m) => (m.clave ? [[m.clave, m] as const] : [])));
    const porPeriodo = new Map(e.vencimientos.map((v) => [`${v.obligacionId}|${periodoDe(v)}`, v] as const));
    for (const a of e.asociaciones) {
      const m = porClave.get(a.claveMovimiento);
      const v = porPeriodo.get(`${a.obligacionId}|${a.periodo}`);
      if (!m || !v || m.sociedadId !== v.sociedadId || excluidos.has(m.id) || manual.has(v.id)) continue; // sin efecto
      manual.set(v.id, m);
      excluidos.add(m.id);
    }
  }
  const movimientosLibres = excluidos.size > 0 ? e.movimientos.filter((m) => !excluidos.has(m.id)) : e.movimientos;
  // Grupo: las obligaciones de una misma sociedad con el mismo identificador se evalúan juntas.
  const grupoDe = new Map(e.obligaciones.map((o) => [o.id, `${o.sociedadId}|${identificadorClave(o.identificador)}`]));
  const vencDelGrupo = new Map<string, VencimientoCruce[]>(); // grupo y periodo -> vencimientos
  for (const v of e.vencimientos) {
    const g = grupoDe.get(v.obligacionId);
    if (g !== undefined) agregar(vencDelGrupo, `${g}|${periodoDe(v)}`, v);
  }

  // Paso 1: a qué obligación pertenece cada débito (a ninguna, a una, o a varias sin poder decidir).
  const propios = new Map<number, MovPrep[]>(); // obligación -> débitos que le pertenecen
  const ambiguos = new Map<string, MovPrep[]>(); // grupo -> débitos del grupo que no se pudieron atribuir con certeza
  for (const m of movimientosLibres) {
    const texto = (m.descripcion ?? "").toUpperCase();
    const prep: MovPrep = { ...m, plano: clave(m.descripcion ?? ""), dia: diaDe(m.fecha) };
    const coinciden = obls.filter((o) => o.patron.test(texto));
    if (coinciden.length === 0) { sumar(est.sinObligacionPorSociedad, m.sociedadId); continue; }
    const enSociedad = coinciden.filter((o) => o.sociedadId === m.sociedadId);
    if (enSociedad.length === 0) sumar(est.deOtraSociedadPorSociedad, m.sociedadId);
    // si la sociedad de la cuenta tiene una obligación con ese identificador, el pago es de ella y no de las de otras sociedades
    const pool = enSociedad.length > 0 ? enSociedad : coinciden;
    let duenos = pool;
    if (pool.length > 1) {
      const porProveedor = pool.filter((o) => o.nombres.some((n) => prep.plano.includes(n)));
      // Con certeza = el nombre apunta a una sola obligación Y la fecha coincide con su vencimiento. Si el nombre dice una y
      // la fecha solo encaja con otra del grupo, no hay certeza: nunca se interpreta distinto para cada fila.
      const dueno = porProveedor.length === 1 ? porProveedor[0]! : null;
      const fechaDelDueno = dueno !== null && (vencDe.get(dueno.id) ?? []).some((v) => enVentana(prep, v));
      const fechaDeAlguna = pool.some((o) => (vencDe.get(o.id) ?? []).some((v) => enVentana(prep, v)));
      if (dueno !== null && (fechaDelDueno || !fechaDeAlguna)) { duenos = [dueno]; est.desempatadosPorProveedor++; }
      else {
        est.compartidosSinResolver++;
        for (const g of new Set(pool.map((o) => grupoDe.get(o.id)!))) agregar(ambiguos, g, prep);
        continue;
      }
    }
    for (const o of duenos) agregar(propios, o.id, prep);
  }

  // Paso 2: por obligación, cada débito va al vencimiento más cercano dentro de cuya ventana cae.
  const porVencimiento = new Map<number, MovPrep[]>();
  const conEmpate = new Set<number>();
  for (const [obligacionId, vs] of vencDe) {
    for (const m of propios.get(obligacionId) ?? []) {
      const dentro = vs.filter((v) => enVentana(m, v));
      if (dentro.length === 0) continue;
      const dist = (v: VencimientoCruce) => Math.abs(m.dia - diaDe(v.fecha));
      const minimo = Math.min(...dentro.map(dist));
      const mejores = dentro.filter((v) => dist(v) === minimo);
      if (mejores.length > 1) { est.empates++; for (const v of mejores) conEmpate.add(v.id); continue; }
      agregar(porVencimiento, mejores[0]!.id, m);
    }
  }

  // Paso 3: estado de cada vencimiento.
  const hoyDia = diaDe(e.hoy);
  const justificados = new Set((e.justificaciones ?? []).map((j) => `${j.obligacionId}|${j.periodo}`));
  const calcular = (v: VencimientoCruce): ResultadoCruce => {
    const base = { vencimientoId: v.id, movimientoId: null, diferenciaDias: null, sinInfoHasta: null };
    const f = diaDe(v.fecha);
    // la decisión manual gana a todo lo demás (también a Por revisar)
    const elegido = manual.get(v.id);
    if (elegido) return { vencimientoId: v.id, estado: "pagado", movimientoId: elegido.id, motivo: MOTIVOS.asociadoAMano, diferenciaDias: diaDe(elegido.fecha) - f, sinInfoHasta: null };
    const asignados = porVencimiento.get(v.id) ?? [];
    // Un movimiento del grupo sin certeza deja en revisión a TODOS los vencimientos del grupo de ese mes, no solo al que lo contiene.
    const g = grupoDe.get(v.obligacionId);
    const delGrupo = g === undefined ? [v] : (vencDelGrupo.get(`${g}|${periodoDe(v)}`) ?? [v]);
    const dudosos = (g === undefined ? [] : ambiguos.get(g) ?? []).some((m) => delGrupo.some((w) => enVentana(m, w)));
    if (conEmpate.has(v.id)) return { ...base, estado: "por_revisar", motivo: MOTIVOS.empate };
    if (dudosos) return { ...base, estado: "por_revisar", motivo: MOTIVOS.compartido };
    if (asignados.length > 0) {
      // el más cercano a F (a igual cercanía, el más antiguo y luego el de menor id: orden estable)
      const elegido = [...asignados].sort((a, b) => Math.abs(a.dia - f) - Math.abs(b.dia - f) || a.dia - b.dia || a.id - b.id)[0]!;
      const pago = { vencimientoId: v.id, movimientoId: elegido.id, diferenciaDias: elegido.dia - f, sinInfoHasta: null };
      if (asignados.length > 1) return { ...pago, estado: "pagado_con_inconsistencia", motivo: MOTIVOS.repetido };
      if (elegido.sociedadId !== v.sociedadId) return { ...pago, estado: "pagado_con_inconsistencia", motivo: MOTIVOS.otraSociedad };
      return { ...pago, estado: "pagado", motivo: MOTIVOS.pagado };
    }
    // el aviso es el del responsable efectivo de la obligación (si tiene el suyo) o el general
    const aviso = e.avisoPorObligacion?.get(v.obligacionId) ?? e.diasAviso;
    if (hoyDia < f - aviso) return { ...base, estado: "proyectado", motivo: null };
    if (hoyDia <= f) return { ...base, estado: "por_vencer", motivo: null };
    // pasó el día de pago pero dentro de los días de espera: se espera el pago, sigue «Por vencer»
    const espera = e.esperaPorObligacion?.get(v.obligacionId) ?? e.diasEspera ?? 0;
    if (hoyDia <= f + espera) return { ...base, estado: "por_vencer", motivo: MOTIVOS.esperaPago };
    const finRango = new Date(v.fecha.getTime() + e.diasDespues * MS_DIA);
    // solo se exige cobertura hasta ayer (o hasta el fin del rango si ya pasó): lo de hoy en adelante todavía no puede estar en un estado de cuenta
    const ayer = new Date(e.hoy.getTime() - MS_DIA);
    const limite = finRango < ayer ? finRango : ayer;
    // el rango de búsqueda empieza días antes de la fecha de pago: ahí también tiene que haber estados de cuenta
    const inicioRango = new Date(v.fecha.getTime() - e.diasAntes * MS_DIA);
    const cobertura = coberturaDeSociedad(e.cuentas.get(v.sociedadId) ?? [], inicioRango, limite, e.hoy);
    if (cobertura.cubre) return { ...base, estado: "vencido", motivo: hoyDia <= f + e.diasDespues ? MOTIVOS.vencidoBuscando : MOTIVOS.vencido };
    // un estado de cuenta cuyo saldo no cuadra no cuenta como cobertura: nunca Vencido, ni siquiera con el parámetro encendido
    if (noCuadraEnRango(e.cuentas.get(v.sociedadId) ?? [], inicioRango, limite)) return { ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacionSaldo, sinInfoHasta: cobertura.hasta };
    // un archivo cuyos movimientos vienen como imagen no se puede leer: tampoco cuenta como cobertura ni se vuelve Vencido
    if (sinLecturaEnRango(e.cuentas.get(v.sociedadId) ?? [], inicioRango, limite)) return { ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacionImagen, sinInfoHasta: cobertura.hasta };
    // con el parámetro encendido se muestra Vencido, pero conserva la fecha de corte y la nota de que nadie lo confirmó
    if (e.marcarVencidoSinEstado) return { ...base, estado: "vencido", motivo: MOTIVOS.vencidoSinEstado, sinInfoHasta: cobertura.hasta };
    if (cobertura.antesDe) return { ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacionDesde, sinInfoHasta: null };
    return { ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacion, sinInfoHasta: cobertura.hasta };
  };
  const resultados = e.vencimientos.map((v): ResultadoCruce => {
    const r = calcular(v);
    return justificados.size > 0 && (r.estado === "vencido" || r.estado === "sin_informacion") && justificados.has(`${v.obligacionId}|${periodoDe(v)}`)
      ? { ...r, estado: "justificado", motivo: MOTIVOS.justificado, sinInfoHasta: null }
      : r;
  });
  return { resultados, estadisticas: est };
}
