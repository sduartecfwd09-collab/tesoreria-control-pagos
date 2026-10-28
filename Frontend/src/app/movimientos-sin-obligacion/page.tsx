import { PanelMovimientosSinObligacion } from "@/components/pagos/PanelMovimientosSinObligacion";

export default function PaginaMovimientosSinObligacion() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">Movimientos sin obligación</h1>
      <p className="mt-2 max-w-3xl text-suave">{'Pagos con la forma "Pago: PROVEEDOR número" cuyo número no está en el catálogo.'}</p>
      <PanelMovimientosSinObligacion />
    </>
  );
}
