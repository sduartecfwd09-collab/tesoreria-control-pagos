import Link from "next/link";

/** Pantalla de reemplazo para las pestañas que llegan en hitos posteriores (en lugar de un error). */
export function Proximamente({ titulo, hito, descripcion }: { titulo: string; hito: number; descripcion: string }) {
  return (
    <>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <div className="mt-6 max-w-2xl rounded border border-divisor bg-fondo-suave p-6">
        <p>
          <span className="inline-block rounded bg-ambar-fondo text-ambar-texto px-2 py-0.5 text-xs font-medium">Próximamente</span>
          <span className="ml-2 text-sm text-suave">Llega en el Hito {hito}</span>
        </p>
        <p className="mt-3">{descripcion}</p>
        <p className="mt-4 text-sm text-suave">
          Mientras tanto puede revisar las{" "}
          <Link href="/obligaciones" className="underline font-medium text-texto">
            obligaciones
          </Link>
          , los{" "}
          <Link href="/vencimientos" className="underline font-medium text-texto">
            vencimientos
          </Link>{" "}
          y los{" "}
          <Link href="/archivos" className="underline font-medium text-texto">
            archivos importados
          </Link>
          .
        </p>
      </div>
    </>
  );
}
