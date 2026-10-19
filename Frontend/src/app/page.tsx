import { redirect } from "next/navigation";

// Mientras el Tablero no exista (Hito 6), la única pantalla disponible es Configuración.
export default function Inicio() {
  redirect("/configuracion");
}
