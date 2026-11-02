import { DiferenciasExcel } from "@/components/diferencias/DiferenciasExcel";
import { TituloPantalla } from "@/components/estilo-tabla";

export default function PaginaDiferenciasExcel() {
  return (
    <>
      <TituloPantalla>Diferencias con el Excel</TituloPantalla>
      <p className="mt-2 max-w-3xl text-suave">Lo que la tabla de pagos frecuentes dice y la plataforma no tiene igual. Nada se cambia solo: usted decide.</p>
      <DiferenciasExcel />
    </>
  );
}
