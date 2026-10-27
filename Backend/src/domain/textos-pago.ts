// Textos del detalle de un pago, en lenguaje de tesorería: qué pasó, por qué y qué hacer, siempre con los datos reales
// (nombres, fechas, cuentas con últimos 4 y montos). Puros: reciben datos ya preparados y nunca muestran valores técnicos
// crudos; si falta un dato, la frase se acorta en vez de dejar un hueco.
import { MOTIVOS } from "./cruce.js";
import { fechaTexto, listaTexto, montoTexto, plural } from "./formato-texto.js";

export interface MovimientoTexto {
  fecha: string; // AAAA-MM-DD
  monto: number; // centavos
  moneda: string | null;
  banco: string | null;
  cuenta: string; // últimos 4
  sociedad: string;
  descripcion: string | null;
  /** proveedores del grupo que el movimiento nombra / cuya fecha de pago encaja con el movimiento */
  porNombre: string[];
  porFecha: string[];
}

export interface ObligacionGrupoTexto {
  proveedor: string;
  categoria: string;
  diaPago: number | null;
  /** estado de su vencimiento del mes (null si no tiene) */
  estado: string | null;
}

export interface DatosTexto {
  estado: string;
  motivo: string | null;
  fecha: string; // fecha vigente
  dias: number; // de hoy a la fecha vigente (negativo = ya pasó)
  diasAviso: number;
  diferenciaDias: number | null;
  ventana: { desde: string; hasta: string };
  cobertura: { estadosHasta: string | null; cuentas: number; sinCobertura: { cuenta: string; banco: string | null; hasta: string | null }[] } | null;
  movimientos: MovimientoTexto[];
  /** obligaciones de la misma sociedad que comparten el número de servicio (incluida esta) */
  grupo: ObligacionGrupoTexto[];
}

export interface TextosPago {
  /** la frase que resume el estado */
  resumen: string;
  /** el detalle, un párrafo por hecho */
  parrafos: string[];
  /** qué hacer; null si no hay nada que hacer */
  queHacer: string | null;
}

/** Cómo se llama cada estado en pantalla (una sola vez, para que tarjeta, tabla, detalle y avisos digan lo mismo). */
export const NOMBRE_ESTADO: Record<string, string> = {
  proyectado: "Programado",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  pagado: "Pagado",
  pagado_con_inconsistencia: "Pagado con inconsistencia",
  sin_informacion: "Sin información",
  por_revisar: "Por revisar",
};

const nombreEstado = (e: string | null) => (e === null ? "sin vencimiento este mes" : (NOMBRE_ESTADO[e] ?? "estado sin definir"));

/** «Banco Uno cuenta ****1111» (o solo la cuenta si no se sabe el banco). */
const cuentaTexto = (banco: string | null, cuenta: string) => (banco ? `${banco} cuenta ${cuenta}` : `cuenta ${cuenta}`);

function lineaMovimiento(m: MovimientoTexto): string {
  const donde = `${cuentaTexto(m.banco, m.cuenta)}, ${montoTexto(m.monto, m.moneda)}`;
  return m.descripcion
    ? `El ${fechaTexto(m.fecha)} el banco registró un pago que dice «${m.descripcion}» (${donde}).`
    : `El ${fechaTexto(m.fecha)} el banco registró un pago (${donde}).`;
}

function porQueNoSeSabe(m: MovimientoTexto): string | null {
  if (m.porNombre.length >= 2) return `El movimiento menciona a los dos proveedores: ${listaTexto(m.porNombre)}.`;
  if (m.porNombre.length === 0) return "El movimiento no dice el nombre del proveedor.";
  const nombre = m.porNombre[0]!;
  const distintos = m.porFecha.filter((p) => p !== nombre);
  if (distintos.length > 0) return `Coincide por nombre con ${nombre} y por fecha con ${listaTexto(distintos)}.`;
  return null;
}

function textoGrupo(g: ObligacionGrupoTexto[]): string | null {
  if (g.length < 2) return null;
  const una = (o: ObligacionGrupoTexto) => `${o.proveedor} (${[o.categoria, o.diaPago === null ? null : `día ${o.diaPago}`, nombreEstado(o.estado)].filter(Boolean).join(", ")})`;
  return `Ese número de servicio está en ${g.length} obligaciones de esta sociedad: ${listaTexto(g.map(una))}.`;
}

