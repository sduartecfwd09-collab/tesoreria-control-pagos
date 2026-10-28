import { textoEstadosCalculados } from "@/lib/formato";
import type { Alcance } from "@/lib/tipos";

/** Línea bajo el título que dice de quién son los datos que se ven; el alcance lo trae la respuesta del servidor. */
export function LineaAlcance({ alcance, detalle, estadosCalculadosEn }: { alcance: Alcance | undefined; detalle?: string; estadosCalculadosEn?: string | null }) {
  if (!alcance) return null;
  const texto = alcance.tipo === "mio" ? `Viendo: lo de ${alcance.nombre ?? "esta persona"}` : "Viendo: todo";
  return (
    <p className="mt-3 text-sm font-medium" aria-live="polite">
      {texto}
      {detalle && <span className="font-normal text-suave">. {detalle}</span>}
      {estadosCalculadosEn !== undefined && <span className="font-normal text-suave">. {textoEstadosCalculados(estadosCalculadosEn)}</span>}
    </p>
  );
}
