// Enmascarado de datos sensibles en las respuestas de la API. El servidor sigue usando los valores completos
// (por ejemplo, para cruzar pagos); solo la respuesta los oculta. Funciones puras.
import type { Cobertura } from "./cobertura.js";

/** Número de cuenta o IBAN: solo se ven los últimos 4 caracteres. */
export function enmascararCuenta(cuenta: string): string {
  return cuenta.length <= 4 ? cuenta : `****${cuenta.slice(-4)}`;
}

/** Cualquier secuencia de 8 o más dígitos queda enmascarada con sus últimos 4: «CR91010710102200000001» -> «CR****0001». */
export function enmascararNumerosLargos(texto: string): string {
  return texto.replace(/\d{8,}/g, (n) => `****${n.slice(-4)}`);
}

/** Solo el nombre del archivo (sin carpetas ni rutas) y con los números largos enmascarados. */
export function nombreDeArchivoSeguro(ruta: string): string {
  return enmascararNumerosLargos(ruta.split(/[\\/]/).pop() ?? "");
}

/** Texto de un mensaje de estado o de error: nunca muestra un número largo ni una ruta de archivo. */
export function textoSeguro(texto: string | null): string | null {
  return texto === null ? null : enmascararNumerosLargos(texto);
}

export type CoberturaSegura = Omit<Cobertura, "sinUbicar"> & { sinUbicar: { archivo: string; error: string | null }[] };

/** Cobertura para la respuesta: cuentas enmascaradas, archivos solo por nombre y mensajes sin números largos. */
export function coberturaSegura(c: Cobertura): CoberturaSegura {
  return {
    meses: c.meses,
    filas: c.filas.map((f) => ({
      ...f,
      cuenta: enmascararCuenta(f.cuenta),
      celdas: Object.fromEntries(
        Object.entries(f.celdas).map(([mes, celda]) => [
          mes,
          { ...celda, ...(celda.archivo !== undefined ? { archivo: nombreDeArchivoSeguro(celda.archivo) } : {}), ...(celda.error !== undefined ? { error: textoSeguro(celda.error) } : {}) },
        ]),
      ),
    })),
    sinUbicar: c.sinUbicar.map((s) => ({ archivo: nombreDeArchivoSeguro(s.ruta), error: textoSeguro(s.error) })),
  };
}

/**
 * Como `enmascararNumerosLargos`, pero deja completo el número que es el identificador de la obligación (el que coincide
 * con él, con o sin ceros a la izquierda): es el dato que la persona necesita para reconocer el pago.
 */
export function enmascararSalvo(texto: string, identificadorClave: string): string {
  return texto.replace(/\d{8,}/g, (n) => (n.replace(/^0+/, "") === identificadorClave ? n : `****${n.slice(-4)}`));
}

/** Identificador de un servicio (NISE, número de contrato...): nunca completo; solo los últimos 4 caracteres, como «****1083». */
export function enmascararIdentificador(identificador: string): string {
  return identificador.length <= 4 ? "****" : `****${identificador.slice(-4)}`;
}
