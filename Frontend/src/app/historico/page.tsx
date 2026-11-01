import { TituloPantalla } from "@/components/estilo-tabla";
import { Historico } from "@/components/pagos/Historico";

export default function PaginaHistorico() {
  return (
    <>
      <TituloPantalla>Histórico</TituloPantalla>
      <p className="mt-2 max-w-3xl text-suave">Vencimientos anteriores y el pago encontrado para cada uno.</p>
      <Historico />
    </>
  );
}
