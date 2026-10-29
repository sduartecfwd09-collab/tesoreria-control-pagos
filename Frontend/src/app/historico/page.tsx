import { Historico } from "@/components/pagos/Historico";

export default function PaginaHistorico() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">Histórico</h1>
      <p className="mt-2 max-w-3xl text-suave">
        Los pagos de las obligaciones del catálogo por su fecha de vencimiento, con el pago que se encontró en los estados de cuenta, del más reciente al más antiguo.
        No incluye los movimientos del banco sin obligación.
      </p>
      <Historico />
    </>
  );
}
