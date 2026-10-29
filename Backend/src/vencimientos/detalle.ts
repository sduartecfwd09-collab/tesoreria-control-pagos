// Detalle de solo lectura de un vencimiento: datos, el porqué del estado (en lenguaje de tesorería, con datos reales) y los
// movimientos que lo explican. Todo se calcula con la base y el reloj inyectado; nada se guarda. Ninguna respuesta lleva
// rutas de archivo ni cuentas completas (solo los últimos 4); en las descripciones solo se ve completo el número que es el
// identificador de la obligación y los demás números de 8 o más dígitos salen enmascarados.
import { nombresEnDescripcion } from "../config/alias-proveedores.js";
import { MOTIVOS } from "../domain/cruce.js";
import { coberturaDeSociedad, corteMasReciente, inicioDeDatos } from "../domain/cobertura-corte.js";
import { enmascararCuenta, enmascararSalvo } from "../domain/enmascarar.js";
import { identificadorClave, patronIdentificador } from "../domain/identificadores.js";
import { aNumero } from "../domain/montos.js";
import { responsableEfectivo } from "../domain/obligaciones.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { normalizar } from "../ingest/utiles.js";
import { preferenciasPorObligacion } from "../repositories/cruce.js";
import { TEXTO_SALDO_NO_CUADRA, textoEstadoLista, textoFaltanEstados, textoSinEstadosAnteriores, textosDePago, type MovimientoTexto, type ObligacionGrupoTexto } from "../domain/textos-pago.js";
import { cargarCoberturaCuentas } from "../repositories/cruce.js";
import { valorGlobal } from "../repositories/parametros.js";
import { contarCuentasConArchivoSoloImagen } from "../repositories/consultas.js";
import { asignadosAOtraObligacion, datosDeCuentas, debitosEnVentana, movimientosAsignados, obtenerVencimientoDetalle, vencimientosDeSociedadEnPeriodo } from "../repositories/vencimientos.js";
import { diasDeAviso } from "./generar.js";

const MS_DIA = 86_400_000;
const iso = (f: Date) => f.toISOString().slice(0, 10);
const dia = (f: Date) => Math.floor(f.getTime() / MS_DIA);
const plano = (t: string) => normalizar(t).replace(/\s+/g, "");
const entero = async (clave: string, defecto: number) => {
  const n = Number(await valorGlobal(clave));
  return Number.isInteger(n) && n >= 0 ? n : defecto;
};

