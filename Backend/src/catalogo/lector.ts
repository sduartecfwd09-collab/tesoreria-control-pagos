// Lector de la tabla de pagos frecuentes (catálogo de obligaciones). Función pura: no toca la base.
// Ninguna fila se descarta en silencio: cada problema queda en `problemas` con su número de fila.
// Los mensajes no incluyen identificadores (solo número de fila y el texto del día, que no es sensible).
import type { Worksheet } from "exceljs";
import { ErrorLectura, type LibroLeido } from "../ingest/lector.js";
import { identificadorClave } from "../domain/identificadores.js";
import { normalizar, valorPlano } from "../ingest/utiles.js";

export interface FilaCatalogo {
  fila: number;
  sociedad: string; // código en mayúsculas (ZFL, GGDI, ...)
  categoria: string;
  proveedor: string;
  identificador: string; // texto: conserva ceros a la izquierda
  dia: number | null; // null = día inválido o vacío (la fila se importa igual y queda "Falta día")
  estado: string | null; // texto de la columna ESTADO; null = el archivo no tiene esa columna
}

export interface ProblemaFila {
  fila: number;
  motivo: string;
  importada: boolean; // false = la fila no se pudo importar
}

export interface VarianteNombre {
  campo: "proveedor" | "categoria";
  nombre: string; // forma que se usa
  variantes: string[]; // otras formas encontradas en el archivo
}

export interface CatalogoLeido {
  hoja: string;
  filaCabecera: number;
  filas: FilaCatalogo[];
  problemas: ProblemaFila[];
  variantes: VarianteNombre[];
}

type Columna = "sociedad" | "categoria" | "proveedor" | "identificador" | "dia";

// Cómo se reconoce cada columna en la cabecera (texto normalizado: minúsculas y sin tildes).
const CABECERA: Record<Columna, (t: string) => boolean> = {
  sociedad: (t) => t === "sociedad",
  categoria: (t) => t === "categoria",
  proveedor: (t) => t === "proveedor",
  identificador: (t) => t.includes("identificador") || t.includes("nise"),
  dia: (t) => t.includes("fecha de pago") || t.includes("dia de pago"),
};

// Columna opcional: si no existe, todas las filas se consideran activas.
const COLUMNA_ESTADO = (t: string) => t === "estado";

/** «INACTIVA» (sin importar mayúsculas ni tildes): la obligación se carga como inactiva y conserva su historial. */
export const estadoEsInactiva = (estado: string): boolean => normalizar(estado) === "inactiva";

/** Solo «ACTIVA» (sin importar mayúsculas ni tildes) es una obligación activa; cualquier otro valor (incluida una celda vacía) va a revisión. */
export const estadoEsActiva = (estado: string): boolean => normalizar(estado) === "activa";

const FILAS_BUSQUEDA_CABECERA = 20;

/** Espacios colapsados y recortados. */
export function limpiarTexto(v: unknown): string {
  const p = valorPlano(v);
  if (p === null || p instanceof Date) return "";
  return String(p).replace(/\s+/g, " ").trim();
}

/** Clave de comparación de nombres: sin tildes, minúsculas y espacios colapsados. */
export const claveNombre = (s: string) => normalizar(s);

/** "ELECTRICIDAD" o "electricidad" -> "Electricidad"; siglas cortas (CCSS) y nombres mixtos se respetan. */
export function formaCategoria(s: string): string {
  const t = limpiarTexto(s);
  const todoIgual = t === t.toUpperCase() || t === t.toLowerCase();
  if (!todoIgual || t.length <= 4) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Identificador como texto, sin espacios y en mayúsculas (un IBAN con espacios cuenta igual). */
export function limpiarIdentificador(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** "15 DIA", "15 días", "día 15", "15" o el número 15 -> 15. Fuera de 1..31 o ilegible -> null. */
export function parsearDia(v: unknown): number | null {
  const p = valorPlano(v);
  let n: number | null = null;
  if (typeof p === "number") n = p;
  else if (typeof p === "string") {
    const m = /^(?:dia\s*)?(\d{1,2})(?:\s*dias?)?$/.exec(normalizar(p));
    if (m) n = Number(m[1]);
  }
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

function buscarCabecera(ws: Worksheet): { fila: number; cols: Record<Columna, number>; estado: number | null } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, FILAS_BUSQUEDA_CABECERA); r++) {
    const cols: Partial<Record<Columna, number>> = {};
    let estado: number | null = null;
    ws.getRow(r).eachCell((celda, c) => {
      const t = normalizar(celda.value);
      for (const k of Object.keys(CABECERA) as Columna[]) if (cols[k] === undefined && CABECERA[k](t)) cols[k] = c;
      if (estado === null && COLUMNA_ESTADO(t)) estado = c;
    });
    if (Object.keys(CABECERA).every((k) => cols[k as Columna] !== undefined)) return { fila: r, cols: cols as Record<Columna, number>, estado };
  }
  return null;
}

