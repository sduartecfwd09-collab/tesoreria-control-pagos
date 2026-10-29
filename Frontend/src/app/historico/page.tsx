import { Historico } from "@/components/pagos/Historico";

export default function PaginaHistorico() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">Histórico</h1>
      <p className="mt-2 max-w-3xl text-suave">Vencimientos anteriores y el pago encontrado para cada uno.</p>
      <Historico />
    </>
  );
}
