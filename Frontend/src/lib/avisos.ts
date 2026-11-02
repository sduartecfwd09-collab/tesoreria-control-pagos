// Avisos emergentes (toasts) sin React: cualquier módulo puede publicar y el proveedor de la pantalla se suscribe.

export type TipoAviso = "exito" | "error" | "informacion";

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
  /** true: no se cierra solo (por ejemplo «Actualizando…» hasta que termine el trabajo) */
  fijo: boolean;
}

export interface OpcionesAviso {
  fijo?: boolean;
}

type Oyente = (avisos: Aviso[]) => void;

/** Cantidad máxima de avisos visibles a la vez. */
export const MAXIMO_AVISOS = 3;

let avisos: Aviso[] = [];
let siguiente = 1;
const oyentes = new Set<Oyente>();

function emitir() {
  for (const o of oyentes) o(avisos);
}

/** Muestra un aviso y devuelve su id. Si ya hay uno visible del mismo tipo y texto, no lo repite y devuelve el existente. */
export function publicar(tipo: TipoAviso, texto: string, opciones: OpcionesAviso = {}): number {
  const repetido = avisos.find((a) => a.tipo === tipo && a.texto === texto);
  if (repetido) return repetido.id;
  const aviso: Aviso = { id: siguiente++, tipo, texto, fijo: opciones.fijo === true };
  const lista = [...avisos, aviso];
  while (lista.length > MAXIMO_AVISOS) {
    // Se descarta el más antiguo que no sea error; si todos son errores, el más antiguo.
    const i = lista.findIndex((a) => a.tipo !== "error" && a.id !== aviso.id);
    lista.splice(i >= 0 ? i : 0, 1);
  }
  avisos = lista;
  emitir();
  return aviso.id;
}

export function cerrar(id: number): void {
  if (!avisos.some((a) => a.id === id)) return;
  avisos = avisos.filter((a) => a.id !== id);
  emitir();
}

/** Cierra el aviso indicado y muestra otro en su lugar. */
export function reemplazar(id: number, tipo: TipoAviso, texto: string, opciones: OpcionesAviso = {}): number {
  cerrar(id);
  return publicar(tipo, texto, opciones);
}

export function suscribir(oyente: Oyente): () => void {
  oyentes.add(oyente);
  oyente(avisos);
  return () => {
    oyentes.delete(oyente);
  };
}

export const avisar = {
  exito: (texto: string, o?: OpcionesAviso) => publicar("exito", texto, o),
  error: (texto: string, o?: OpcionesAviso) => publicar("error", texto, o),
  informacion: (texto: string, o?: OpcionesAviso) => publicar("informacion", texto, o),
};