export function leerCatalogo(libro: LibroLeido): CatalogoLeido {
  let ws: Worksheet | undefined;
  let cab: ReturnType<typeof buscarCabecera> = null;
  for (const h of libro.wb.worksheets) {
    cab = buscarCabecera(h);
    if (cab) { ws = h; break; }
  }
  if (!ws || !cab) {
    throw new ErrorLectura(
      "No se encontró la cabecera del catálogo (Sociedad, Categoría, Proveedor, NISE / Cuenta / Identificador, Última fecha de pago)",
    );
  }

  const filas: FilaCatalogo[] = [];
  const problemas: ProblemaFila[] = [];
  // clave normalizada -> forma elegida (la primera que aparece) y demás formas vistas
  const nombres = { proveedor: new Map<string, Set<string>>(), categoria: new Map<string, Set<string>>() };
  const vistas = new Map<string, number>(); // sociedad|proveedor|identificador -> fila

  const unificar = (campo: "proveedor" | "categoria", forma: string) => {
    const k = claveNombre(forma);
    const set = nombres[campo].get(k) ?? new Set<string>();
    set.add(forma);
    nombres[campo].set(k, set);
    return set.values().next().value as string;
  };

  for (let r = cab.fila + 1; r <= ws.rowCount; r++) {
    const fila = ws.getRow(r);
    const celda = (k: Columna) => fila.getCell(cab.cols[k]).value;
    const sociedad = limpiarTexto(celda("sociedad")).toUpperCase();
    const categoriaTxt = formaCategoria(limpiarTexto(celda("categoria")));
    const proveedorTxt = limpiarTexto(celda("proveedor"));
    const idCrudo = valorPlano(celda("identificador"));
    const identificador = limpiarIdentificador(limpiarTexto(idCrudo));
    const diaTxt = limpiarTexto(celda("dia"));
    const estado = cab.estado === null ? null : limpiarTexto(fila.getCell(cab.estado).value);
    if (!sociedad && !categoriaTxt && !proveedorTxt && !identificador && !diaTxt) continue; // fila vacía

    const faltan = [
      !sociedad && "sociedad",
      !categoriaTxt && "categoría",
      !proveedorTxt && "proveedor",
      !identificador && "identificador",
    ].filter(Boolean);
    if (faltan.length > 0) {
      problemas.push({ fila: r, motivo: `Falta ${faltan.join(", ")}: la fila no se importó`, importada: false });
      continue;
    }

    const categoria = unificar("categoria", categoriaTxt);
    const proveedor = unificar("proveedor", proveedorTxt);
    const clave = `${sociedad}|${claveNombre(proveedor)}|${identificadorClave(identificador)}`;
    const previa = vistas.get(clave);
    if (previa !== undefined) {
      problemas.push({ fila: r, motivo: `Repite la fila ${previa} (misma sociedad, proveedor e identificador): no se importó`, importada: false });
      continue;
    }
    vistas.set(clave, r);

    if (typeof idCrudo === "number") {
      problemas.push({ fila: r, motivo: "El identificador viene como número en Excel: verifique si perdió ceros a la izquierda", importada: true });
    }
    const dia = parsearDia(celda("dia"));
    if (dia === null) {
      problemas.push({
        fila: r,
        motivo: diaTxt
          ? `Día esperado de pago «${diaTxt}» no es un entero de 1 a 31: se importó sin día`
          : "Falta el día esperado de pago: se importó sin día",
        importada: true,
      });
    }
    filas.push({ fila: r, sociedad, categoria, proveedor, identificador, dia, estado });
  }

  const variantes: VarianteNombre[] = [];
  for (const campo of ["proveedor", "categoria"] as const) {
    for (const set of nombres[campo].values()) {
      const [nombre, ...otras] = [...set];
      if (otras.length > 0) variantes.push({ campo, nombre: nombre!, variantes: otras });
    }
  }
  return { hoja: ws.name, filaCabecera: cab.fila, filas, problemas, variantes };
}
