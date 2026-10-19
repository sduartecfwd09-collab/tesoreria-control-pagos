import { PanelConfiguracion } from "@/components/PanelConfiguracion";

export default function Configuracion() {
  return (
    <>
      <h1 className="text-2xl font-bold">Configuración</h1>
      <p className="mt-2 text-suave max-w-2xl">
        Aquí se ajustan las reglas que usa el sistema para cruzar pagos y avisar vencimientos. Cada cambio se guarda
        con el botón <strong>Guardar</strong> de su fila y se aplica de inmediato.
      </p>
      <PanelConfiguracion />
    </>
  );
}
