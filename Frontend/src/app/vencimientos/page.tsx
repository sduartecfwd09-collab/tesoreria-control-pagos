import { PanelVencimientos } from "@/components/vencimientos/PanelVencimientos";

export default function Vencimientos() {
  return (
    <>
      <h1 className="text-2xl font-bold">Vencimientos</h1>
      <p className="mt-2 text-suave max-w-3xl">
        Fechas en que se espera cada pago, calculadas a partir de las obligaciones activas (día de pago y frecuencia). Si el día no existe en el mes, se usa el
        último día. No se mueven por fines de semana ni feriados: la ventana de cruce lo absorbe.
      </p>
      <PanelVencimientos />
    </>
  );
}
