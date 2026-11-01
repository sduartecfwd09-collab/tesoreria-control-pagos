import { TituloPantalla } from "@/components/estilo-tabla";
import { HistorialCambios } from "@/components/historial/HistorialCambios";

export default function PaginaHistorialCambios() {
  return (
    <>
      <TituloPantalla>Historial de cambios</TituloPantalla>
      <p className="mt-2 max-w-3xl text-suave">Quién cambió cada dato de las obligaciones y cuándo.</p>
      <HistorialCambios />
    </>
  );
}
