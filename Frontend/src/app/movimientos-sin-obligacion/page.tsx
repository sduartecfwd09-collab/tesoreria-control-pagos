import { TituloPantalla } from "@/components/estilo-tabla";
import { PanelMovimientosSinObligacion } from "@/components/pagos/PanelMovimientosSinObligacion";

export default function PaginaMovimientosSinObligacion() {
  return (
    <>
      <TituloPantalla>Movimientos sin obligación</TituloPantalla>
      <p className="mt-2 max-w-3xl text-suave">{'Pagos con la forma "Pago: PROVEEDOR número" cuyo número no está en el catálogo.'}</p>
      <PanelMovimientosSinObligacion />
    </>
  );
}
