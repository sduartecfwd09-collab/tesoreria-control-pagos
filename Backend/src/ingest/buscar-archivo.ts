// Búsqueda amigable de un archivo registrado por una parte de su nombre. Pura.
export interface ArchivoBuscable {
  id: number;
  /** ruta registrada, relativa a la carpeta de fuentes (con «/») */
  ruta: string;
}

/** El texto de búsqueda sin carpeta, sin extensión y en minúsculas. */
export function normalizarBusqueda(texto: string): string {
  const nombre = texto.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  return nombre.replace(/\.(xlsx|xls|csv)$/i, "").trim().toLowerCase();
}

/** Nombre registrado sin carpeta ni extensión y en minúsculas (lo que se compara). */
const nombreSinExtension = (ruta: string) => normalizarBusqueda(ruta);

/** Los archivos cuyo nombre CONTIENE el texto, sin importar mayúsculas, extensión ni carpeta. */
export function buscarArchivos<T extends ArchivoBuscable>(registrados: T[], texto: string): T[] {
  const t = normalizarBusqueda(texto);
  if (!t) return [];
  return registrados.filter((a) => nombreSinExtension(a.ruta).includes(t));
}

/** Lee `--id 12` o `--id=12` y el resto como texto de búsqueda. */
export function leerArgumentos(argv: string[]): { id: number | null; texto: string; idInvalido: boolean } {
  const resto: string[] = [];
  let id: number | null = null;
  let idInvalido = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const valor = a === "--id" ? argv[++i] : a.startsWith("--id=") ? a.slice(5) : undefined;
    if (a === "--id" || a.startsWith("--id=")) {
      const n = Number(valor);
      if (Number.isInteger(n) && n > 0) id = n;
      else idInvalido = true;
    } else resto.push(a);
  }
  return { id, texto: resto.join(" ").trim(), idInvalido };
}
