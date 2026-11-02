import { PanelAvisos } from "@/components/pagos/PanelAvisos";

export default function PaginaAvisos() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold">Avisos</h1>
      <p className="mt-2 max-w-3xl text-suave">Los pagos que requieren atención, agrupados por situación.</p>
      <PanelAvisos />
    </>
  );
}
