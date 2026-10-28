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
  /** el pago con este número más cercano fuera del rango de búsqueda y que no es de otro vencimiento; dias = pago menos fecha de pago */
  pagoCercano?: { fecha: string; dias: number; margen: number } | null;
  /** primera fecha con estados de cuenta cargados de la sociedad (para «Sin información» por inicio de datos) */
  datosDesde?: string | null;
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
      const buscando = -d.dias <= diasEntreFechas(d.fecha, d.ventana.hasta); // hoy <= fecha de pago + días después
      const c = d.cobertura;
      const donde = c && c.cuentas > 0 ? ` en ${c.cuentas === 1 ? "la cuenta" : `las ${c.cuentas} cuentas`} de la sociedad` : "";
      const parrafos = [`No se encontró un pago entre el ${fechaTexto(d.ventana.desde)} y el ${fechaTexto(d.ventana.hasta)}${donde}.`];
      const p = d.pagoCercano;
      parrafos.push(
        p
          ? `Sí hay un pago con este número el ${fechaTexto(p.fecha)}, ${plural(Math.abs(p.dias), "día", "días")} ${p.dias > 0 ? "después" : "antes"} del día de pago; está fuera del margen de ${plural(p.margen, "día", "días")}.`
          : "Tampoco hay un pago con este número en las fechas cercanas dentro de los estados de cuenta cargados.",
      );
      if (c) parrafos.push(c.estadosHasta ? `Hay estados de cuenta cargados hasta el ${fechaTexto(c.estadosHasta)}.` : "Todavía no hay estados de cuenta cargados de esta sociedad.");
      if (d.motivo === MOTIVOS.vencidoSinEstado) parrafos.push("Se muestra como vencido aunque ningún estado de cuenta lo confirma.");
      const resumen = buscando && d.motivo !== MOTIVOS.vencidoSinEstado ? `El pago no aparece todavía; se sigue buscando hasta el ${fechaTexto(d.ventana.hasta)}.` : `No se encontró pago hasta el ${fechaTexto(d.ventana.hasta)}.`;
      return { resumen, parrafos, queHacer: p ? "Qué hacer: confirmar con quien paga si ese pago corresponde a este vencimiento." : "Qué hacer: confirmar con quien paga si el pago se hizo." };
    }
    case "sin_informacion": {
      if (d.motivo === MOTIVOS.sinInformacionDesde) {
        return {
          resumen: "Todavía no se puede saber si se pagó.",
          parrafos: [
            textoSinEstadosAnteriores(d.datosDesde ?? null) + ".",
            `Se buscaba un pago desde el ${fechaTexto(d.ventana.desde)}; la fecha de pago era el ${fechaTexto(d.fecha)}.`,
          ],
          queHacer: "Qué hacer: cargar los estados de cuenta anteriores a esa fecha.",
        };
      }
      if (d.motivo === MOTIVOS.sinInformacionSaldo) {
        return {
          resumen: "Todavía no se puede saber si se pagó.",
          parrafos: [
            "Un estado de cuenta de esta sociedad no cuadra con su saldo, así que no se usa para confirmar pagos.",
            `Se buscaba un pago entre el ${fechaTexto(d.ventana.desde)} y el ${fechaTexto(d.ventana.hasta)}; la fecha de pago era el ${fechaTexto(d.fecha)}.`,
          ],
          queHacer: "Qué hacer: revisar el estado de cuenta cuyo saldo no cuadra o cargar uno corregido.",
        };
      }
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
      if (d.diferenciaDias !== null && d.diferenciaDias !== 0) parrafos.push(`Se pagó ${plural(Math.abs(d.diferenciaDias), "día", "días")} ${d.diferenciaDias > 0 ? "después" : "antes"} del día habitual de pago.`);
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
      if (d.motivo === MOTIVOS.esperaPago) {
        return {
          resumen: textoEsperaPago(-d.dias),
          parrafos: [`La fecha de pago era el ${fechaTexto(d.fecha)}. Se sigue buscando el pago hasta el ${fechaTexto(d.ventana.hasta)}.`],
          queHacer: "Qué hacer: confirmar con quien paga si el pago ya se hizo.",
        };
      }
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

function diasEntreFechas(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/** «El día de pago pasó hace N días; se espera el pago.» */
export function textoEsperaPago(diasPasados: number): string {
  return `El día de pago pasó hace ${plural(Math.max(diasPasados, 0), "día", "días")}; se espera el pago.`;
}

/**
 * Texto corto del estado para la lista: la misma idea que el detalle. `dias` = de hoy a la fecha de pago (negativo = ya pasó);
 * `fechaHasta` = fecha de pago + días después (hasta cuándo se busca el pago).
 */
export function textoEstadoLista(d: { estado: string; motivo: string | null; dias: number; fecha: string; fechaHasta: string }): string | null {
  if (d.estado === "por_vencer" && d.motivo === MOTIVOS.esperaPago) return textoEsperaPago(-d.dias);
  if (d.estado === "vencido" && d.motivo !== MOTIVOS.vencidoSinEstado) {
    return -d.dias <= diasEntreFechas(d.fecha, d.fechaHasta)
      ? `El pago no aparece todavía; se sigue buscando hasta el ${fechaTexto(d.fechaHasta)}.`
      : `No se encontró pago hasta el ${fechaTexto(d.fechaHasta)}.`;
  }
  return d.motivo;
}

function sumarDia(f: string): string {
  return new Date(new Date(`${f}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** Texto corto de «Sin información» para la lista y las tarjetas: la misma idea que el detalle. */
export function textoFaltanEstados(sinInfoHasta: string | null): string {
  return sinInfoHasta ? `Faltan estados de cuenta desde el ${fechaTexto(sumarDia(sinInfoHasta))}` : "Faltan estados de cuenta de este período";
}

/** «Sin información» porque un estado de cuenta no cuadra con su saldo (texto corto de la lista). */
export const TEXTO_SALDO_NO_CUADRA = "Un estado de cuenta no cuadra con su saldo; no se usa para confirmar pagos";

/** «Sin información» porque el rango de búsqueda empieza antes de los primeros estados de cuenta cargados. */
export function textoSinEstadosAnteriores(primeraFecha: string | null): string {
  return primeraFecha ? `No hay estados de cuenta anteriores al ${fechaTexto(primeraFecha)}` : "No hay estados de cuenta de esas fechas";
}

/** Recuadro «Datos desactualizados»: una línea por sociedad. */
export function textoDatosDesactualizados(sociedad: string, corte: string | null): string {
  return corte ? `${sociedad}: los estados de cuenta llegan hasta el ${fechaTexto(corte)}; faltan los posteriores.` : `${sociedad}: no hay estados de cuenta cargados.`;
}