export function textosDePago(d: DatosTexto): TextosPago {
  const movs = d.movimientos.slice(0, 5);
  switch (d.estado) {
    case "por_revisar": {
      const compartido = d.motivo === MOTIVOS.compartido;
      const parrafos = movs.flatMap((m) => [lineaMovimiento(m), ...(compartido ? [porQueNoSeSabe(m)].filter((x): x is string => x !== null) : [])]);
      const grupo = compartido ? textoGrupo(d.grupo) : null;
      if (grupo) parrafos.push(grupo);
      if (!compartido && d.motivo !== MOTIVOS.empate && d.motivo) parrafos.push(d.motivo);
      return compartido || d.motivo === MOTIVOS.empate
        ? {
            resumen: compartido ? "No se pudo saber con certeza a cuál servicio corresponde este pago." : "El pago podría corresponder a dos meses distintos de este servicio.",
            parrafos,
            queHacer: compartido ? "Qué hacer: confirmar con quien paga cuál es el servicio correcto." : "Qué hacer: confirmar con quien paga a qué mes corresponde el pago.",
          }
        : { resumen: "Hay que verificar este pago.", parrafos, queHacer: "Qué hacer: confirmar con quien paga." };
    }
    case "vencido": {
      const c = d.cobertura;
      const donde = c && c.cuentas > 0 ? ` en ${c.cuentas === 1 ? "la cuenta" : `las ${c.cuentas} cuentas`} de la sociedad` : "";
      const parrafos = [`Se buscó del ${fechaTexto(d.ventana.desde)} al ${fechaTexto(d.ventana.hasta)}${donde} y no hay un pago con este número de servicio.`];
      if (c) parrafos.push(c.estadosHasta ? `Hay estados de cuenta cargados hasta el ${fechaTexto(c.estadosHasta)}.` : "Todavía no hay estados de cuenta cargados de esta sociedad.");
      if (d.motivo === MOTIVOS.vencidoSinEstado) parrafos.push("Se muestra como vencido aunque ningún estado de cuenta lo confirma.");
      return { resumen: "No se encontró el pago.", parrafos, queHacer: "Qué hacer: confirmar con quien paga si el pago se hizo." };
    }
    case "sin_informacion": {
      const c = d.cobertura;
      const cuentas = (c?.sinCobertura ?? []).map((x) => `${x.banco ? `${x.banco} ` : ""}${x.cuenta}${x.hasta ? ` desde el ${fechaTexto(sumarDia(x.hasta))}` : ""}`);
      const faltan = cuentas.length > 0 ? `Faltan los estados de cuenta de ${listaTexto(cuentas)}.` : c && c.cuentas === 0 ? "No hay estados de cuenta cargados de esta sociedad." : "Faltan los estados de cuenta posteriores.";
      const parrafos = [faltan];
      parrafos.push(`La fecha de pago era el ${fechaTexto(d.fecha)}.`);
      if (c?.estadosHasta) parrafos.push(`Hay estados de cuenta cargados hasta el ${fechaTexto(c.estadosHasta)}.`);
      return { resumen: "Todavía no se puede saber si se pagó.", parrafos, queHacer: "Qué hacer: cargar los estados de cuenta que faltan." };
    }
    case "pagado": {
      const parrafos = movs.map(lineaMovimiento);
      if (d.diferenciaDias !== null && d.diferenciaDias !== 0) parrafos.push(`Se pagó ${plural(Math.abs(d.diferenciaDias), "día", "días")} ${d.diferenciaDias > 0 ? "después" : "antes"} de la fecha de pago.`);
      return { resumen: "El pago aparece en el estado de cuenta.", parrafos, queHacer: null };
    }
    case "pagado_con_inconsistencia": {
      const otra = d.motivo === MOTIVOS.otraSociedad;
      const parrafos = movs.map((m) => (otra ? `${lineaMovimiento(m).replace(/\.$/, "")}, de la cuenta de ${m.sociedad}.` : lineaMovimiento(m)));
      return {
        resumen: otra ? "Se pagó, pero desde una cuenta de otra sociedad." : "Se pagó más de una vez.",
        parrafos,
        queHacer: otra ? "Qué hacer: confirmar con quien paga que el pago se hizo desde la cuenta correcta." : "Qué hacer: confirmar con quien paga cuál de los pagos es el correcto.",
      };
    }
    case "por_vencer":
      return {
        resumen: d.dias === 0 ? "Vence hoy." : `Vence en ${plural(Math.max(d.dias, 0), "día", "días")}.`,
        parrafos: [`La fecha de pago es el ${fechaTexto(d.fecha)}. Está dentro de los ${plural(d.diasAviso, "día", "días")} de aviso.`],
        queHacer: "Qué hacer: preparar el pago.",
      };
    case "proyectado":
      return {
        resumen: "Todavía falta tiempo para pagar.",
        parrafos: [`La fecha de pago es el ${fechaTexto(d.fecha)}${d.dias > 0 ? `, dentro de ${plural(d.dias, "día", "días")}` : ""}. Se avisa ${plural(d.diasAviso, "día", "días")} antes.`],
        queHacer: null,
      };
    default:
      return { resumen: "Estado sin definir.", parrafos: [], queHacer: null };
  }
}

function sumarDia(f: string): string {
  return new Date(new Date(`${f}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** Texto corto de «Sin información» para la lista y las tarjetas: la misma idea que el detalle. */
export function textoFaltanEstados(sinInfoHasta: string | null): string {
  return sinInfoHasta ? `Faltan estados de cuenta desde el ${fechaTexto(sumarDia(sinInfoHasta))}` : "Faltan estados de cuenta de este período";
}

/** Recuadro «Datos desactualizados»: una línea por sociedad. */
export function textoDatosDesactualizados(sociedad: string, corte: string | null): string {
  return corte ? `${sociedad}: los estados de cuenta llegan hasta el ${fechaTexto(corte)}; faltan los posteriores.` : `${sociedad}: no hay estados de cuenta cargados.`;
}
