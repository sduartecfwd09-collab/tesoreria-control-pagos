// Medida y posición de las imágenes pegadas en cada hoja de un libro (solo geometría: nunca se lee ni se interpreta una imagen).
// Sirve para distinguir un logo del banco en una esquina de una captura grande. Lee únicamente el XML de los dibujos.
import JSZip from "jszip";

/** Dónde está pegada una imagen, tal como la guarda Excel (celdas de inicio y fin, o medidas en EMU). */
export interface ImagenAncla {
  desdeCol: number;
  desdeFila: number;
  hastaCol: number | null;
  hastaFila: number | null;
  /** ancho y alto en EMU cuando la imagen no tiene celda final */
  anchoEmu: number | null;
  altoEmu: number | null;
}

/** La misma imagen medida contra su hoja, en porcentajes (0 a 100): tamaño y posición relativos. */
export interface ImagenRelativa {
  /** porcentaje del área de la hoja que cubre */
  areaPct: number;
  colInicioPct: number;
  colFinPct: number;
  filaInicioPct: number;
  filaFinPct: number;
}

// Medidas por defecto de Excel: columna de 64 px (609 600 EMU) y fila de 15 pt (190 500 EMU).
const EMU_COLUMNA = 609_600;
const EMU_FILA = 190_500;

const numero = (xml: string, etiqueta: string): number | null => {
  const m = new RegExp(`<(?:\\w+:)?${etiqueta}>\\s*(-?\\d+)\\s*</(?:\\w+:)?${etiqueta}>`).exec(xml);
  return m ? Number(m[1]) : null;
};
const atributo = (xml: string, etiqueta: string, nombre: string): number | null => {
  const m = new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*\\b${nombre}="(-?\\d+)"`).exec(xml);
  return m ? Number(m[1]) : null;
};
const bloque = (xml: string, etiqueta: string): string | null => {
  const m = new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${etiqueta}>`).exec(xml);
  return m ? m[1]! : null;
};

/** Las imágenes (no otros dibujos) de un XML de dibujo. */
export function anclasDeDibujo(xml: string): ImagenAncla[] {
  const salida: ImagenAncla[] = [];
  const anclajes = xml.matchAll(/<(?:\w+:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/g);
  for (const a of anclajes) {
    const tipo = a[1]!;
    const cuerpo = a[2]!;
    if (!/<(?:\w+:)?pic\b/.test(cuerpo)) continue; // solo imágenes
    const desde = bloque(cuerpo, "from");
    const hasta = bloque(cuerpo, "to");
    if (tipo === "absoluteAnchor") {
      const x = atributo(cuerpo, "pos", "x") ?? 0;
      const y = atributo(cuerpo, "pos", "y") ?? 0;
      salida.push({ desdeCol: Math.floor(x / EMU_COLUMNA), desdeFila: Math.floor(y / EMU_FILA), hastaCol: null, hastaFila: null, anchoEmu: atributo(cuerpo, "ext", "cx"), altoEmu: atributo(cuerpo, "ext", "cy") });
      continue;
    }
    if (!desde) continue;
    const desdeCol = numero(desde, "col") ?? 0;
    const desdeFila = numero(desde, "row") ?? 0;
    if (tipo === "twoCellAnchor" && hasta) {
      salida.push({ desdeCol, desdeFila, hastaCol: numero(hasta, "col") ?? desdeCol, hastaFila: numero(hasta, "row") ?? desdeFila, anchoEmu: null, altoEmu: null });
    } else {
      salida.push({ desdeCol, desdeFila, hastaCol: null, hastaFila: null, anchoEmu: atributo(cuerpo, "ext", "cx"), altoEmu: atributo(cuerpo, "ext", "cy") });
    }
  }
  return salida;
}

const sinEscapes = (t: string) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Las imágenes de cada hoja, por nombre de hoja. Si algo no se puede leer, esa hoja queda sin imágenes (nunca falla la importación). */
export async function medirImagenes(buffer: Buffer): Promise<Map<string, ImagenAncla[]>> {
  const porHoja = new Map<string, ImagenAncla[]>();
  try {
    const zip = await JSZip.loadAsync(buffer);
    const texto = async (ruta: string) => (await zip.file(ruta)?.async("string")) ?? null;
    const libro = await texto("xl/workbook.xml");
    const relLibro = await texto("xl/_rels/workbook.xml.rels");
    if (!libro || !relLibro) return porHoja;
    const destinoDe = new Map<string, string>();
    for (const m of relLibro.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
      const destino = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
      if (id && destino) destinoDe.set(id, destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`);
    }
    for (const m of libro.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
      const nombre = /\bname="([^"]*)"/.exec(m[0])?.[1];
      const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
      const hoja = rid ? destinoDe.get(rid) : undefined;
      if (!nombre || !hoja) continue;
      const nombreArchivo = hoja.split("/").pop()!;
      const relHoja = await texto(`${hoja.slice(0, hoja.length - nombreArchivo.length)}_rels/${nombreArchivo}.rels`);
      if (!relHoja) continue;
      const anclas: ImagenAncla[] = [];
      for (const r of relHoja.matchAll(/<Relationship\b[^>]*>/g)) {
        if (!/\/drawing"/.test(r[0])) continue;
        const destino = /\bTarget="([^"]+)"/.exec(r[0])?.[1];
        if (!destino) continue;
        const ruta = destino.startsWith("/") ? destino.slice(1) : destino.startsWith("../") ? `xl/${destino.slice(3)}` : `xl/worksheets/${destino}`;
        const dibujo = await texto(ruta);
        if (dibujo) anclas.push(...anclasDeDibujo(dibujo));
      }
      if (anclas.length > 0) porHoja.set(sinEscapes(nombre), anclas);
    }
  } catch {
    // un libro raro no impide importar: sin medidas
  }
  return porHoja;
}

/** Mide una imagen contra su hoja (columnas y filas con contenido). */
export function medirRelativo(a: ImagenAncla, columnasHoja: number, filasHoja: number): ImagenRelativa {
  const columnasQueOcupa = a.hastaCol !== null ? a.hastaCol - a.desdeCol + 1 : Math.max(1, Math.ceil((a.anchoEmu ?? EMU_COLUMNA) / EMU_COLUMNA));
  const filasQueOcupa = a.hastaFila !== null ? a.hastaFila - a.desdeFila + 1 : Math.max(1, Math.ceil((a.altoEmu ?? EMU_FILA) / EMU_FILA));
  const columnas = Math.max(columnasHoja, a.desdeCol + columnasQueOcupa, 1);
  const filas = Math.max(filasHoja, a.desdeFila + filasQueOcupa, 1);
  const pct = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
  return {
    areaPct: pct(((columnasQueOcupa * filasQueOcupa) / (columnas * filas)) * 100),
    colInicioPct: pct((a.desdeCol / columnas) * 100),
    colFinPct: pct(((a.desdeCol + columnasQueOcupa) / columnas) * 100),
    filaInicioPct: pct((a.desdeFila / filas) * 100),
    filaFinPct: pct(((a.desdeFila + filasQueOcupa) / filas) * 100),
  };
}
