import type { FastifyInstance } from "fastify";
import { ESTADOS_DE_AVISOS, GRUPOS_AVISO, grupoDeAviso, identificadorEnmascarado, type ClaveGrupoAviso } from "../domain/avisos.js";
import { inicioDeDatos } from "../domain/cobertura-corte.js";
import { MOTIVOS } from "../domain/cruce.js";
import { responsableEfectivo } from "../domain/obligaciones.js";
import { hoyDe, type Reloj } from "../domain/reloj.js";
import { etiquetaSociedad } from "../domain/sociedades.js";
import { TEXTO_SALDO_NO_CUADRA, textoEstadoLista, textoFaltanEstados, textoSinEstadosAnteriores } from "../domain/textos-pago.js";
import { alcanceDe, alcanceParaRespuesta, obligacionesDelAlcance } from "../identidad/alcance.js";
import { usuarioActual } from "../identidad/usuario-actual.js";
import { cargarCoberturaCuentas } from "../repositories/cruce.js";
import { ultimoCalculoDeEstados, valorGlobal } from "../repositories/parametros.js";
import { vencimientosParaAvisos } from "../repositories/vencimientos.js";
import { diasDeAviso } from "../vencimientos/generar.js";

// Solo lectura: lista los vencimientos que requieren atención tal como los dejó el motor de cruce (no recalcula estados).
// Un tesorero ve lo de sus obligaciones (el responsable propio o, si no tiene, el tesorero de la sociedad); Jefatura ve todo.
// Sin persona elegida (todavía no hay inicio de sesión) se muestra todo, igual que el resto de las pantallas.
const MS_DIA = 86_400_000;
const iso = (f: Date) => f.toISOString().slice(0, 10);

export async function rutasAvisos(app: FastifyInstance, opts: { reloj: Reloj; modoPruebas: boolean }) {
  app.get("/api/avisos", async (req) => {
    const hoy = hoyDe(opts.reloj);
    const alcance = await alcanceDe(req, opts.modoPruebas);
    const persona = await usuarioActual(req, opts.modoPruebas);
    const ids = await obligacionesDelAlcance(alcance);
    const general = await diasDeAviso();
    const nDespues = Number(await valorGlobal("ventana_dias_despues"));
    const diasDespues = Number.isInteger(nDespues) && nDespues >= 0 ? nDespues : 12;
    const todos = await vencimientosParaAvisos(ESTADOS_DE_AVISOS);
    const vencimientos = ids ? todos.filter((v) => ids.includes(v.obligacionId)) : todos;
    const datosDesde = new Map<number, string | null>();
    if (vencimientos.some((v) => v.estado === "sin_informacion" && v.motivo === MOTIVOS.sinInformacionDesde)) {
      for (const [id, cuentas] of await cargarCoberturaCuentas()) datosDesde.set(id, inicioDeDatos(cuentas)?.toISOString().slice(0, 10) ?? null);
    }
    const filas = new Map<ClaveGrupoAviso, unknown[]>(GRUPOS_AVISO.map((g) => [g.clave, []]));
    for (const v of vencimientos) {
      const clave = grupoDeAviso(v.estado);
      if (!clave) continue;
      const fecha = iso(v.fecha);
      const dias = Math.round((v.fecha.getTime() - hoy.getTime()) / MS_DIA);
      const textoEstado =
        v.estado === "sin_informacion"
          ? v.motivo === MOTIVOS.sinInformacionSaldo
            ? TEXTO_SALDO_NO_CUADRA
            : v.motivo === MOTIVOS.sinInformacionDesde
              ? textoSinEstadosAnteriores(datosDesde.get(v.sociedadId) ?? null)
              : textoFaltanEstados(v.sinInfoHasta ? iso(v.sinInfoHasta) : null)
          : textoEstadoLista({ estado: v.estado, motivo: v.motivo, dias, fecha, fechaHasta: iso(new Date(v.fecha.getTime() + diasDespues * MS_DIA)) });
      filas.get(clave)!.push({
        id: v.id,
        sociedad: etiquetaSociedad(v.sociedad),
        proveedor: v.proveedor,
        identificador: identificadorEnmascarado(v.obligacion.identificador),
        periodo: v.periodo,
        fecha,
        estado: v.estado,
        textoEstado,
        dias,
        responsableEfectivo: responsableEfectivo({ responsable: v.obligacion.responsable, sociedad: { tesorero: v.sociedad.tesorero } }).nombre,
      });
    }
    const grupos = GRUPOS_AVISO.map((g) => ({ clave: g.clave, titulo: g.titulo, total: filas.get(g.clave)!.length, filas: filas.get(g.clave)! }));
    return {
      alcance: alcanceParaRespuesta(alcance),
      usuario: persona ? { nombre: persona.nombre, rol: persona.rol } : null,
      diasAviso: (alcance.tipo === "mio" ? persona?.diasAviso : null) ?? general,
      hoy: iso(hoy),
      estadosCalculadosEn: await ultimoCalculoDeEstados(),
      total: grupos.reduce((s, g) => s + g.total, 0),
      grupos,
    };
  });
}
