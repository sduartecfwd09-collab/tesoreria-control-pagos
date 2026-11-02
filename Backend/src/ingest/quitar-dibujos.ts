import JSZip from "jszip";

/**
 * exceljs falla al abrir libros con un dibujo/imagen incrustado (error interno en `reconcile`).
 * Los dibujos no contienen datos, así que se genera, EN MEMORIA, una copia del libro sin ellos.
 * El archivo original no se toca.
 */
export async function quitarDibujos(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const nombre of Object.keys(zip.files)) {
    if (/^xl\/(drawings|media)\//.test(nombre)) zip.remove(nombre);
  }
  for (const nombre of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/_rels\/.+\.rels$/.test(nombre)) {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(nombre, xml.replace(/<Relationship\b[^>]*\/(?:drawing|image)"[^>]*\/>/g, "").replace(/<Relationship\b[^>]*Target="[^"]*drawings\/[^"]*"[^>]*\/>/g, ""));
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)) {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(nombre, xml.replace(/<drawing\b[^>]*\/>/g, ""));
    } else if (nombre === "[Content_Types].xml") {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(nombre, xml.replace(/<Override\b[^>]*PartName="\/xl\/drawings\/[^"]*"[^>]*\/>/g, ""));
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** ¿El libro trae imágenes? Solo mira los nombres de las partes del archivo (xl/media/): nunca lee ni interpreta una imagen. */
export async function tieneImagenes(buffer: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    return Object.keys(zip.files).some((nombre) => /^xl\/media\/.+/.test(nombre) && !zip.files[nombre]!.dir);
  } catch {
    return false;
  }
}
