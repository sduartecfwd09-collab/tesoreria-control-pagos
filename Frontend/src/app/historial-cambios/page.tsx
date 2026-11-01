import { HistorialCambios } from "@/components/historial/HistorialCambios";

export default function PaginaHistorialCambios() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">Historial de cambios</h1>
      <p className="mt-2 max-w-3xl text-suave">Quién cambió cada dato de las obligaciones y cuándo.</p>
      <HistorialCambios />
    </>
  );
}
