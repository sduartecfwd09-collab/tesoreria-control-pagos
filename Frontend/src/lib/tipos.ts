// Contrato con el Backend (ver ../Backend/src/routes). Hoy se mantiene a mano;
// se propone generarlo desde OpenAPI cuando crezca la API.
export interface Parametro {
  id: number;
  clave: string;
  valor: string;
  tipo: "entero" | "texto";
  ambito: "global" | "categoria";
  categoria: string | null;
  etiqueta: string;
  ayuda: string;
  unidad: string | null;
  min: number | null;
  max: number | null;
  opciones: string[] | null;
  supuesto: boolean;
  actualizado: string;
}
