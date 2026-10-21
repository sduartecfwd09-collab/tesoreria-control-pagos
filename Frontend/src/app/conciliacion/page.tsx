import { Proximamente } from "@/components/Proximamente";

export default function Conciliacion() {
  return (
    <Proximamente
      titulo="Conciliación"
      hito={4}
      descripcion="Cruce automático de cada vencimiento con los pagos de los estados de cuenta (dentro de la ventana de días configurada), con revisión manual de los casos dudosos."
    />
  );
}
