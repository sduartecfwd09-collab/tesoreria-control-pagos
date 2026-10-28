import { PanelConfiguracion } from "@/components/PanelConfiguracion";

export default function Configuracion() {
  return (
    <>
      <h1 className="text-2xl font-bold">Mi configuración</h1>
      <p className="mt-2 text-suave max-w-2xl">
        Aquí ajusta cuándo quiere que el sistema le avise y cuánto espera antes de marcar un pago como Vencido. Estos valores son suyos: no cambian lo que ven otras personas.
      </p>
      <PanelConfiguracion />
    </>
  );
}
