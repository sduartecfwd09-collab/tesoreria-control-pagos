"use client";
import type { EstadoVencimiento, FiltroObligaciones, ResumenCatalogo } from "@/lib/tipos";
import { claseBotonSecundario } from "../ui";
import { EtiquetaEstado, IconoEstado } from "../pagos/EstadoPago";
import { ACENTO_ESTADO, Tarjeta } from "../pagos/TarjetaEstado";

type Falta = NonNullable<FiltroObligaciones["falta"]>;

export function ResumenCalidad({
  r, faltaActiva, alFiltrarFalta, alBuscar,
}: {
  r: ResumenCatalogo;
  faltaActiva?: Falta;
  alFiltrarFalta: (f: Falta) => void;
  alBuscar: (sociedad: string, texto: string) => void;
}) {
  // Cada tarjeta toma un estado que ya existe (color, ícono y borde) con un texto propio:
  // «Por revisar» para lo que pide una decisión y «Programado» (neutral) para totales, datos opcionales y contadores en cero.
  const pide = (n: number): { estado: EstadoVencimiento; texto: string } =>
    n > 0 ? { estado: "por_revisar", texto: "Requiere decisión" } : { estado: "proyectado", texto: "Completo" };
  const tarjetas: { falta?: Falta; titulo: string; n: number; ayuda: string; estado: EstadoVencimiento; texto: string }[] = [
    { titulo: "Obligaciones activas", n: r.activas, ayuda: r.inactivas ? `${r.inactivas} inactivas` : "ninguna inactiva", estado: "proyectado", texto: "Total" },
    { falta: "monto", titulo: "Falta monto", n: r.sinMonto, ayuda: "dato opcional", estado: "proyectado", texto: "Dato opcional" },
    { falta: "cuenta", titulo: "Falta cuenta de pago", n: r.sinCuenta, ayuda: "cuenta donde se espera el pago", ...pide(r.sinCuenta) },
    { falta: "responsable", titulo: "Sin responsable", n: r.sinResponsable, ayuda: "ni propio ni del tesorero", ...pide(r.sinResponsable) },
    ...(r.sinDia > 0 ? [{ falta: "dia" as const, titulo: "Falta día", n: r.sinDia, ayuda: "no generan vencimientos", ...pide(r.sinDia) }] : []),
  ];
  const fuera = r.sociedadesSinEstadosNiObligaciones;
  // las sociedades sin estados de cuenta ni obligaciones cuentan como una sola línea resumen
  const pendientes = r.identificadoresRepetidos.length + r.formatoIban.length + r.sociedadesSinObligaciones.length + (r.frecuenciaPorConfirmar > 0 ? 1 : 0) + (fuera.length > 0 ? 1 : 0);

  return (
    <section aria-labelledby="h-calidad" className="mt-6">
      <h2 id="h-calidad" className="text-lg font-bold border-b-2 border-acento pb-1">Calidad del catálogo</h2>
      <p className="mt-2 text-sm text-suave max-w-3xl">
        Pulse «Ver estas» en una tarjeta para ver solo esas obligaciones. Nada de esto bloquea el trabajo: se completa editando cada obligación.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {tarjetas.map((t) => {
          const activa = !!t.falta && t.falta === faltaActiva;
          const sinNada = t.n === 0 && !activa;
          return (
            <li key={t.titulo} className={`rounded-[14px] ${activa ? "ring-2 ring-control ring-offset-2" : ""}`}>
              <Tarjeta
                titulo={t.titulo}
                acento={ACENTO_ESTADO[t.estado]}
                icono={<IconoEstado estado={t.estado} />}
                insignia={<EtiquetaEstado estado={t.estado} texto={t.texto} />}
                detalle={t.ayuda}
                pie={
                  t.falta ? (
                    <button
                      type="button"
                      onClick={() => alFiltrarFalta(t.falta!)}
                      disabled={sinNada}
                      aria-pressed={activa}
                      aria-label={`${activa ? "Mostrando estas" : "Ver estas"}: ${t.titulo}`}
                      className="self-start rounded border-2 border-control px-3 py-1 text-xs font-bold hover:bg-fondo-suave disabled:cursor-not-allowed disabled:border-divisor disabled:text-suave disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      {activa ? "Mostrando estas" : "Ver estas"}
                    </button>
                  ) : undefined
                }
              >
                {t.n.toLocaleString("es-CR")}
              </Tarjeta>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 rounded border border-divisor p-4">
        <h3 className="font-bold">
          Pendientes con Tesorería <span className="font-normal text-suave">({pendientes})</span>
        </h3>
        {pendientes === 0 ? (
          <p className="mt-2 text-sm">No hay pendientes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-divisor text-sm">
            {r.identificadoresRepetidos.map((g) => (
              <li key={`${g.sociedad}-${g.identificador}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>Identificador repetido</strong> en {g.sociedad}: <span className="font-mono">{g.identificador}</span>. El mismo identificador aparece con otro proveedor ({g.proveedores.join(", ")}). Verifique cuál es el correcto.
                </span>
                <button type="button" className={`${claseBotonSecundario} py-1 text-sm`} onClick={() => alBuscar(g.sociedad, g.identificador)}>
                  Ver
                </button>
              </li>
            ))}
            {r.formatoIban.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>Identificador con formato de IBAN</strong> en {o.sociedad} ({o.proveedor}): parece una cuenta bancaria y no un número de servicio. Verifique cuál es el correcto.
                </span>
                <button type="button" className={`${claseBotonSecundario} py-1 text-sm`} onClick={() => alBuscar(o.sociedad, o.identificador)}>
                  Ver
                </button>
              </li>
            ))}
            {r.frecuenciaPorConfirmar > 0 && (
              <li className="py-2">
                {r.frecuenciaPorConfirmar.toLocaleString("es-CR")} {r.frecuenciaPorConfirmar === 1 ? "obligación con frecuencia sin confirmar." : "obligaciones con frecuencia sin confirmar."}
              </li>
            )}
            {r.sociedadesSinObligaciones.map((s) => (
              <li key={s} className="py-2">
                <strong>Sociedad sin obligaciones:</strong> {s} tiene estados de cuenta pero no tiene obligaciones activas en la tabla de pagos. Si debería tenerlas, créelas con «Nueva obligación».
              </li>
            ))}
            {fuera.length > 0 && (
              <li className="py-2">
                <details>
                  <summary className="cursor-pointer">
                    <strong>{fuera.length.toLocaleString("es-CR")} sociedades sin estados de cuenta ni obligaciones.</strong> Ver la lista.
                  </summary>
                  <ul className="mt-2 list-disc pl-6 space-y-1">
                    {fuera.map((s) => (
                      <li key={s}>
                        <span className="line-clamp-2" title={s}>{s}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )}
          </ul>
        )}
        {(r.monedaPorConfirmar > 0 || r.sinMesArranque > 0) && (
          <p className="mt-3 text-sm text-suave">
            {r.monedaPorConfirmar > 0 && "La tabla de pagos no trae moneda ni monto; se aplicó colones. "}
            {r.sinMesArranque > 0 && `${r.sinMesArranque} con frecuencia no mensual no tienen mes de arranque y no generan vencimientos.`}
          </p>
        )}
      </div>
    </section>
  );
}
