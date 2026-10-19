import type { Worksheet } from "exceljs";
import { FORMATOS, especDe, type Campo, type EspecFormato, type FormatoId } from "./formatos.js";
import { normalizar } from "./utiles.js";

export interface Deteccion {
  formato: FormatoId;
  hoja: Worksheet;
  filaEncabezado: number;
  /** campo normalizado -> número de columna (la primera donde aparece la etiqueta: sirve con celdas combinadas) */
  columnas: Partial<Record<Campo, number>>;
}

const MAX_FILAS_BUSQUEDA = 80;

function etiquetasDeFila(hoja: Worksheet, fila: number): Map<string, number> {
  const mapa = new Map<string, number>();
  hoja.getRow(fila).eachCell({ includeEmpty: false }, (celda, col) => {
    const e = normalizar(celda.value);
    if (e && !mapa.has(e)) mapa.set(e, col);
  });
  return mapa;
}

function coincide(spec: EspecFormato, etiquetas: Map<string, number>): Partial<Record<Campo, number>> | null {
  const cols: Partial<Record<Campo, number>> = {};
  for (const [campo, aceptadas] of Object.entries(spec.columnas) as [Campo, string[]][]) {
    const hallada = aceptadas.find((a) => etiquetas.has(a));
    if (!hallada) return null;
    cols[campo] = etiquetas.get(hallada)!;
  }
  return cols;
}

/**
 * Busca, en cada hoja y dinámicamente, la fila de encabezado y el formato que le corresponde.
 * E3 y E6 comparten nombres de columna: se separan por el código de banco y, si no hay IBAN,
 * por el orden de las columnas (E3 trae Referencia antes de Descripción; E6, al revés).
 * Devuelve un mensaje de error (sin contenido de celdas) si no hay coincidencia o es inconsistente.
 */
export function detectarFormato(
  hojas: Worksheet[],
  codigoBanco: string | null,
): { ok: true; deteccion: Deteccion } | { ok: false; error: string } {
  for (const hoja of hojas) {
    const limite = Math.min(hoja.rowCount, MAX_FILAS_BUSQUEDA);
    for (let fila = 1; fila <= limite; fila++) {
      const etiquetas = etiquetasDeFila(hoja, fila);
      if (!etiquetas.has("fecha")) continue;
      const candidatos = FORMATOS.map((s) => ({ spec: s, cols: coincide(s, etiquetas) })).filter((c) => c.cols);
      if (candidatos.length === 0) continue;

      let elegido = candidatos[0]!;
      if (candidatos.length > 1) {
        const porBanco = codigoBanco ? candidatos.filter((c) => c.spec.banco === codigoBanco) : [];
        if (porBanco.length === 1) elegido = porBanco[0]!;
        else if (candidatos.some((c) => c.spec.id === "E3") && candidatos.some((c) => c.spec.id === "E6")) {
          const e3 = candidatos.find((c) => c.spec.id === "E3")!;
          const e6 = candidatos.find((c) => c.spec.id === "E6")!;
          elegido = e3.cols!.referencia! < e3.cols!.descripcion! ? e3 : e6;
        } else {
          return { ok: false, error: `Encabezado ambiguo (${candidatos.map((c) => c.spec.id).join("/")})` };
        }
      }
      if (codigoBanco && especDe(elegido.spec.id).banco !== codigoBanco) {
        return {
          ok: false,
          error: `El formato detectado ${elegido.spec.id} no corresponde al banco ${codigoBanco} del nombre del archivo`,
        };
      }
      return { ok: true, deteccion: { formato: elegido.spec.id, hoja, filaEncabezado: fila, columnas: elegido.cols! } };
    }
  }
  return { ok: false, error: "Formato no reconocido: no se encontró una fila de encabezado válida" };
}
