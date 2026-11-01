"use client";
import type { EstadoVencimiento, FiltroObligaciones, ResumenCatalogo } from "@/lib/tipos";
import { EtiquetaEstado, IconoEstado } from "../pagos/EstadoPago";
import { ACENTO_ESTADO, Tarjeta } from "../pagos/TarjetaEstado";

type Falta = NonNullable<FiltroObligaciones["falta"]>;

export function ResumenCalidad({
  r, faltaActiva, alFiltrarFalta,
}: {
  r: ResumenCatalogo;
  faltaActiva?: Falta;
  alFiltrarFalta: (f: Falta) => void;
}) {
  // Cada tarjeta toma un estado que ya existe (color, ícono y borde) con un texto propio:
  // «Por revisar» para lo que pide una decisión y «Programado» (neutral) para totales, datos opcionales y contadores en cero.
  const pide = (n: number): { estado: EstadoVencimiento; texto: string } =>
    n > 0 ? { estado: "por_revisar", texto: "Requiere decisión" } : { estado: "proyectado", texto: "Completo" };
  const tarjetas: { falta?: Falta; titulo: string; n: number; ayuda: string; estado: EstadoVencimiento; texto: string }[] = [
    { titulo: "Obligaciones activas", n: r.activas, ayuda: r.inactivas ? `${r.inactivas} inactivas` : "ninguna inactiva", estado: "proyectado", texto: "Total" },
    { falta: "monto", titulo: "Falta monto", n: r.sinMonto, ayuda: "dato opcional", estado: "proyectado", texto: "Dato opcional" },
    // solo Jefatura: el servidor no envía este conteo a un tesorero
    ...(r.sinResponsable !== undefined ? [{ falta: "responsable" as const, titulo: "Sin responsable", n: r.sinResponsable, ayuda: "su sociedad no tiene tesorero", ...pide(r.sinResponsable) }] : []),
    ...(r.sinDia > 0 ? [{ falta: "dia" as const, titulo: "Falta día", n: r.sinDia, ayuda: "no generan vencimientos", ...pide(r.sinDia) }] : []),
  ];

  return (
    <section aria-labelledby="h-calidad" className="mt-6">
      <h2 id="h-calidad" className="text-lg font-bold border-b-2 border-acento pb-1">Calidad del catálogo</h2>
      <p className="mt-2 text-sm text-suave max-w-3xl">
        Toque una tarjeta para ver solo esas obligaciones; vuelva a tocarla para quitar el filtro. Nada de esto bloquea el trabajo: se completa editando cada obligación.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {tarjetas.map((t) => {
          const activa = !!t.falta && t.falta === faltaActiva;
          const sinNada = t.n === 0 && !activa;
          return (
            <li key={t.titulo}>
              <Tarjeta
                titulo={t.titulo}
                acento={ACENTO_ESTADO[t.estado]}
                icono={<IconoEstado estado={t.estado} />}
                insignia={<EtiquetaEstado estado={t.estado} texto={t.texto} />}
                detalle={t.ayuda}
                filtro={t.falta ? { activa, alTocar: () => alFiltrarFalta(t.falta!), desactivada: sinNada } : undefined}
              >
                {t.n.toLocaleString("es-CR")}
              </Tarjeta>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