export async function detalleDeVencimiento(id: number, reloj: Reloj) {
  const v = await obtenerVencimientoDetalle(id);
  if (!v) return null;
  const hoy = hoyDe(reloj);
  const diasAntes = await entero("ventana_dias_antes", 10);
  const diasDespues = await entero("ventana_dias_despues", 12);
  const desde = new Date(v.fecha.getTime() - diasAntes * MS_DIA);
  const hasta = new Date(v.fecha.getTime() + diasDespues * MS_DIA);
  const clave = identificadorClave(v.obligacion.identificador);

  // El grupo: las obligaciones de esta sociedad con el mismo número de servicio y su vencimiento de este mes.
  const delMes = await vencimientosDeSociedadEnPeriodo(v.sociedadId, v.periodo);
  const hermanos = delMes.filter((x) => identificadorClave(x.obligacion.identificador) === clave);
  const grupo: ObligacionGrupoTexto[] = hermanos.map((x) => ({ proveedor: x.proveedor, categoria: x.categoria.nombre, diaPago: x.dia, estado: x.estado }));

  // Movimientos que explican el estado: el pago, o los débitos con el número de servicio dentro de las fechas del grupo del mes.
  let movimientos: (MovimientoTexto & { delPago: boolean })[] = [];
  const aMovimiento = (m: NonNullable<typeof v.movimiento>, delPago: boolean): MovimientoTexto & { delPago: boolean } => {
    const texto = plano(m.descripcion ?? "");
    const ventanasDe = (h: (typeof hermanos)[number]) => dia(m.fecha) >= dia(h.fecha) - diasAntes && dia(m.fecha) <= dia(h.fecha) + diasDespues;
    return {
      fecha: iso(m.fecha),
      monto: aNumero(m.debito),
      moneda: m.cuenta.moneda, // la de la cuenta; null = sin dato
      banco: m.cuenta.banco,
      cuenta: enmascararCuenta(m.cuenta.numero),
      sociedad: etiquetaSociedad(m.cuenta.sociedad),
      descripcion: m.descripcion === null ? null : enmascararSalvo(m.descripcion, clave),
      delPago,
      porNombre: [...new Set(hermanos.filter((h) => nombresEnDescripcion(h.proveedor).some((n) => texto.includes(n))).map((h) => h.proveedor))],
      porFecha: [...new Set(hermanos.filter(ventanasDe).map((h) => h.proveedor))],
    };
  };
  if (v.estado === "pagado" && v.movimiento) movimientos = [aMovimiento(v.movimiento, true)];
  else if (v.estado === "pagado_con_inconsistencia" || v.estado === "por_revisar") {
    const patron = patronIdentificador(v.obligacion.identificador);
    const fechas = hermanos.length > 0 ? hermanos.map((h) => h.fecha) : [v.fecha];
    const desdeGrupo = new Date(Math.min(...fechas.map((f) => f.getTime())) - diasAntes * MS_DIA);
    const hastaGrupo = new Date(Math.max(...fechas.map((f) => f.getTime())) + diasDespues * MS_DIA);
    const candidatos = patron ? (await debitosEnVentana(desdeGrupo, hastaGrupo)).filter((m) => patron.test((m.descripcion ?? "").toUpperCase())) : [];
    movimientos = candidatos.map((m) => aMovimiento(m, m.id === v.movimientoId));
  }

  // Cobertura: hasta cuándo hay estados de la sociedad y qué cuentas no alcanzan a cubrir la fecha de pago.
  let cobertura: { estadosHasta: string | null; cuentas: number; cuentasSinCobertura: { cuenta: string; banco: string | null; hasta: string | null }[] } | null = null;
  if (v.estado === "vencido" || v.estado === "sin_informacion") {
    const cuentas = (await cargarCoberturaCuentas()).get(v.sociedadId) ?? [];
    const info = new Map((await datosDeCuentas(cuentas.map((c) => c.cuentaId))).map((c) => [c.id, c]));
    const cortes = cuentas.map((c) => corteMasReciente(c, hoy));
    const estadosHasta = cuentas.length === 0 || cortes.some((c) => c === null) ? null : (cortes as Date[]).reduce((m, c) => (c < m ? c : m));
    cobertura = {
      estadosHasta: estadosHasta ? iso(estadosHasta) : null,
      cuentas: cuentas.length,
      cuentasSinCobertura: cuentas.flatMap((c) => {
        const r = coberturaDeSociedad([c], desde, hasta, hoy);
        const d = info.get(c.cuentaId);
        return r.cubre || !d ? [] : [{ cuenta: enmascararCuenta(d.numero), banco: d.banco, hasta: r.hasta ? iso(r.hasta) : null }];
      }),
    };
  }

  // Con «Vencido»: el pago más cercano con este mismo número fuera del rango, si lo hay y no es de otro vencimiento (hasta 60 días).
  let pagoCercano: { fecha: string; dias: number; margen: number } | null = null;
  let asignadoAOtro: { fecha: string; proveedor: string; monto: number; moneda: string | null } | null = null;
  if (v.estado === "vencido") {
    const patron = patronIdentificador(v.obligacion.identificador);
    if (patron) {
      const cercanos = (await debitosEnVentana(new Date(v.fecha.getTime() - 60 * MS_DIA), new Date(v.fecha.getTime() + 60 * MS_DIA)))
        .filter((m) => etiquetaSociedad(m.cuenta.sociedad) === etiquetaSociedad(v.sociedad) && patron.test((m.descripcion ?? "").toUpperCase()));
      // el pago con este número puede estar asignado a otra obligación (mismo número usado por dos servicios)
      const deOtro = await asignadosAOtraObligacion(cercanos.map((m) => m.id), v.obligacionId);
      const delOtro = cercanos.filter((m) => deOtro.has(m.id)).sort((a, b) => Math.abs(dia(a.fecha) - dia(v.fecha)) - Math.abs(dia(b.fecha) - dia(v.fecha)) || dia(a.fecha) - dia(b.fecha))[0];
      if (delOtro) asignadoAOtro = { fecha: iso(delOtro.fecha), proveedor: deOtro.get(delOtro.id)!, monto: aNumero(delOtro.debito), moneda: delOtro.cuenta.moneda };
      const asignados = await movimientosAsignados(cercanos.map((m) => m.id));
      const libres = cercanos.filter((m) => !asignados.has(m.id) && (dia(m.fecha) < dia(desde) || dia(m.fecha) > dia(hasta)));
      const mejor = libres.sort((a, b) => Math.abs(dia(a.fecha) - dia(v.fecha)) - Math.abs(dia(b.fecha) - dia(v.fecha)) || dia(a.fecha) - dia(b.fecha))[0];
      if (mejor) {
        const diferencia = dia(mejor.fecha) - dia(v.fecha);
        pagoCercano = { fecha: iso(mejor.fecha), dias: diferencia, margen: diferencia > 0 ? diasDespues : diasAntes };
      }
    }
  }
  const datosDesde = v.estado === "sin_informacion" ? inicioDeDatos((await cargarCoberturaCuentas()).get(v.sociedadId) ?? []) : null;

  const dias = Math.round((v.fecha.getTime() - hoy.getTime()) / MS_DIA);
  const diasAviso = (await preferenciasPorObligacion()).aviso.get(v.obligacionId) ?? (await diasDeAviso()); // el del responsable de la obligación o el general
  const textos = textosDePago({
    estado: v.estado, motivo: v.motivo, fecha: iso(v.fecha), dias, diasAviso, diferenciaDias: v.diferenciaDias,
    ventana: { desde: iso(desde), hasta: iso(hasta) },
    cobertura: cobertura && { estadosHasta: cobertura.estadosHasta, cuentas: cobertura.cuentas, sinCobertura: cobertura.cuentasSinCobertura },
    proveedor: v.proveedor, periodo: v.periodo, asignadoAOtro,
    movimientos, grupo, pagoCercano, datosDesde: datosDesde ? iso(datosDesde) : null,
  });
  // Un Vencido o un Sin información puede depender de cuentas que solo trajeron una imagen: se avisa en la ficha.
  if (v.estado === "vencido" || v.estado === "sin_informacion") {
    const soloImagen = await contarCuentasConArchivoSoloImagen(v.sociedadId, v.periodo);
    if (soloImagen > 0) {
      textos.parrafos.push(soloImagen === 1
        ? "Hay 1 cuenta de esta sociedad con un archivo solo con imagen, que se tomó como cuenta sin movimientos."
        : `Hay ${soloImagen} cuentas de esta sociedad con un archivo solo con imagen, que se tomaron como cuentas sin movimientos.`);
    }
  }

  return {
    id: v.id,
    obligacionId: v.obligacionId,
    proveedor: v.proveedor,
    categoria: v.categoria.nombre,
    identificador: v.obligacion.identificador,
    sociedad: etiquetaSociedad(v.sociedad),
    periodo: v.periodo,
    fecha: iso(v.fecha),
    fechaOriginal: iso(v.fechaOriginal ?? v.fecha), // si no se movió, la original es la vigente
    movida: v.fechaOriginal !== null,
    estado: v.estado,
    motivo: v.motivo,
    textoEstado: v.estado === "sin_informacion" ? (v.motivo === MOTIVOS.sinInformacionSaldo ? TEXTO_SALDO_NO_CUADRA : v.motivo === MOTIVOS.sinInformacionDesde ? textoSinEstadosAnteriores(datosDesde ? iso(datosDesde) : null) : textoFaltanEstados(v.sinInfoHasta ? iso(v.sinInfoHasta) : null)) : textoEstadoLista({ estado: v.estado, motivo: v.motivo, dias, fecha: iso(v.fecha), fechaHasta: iso(hasta) }),
    textos,
    diferenciaDias: v.diferenciaDias,
    sinInfoHasta: v.sinInfoHasta ? iso(v.sinInfoHasta) : null,
    responsableEfectivo: responsableEfectivo(v.obligacion).nombre,
    ventana: { desde: iso(desde), hasta: iso(hasta), diasAntes, diasDespues },
    cobertura,
    grupo: grupo.length > 1 ? grupo : [],
    movimientos,
  };
}
