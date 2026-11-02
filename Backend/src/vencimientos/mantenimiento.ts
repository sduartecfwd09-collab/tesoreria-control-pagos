// Mantenimiento automático del calendario y del cruce: se ejecuta al crear o editar una obligación, después de cada
// importación, al arrancar el servidor y una vez al día. Las ejecuciones se encolan para no pisarse.
import { relojSistema, type Reloj } from "../domain/reloj.js";
import { cruzarVencimientos } from "./cruce.js";
import { sincronizarVencimientos, type ResumenSincronizacion } from "./generar.js";

let cola: Promise<unknown> = Promise.resolve();

/** Sincroniza el calendario (todas las obligaciones o solo una) y recalcula el cruce completo. */
export function actualizarVencimientos(reloj: Reloj, obligacionId?: number): Promise<{ calendario: ResumenSincronizacion; cambiados: number }> {
  const tarea = cola.then(async () => {
    const calendario = await sincronizarVencimientos(reloj, obligacionId);
    const { cambiados } = await cruzarVencimientos(reloj);
    return { calendario, cambiados };
  });
  cola = tarea.catch(() => undefined); // un fallo no frena las ejecuciones siguientes
  return tarea;
}

const CADA_HORA = 60 * 60 * 1000;

/** Arranca el mantenimiento: una vez ahora y luego una vez al día (se revisa cada hora si ya cambió la fecha). */
export function programarMantenimiento(registrar: (mensaje: string) => void, reloj: Reloj = relojSistema): () => void {
  let ultimoDia = "";
  const correr = async () => {
    const dia = reloj().toDateString();
    if (dia === ultimoDia) return;
    try {
      const r = await actualizarVencimientos(reloj);
      ultimoDia = dia;
      registrar(`mantenimiento de vencimientos: ${r.calendario.creados} creados, ${r.cambiados} con estado nuevo`);
    } catch {
      registrar("mantenimiento de vencimientos: falló (se reintenta en una hora)");
    }
  };
  void correr();
  const temporizador = setInterval(() => void correr(), CADA_HORA);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
