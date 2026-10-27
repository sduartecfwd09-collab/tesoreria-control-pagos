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
import { nombresEnDescripcion } from "../config/alias-proveedores.js";
import { normalizar } from "../ingest/utiles.js";
import { coberturaDeSociedad, type CuentaCorte } from "./cobertura-corte.js";
import { identificadorClave, patronIdentificador } from "./identificadores.js";

export type EstadoCruce = "proyectado" | "por_vencer" | "vencido" | "pagado" | "pagado_con_inconsistencia" | "sin_informacion" | "por_revisar";

export const MOTIVOS = {
  pagado: "Pago encontrado en una cuenta de la sociedad",
  otraSociedad: "Pagado por otra sociedad",
  repetido: "Pago repetido",
  empate: "El pago podría corresponder a dos meses distintos de este servicio",
  compartido: "No se pudo saber con certeza a cuál servicio corresponde el pago: el número de servicio está en varias obligaciones",
  vencido: "Pasó la fecha de pago y no hay pago en los estados de cuenta",
  sinInformacion: "Faltan estados de cuenta para confirmar si hubo pago",
  sinInformacionDesde: "No hay estados de cuenta anteriores a la primera fecha cargada: el pago pudo hacerse antes",
  vencidoSinEstado: "Pasó la fecha de pago; sin estado de cuenta que lo confirme",
} as const;

export interface ObligacionCruce { id: number; sociedadId: number; proveedor: string; identificador: string }
export interface VencimientoCruce { id: number; obligacionId: number; sociedadId: number; fecha: Date; /** AAAA-MM; si falta se toma de la fecha */ periodo?: string }
export interface MovimientoCruce { id: number; sociedadId: number; fecha: Date; descripcion: string | null }

export interface EntradaCruce {
  /** solo obligaciones activas */
  obligaciones: ObligacionCruce[];
  vencimientos: VencimientoCruce[];
  /** solo débitos de archivos que no están retirados */
  movimientos: MovimientoCruce[];
  /** cuentas conocidas por sociedad */
  cuentas: Map<number, CuentaCorte[]>;
  diasAntes: number;
  diasDespues: number;
  diasAviso: number;
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
  for (const m of e.movimientos) {
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
  const resultados = e.vencimientos.map((v): ResultadoCruce => {
    const base = { vencimientoId: v.id, movimientoId: null, diferenciaDias: null, sinInfoHasta: null };
    const f = diaDe(v.fecha);
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
    if (hoyDia < f - e.diasAviso) return { ...base, estado: "proyectado", motivo: null };
    if (hoyDia <= f) return { ...base, estado: "por_vencer", motivo: null };
    const limite = new Date(v.fecha.getTime() + e.diasDespues * MS_DIA);
    // el rango de búsqueda empieza días antes de la fecha de pago: ahí también tiene que haber estados de cuenta
    const inicioRango = new Date(v.fecha.getTime() - e.diasAntes * MS_DIA);
    const cobertura = coberturaDeSociedad(e.cuentas.get(v.sociedadId) ?? [], inicioRango, limite, e.hoy);
    if (cobertura.cubre) return { ...base, estado: "vencido", motivo: MOTIVOS.vencido };
    // con el parámetro encendido se muestra Vencido, pero conserva la fecha de corte y la nota de que nadie lo confirmó
    if (e.marcarVencidoSinEstado) return { ...base, estado: "vencido", motivo: MOTIVOS.vencidoSinEstado, sinInfoHasta: cobertura.hasta };
    if (cobertura.antesDe) return { ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacionDesde, sinInfoHasta: null };
    return { ...base, estado: "sin_informacion", motivo: MOTIVOS.sinInformacion, sinInfoHasta: cobertura.hasta };
  });
  return { resultados, estadisticas: est };
}
