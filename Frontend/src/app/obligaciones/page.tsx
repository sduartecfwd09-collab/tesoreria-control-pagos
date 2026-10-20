import { PanelObligaciones } from "@/components/obligaciones/PanelObligaciones";

export default function Obligaciones() {
  return (
    <>
      <h1 className="text-2xl font-bold">Obligaciones</h1>
      <p className="mt-2 text-suave max-w-3xl">
        Catálogo de pagos frecuentes (electricidad, telecomunicaciones, CCSS…) por sociedad. Cada obligación indica qué día se espera el pago y cada cuánto; con
        eso se generan los vencimientos. Use «Editar» para completar o corregir datos. Nada se borra: lo que ya no se paga se desactiva.
      </p>
      <PanelObligaciones />
    </>
  );
}
