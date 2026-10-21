import { Proximamente } from "@/components/Proximamente";

export default function Tablero() {
  return (
    <Proximamente
      titulo="Tablero"
      hito={6}
      descripcion="Vista general del mes: cuántos vencimientos están por vencer, vencidos, pagados o con inconsistencias, por sociedad y categoría, con la proyección de los próximos meses."
    />
  );
}
