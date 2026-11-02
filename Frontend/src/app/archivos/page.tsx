import { PanelArchivos } from "@/components/PanelArchivos";

export default function Archivos() {
  return (
    <>
      <h1 className="text-2xl font-bold">Estados de cuenta</h1>
      <p className="mt-2 text-suave max-w-2xl">
        Estados de cuenta leídos desde la carpeta configurada: qué hay por sociedad, cuenta y mes, qué falta y qué archivos tuvieron problemas. Esta pantalla es
        solo de consulta.
      </p>
      <PanelArchivos />
    </>
  );
}
