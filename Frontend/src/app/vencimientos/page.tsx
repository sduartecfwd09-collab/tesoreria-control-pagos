import { PanelVencimientos } from "@/components/vencimientos/PanelVencimientos";

export default function Vencimientos() {
  return (
    <>
      <h1 className="text-2xl font-bold">Vencimientos</h1>
      <p className="mt-2 text-suave max-w-3xl">
        Fechas de pago de cada obligación activa y su estado, según los estados de cuenta cargados. Se muestra el mes elegido y siempre los pendientes de meses anteriores.
      </p>
      <PanelVencimientos />
    </>
  );
}
