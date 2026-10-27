// Detalle de solo lectura de un vencimiento: datos, motivo del estado según el estado y los movimientos que lo explican.
// Todo se calcula con la base y el reloj inyectado; nada se guarda. Ninguna respuesta lleva rutas de archivo ni cuentas
// completas (solo los últimos 4), y los números largos de las descripciones salen enmascarados.
import { coberturaDeSociedad, corteMasReciente } from "../domain/cobertura-corte.js";
import { textoSinInformacion } from "../domain/cruce.js";
import { enmascararCuenta, enmascararNumerosLargos } from "../domain/enmascarar.js";
import { patronIdentificador } from "../domain/identificadores.js";
import { aNumero } from "../domain/montos.js";
import { responsableEfectivo } from "../domain/obligaciones.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { cargarCoberturaCuentas } from "../repositories/cruce.js";
import { valorGlobal } from "../repositories/parametros.js";
import { datosDeCuentas, debitosEnVentana, obtenerVencimientoDetalle } from "../repositories/vencimientos.js";

const MS_DIA = 86_400_000;
const iso = (f: Date) => f.toISOString().slice(0, 10);
const entero = async (clave: string, defecto: number) => {
  const n = Number(await valorGlobal(clave));
  return Number.isInteger(n) && n >= 0 ? n : defecto;
};

type MovimientoDetalle = NonNullable<Awaited<ReturnType<typeof obtenerVencimientoDetalle>>>["movimiento"];

const aMovimiento = (m: NonNullable<MovimientoDetalle>, delPago: boolean) => ({
  fecha: iso(m.fecha),
  monto: aNumero(m.debito),
  moneda: m.cuenta.moneda, // la de la cuenta; null = sin dato
  banco: m.cuenta.banco,
  cuenta: enmascararCuenta(m.cuenta.numero),
  sociedad: etiquetaSociedad(m.cuenta.sociedad),
  descripcion: m.descripcion === null ? null : enmascararNumerosLargos(m.descripcion),
  delPago,
});

export async function detalleDeVencimiento(id: number, reloj: Reloj) {
  const v = await obtenerVencimientoDetalle(id);
  if (!v) return null;
  const hoy = hoyDe(reloj);
  const diasAntes = await entero("ventana_dias_antes", 3);
  const diasDespues = await entero("ventana_dias_despues", 3);
  const desde = new Date(v.fecha.getTime() - diasAntes * MS_DIA);
  const hasta = new Date(v.fecha.getTime() + diasDespues * MS_DIA);

  // movimientos que explican el estado: el pago, o los débitos con el identificador dentro de la ventana
  let movimientos: ReturnType<typeof aMovimiento>[] = [];
  if (v.estado === "pagado" && v.movimiento) movimientos = [aMovimiento(v.movimiento, true)];
  else if (v.estado === "pagado_con_inconsistencia" || v.estado === "por_revisar") {
    const patron = patronIdentificador(v.obligacion.identificador);
    const candidatos = patron ? (await debitosEnVentana(desde, hasta)).filter((m) => patron.test((m.descripcion ?? "").toUpperCase())) : [];
    movimientos = candidatos.map((m) => aMovimiento(m, m.id === v.movimientoId));
  }

  // cobertura: hasta cuándo hay estados de la sociedad y qué cuentas no alcanzan a cubrir la ventana
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
        const r = coberturaDeSociedad([c], v.fecha, hasta, hoy);
        const d = info.get(c.cuentaId);
        return r.cubre || !d ? [] : [{ cuenta: enmascararCuenta(d.numero), banco: d.banco, hasta: r.hasta ? iso(r.hasta) : null }];
      }),
    };
  }

  return {
    id: v.id,
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
    textoEstado: v.estado === "sin_informacion" ? textoSinInformacion(v.fecha, v.sinInfoHasta) : v.motivo,
    diferenciaDias: v.diferenciaDias,
    sinInfoHasta: v.sinInfoHasta ? iso(v.sinInfoHasta) : null,
    responsableEfectivo: responsableEfectivo(v.obligacion).nombre,
    ventana: { desde: iso(desde), hasta: iso(hasta), diasAntes, diasDespues },
    cobertura,
    movimientos,
  };
}
