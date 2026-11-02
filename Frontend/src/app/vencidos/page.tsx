import { Vencidos } from "@/components/pagos/Vencidos";

export default function PaginaVencidos() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">Vencidos</h1>
      <p className="mt-2 max-w-3xl text-suave">
        Pagos cuya fecha ya pasó y que no aparecen en los estados de cuenta cargados, de todos los meses, del más antiguo al más reciente.
      </p>
      <Vencidos />
    </>
  );
}
