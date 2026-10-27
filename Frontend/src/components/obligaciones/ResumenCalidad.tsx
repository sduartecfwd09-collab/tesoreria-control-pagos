"use client";
import type { FiltroObligaciones, ResumenCatalogo } from "@/lib/tipos";
import { claseBotonSecundario } from "../ui";

type Falta = NonNullable<FiltroObligaciones["falta"]>;

export function ResumenCalidad({
  r, faltaActiva, alFiltrarFalta, alBuscar,
}: {
  r: ResumenCatalogo;
  faltaActiva?: Falta;
  alFiltrarFalta: (f: Falta) => void;
  alBuscar: (sociedad: string, texto: string) => void;
}) {
  const tarjetas: { falta?: Falta; titulo: string; n: number; ayuda: string }[] = [
    { titulo: "Obligaciones activas", n: r.activas, ayuda: r.inactivas ? `${r.inactivas} inactivas` : "ninguna inactiva" },
    { falta: "monto", titulo: "Falta monto", n: r.sinMonto, ayuda: "dato opcional" },
    { falta: "responsable", titulo: "Sin responsable", n: r.sinResponsable, ayuda: "ni propio ni del tesorero" },
    ...(r.sinDia > 0 ? [{ falta: "dia" as const, titulo: "Falta día", n: r.sinDia, ayuda: "no generan vencimientos" }] : []),
  ];
  const fuera = r.sociedadesSinEstadosNiObligaciones;
  // las sociedades sin estados de cuenta ni obligaciones cuentan como una sola línea resumen
  const pendientes = r.identificadoresRepetidos.length + r.formatoIban.length + r.sociedadesSinObligaciones.length + (fuera.length > 0 ? 1 : 0);

  return (
    <section aria-labelledby="h-calidad" className="mt-6">
      <h2 id="h-calidad" className="text-lg font-bold border-b-2 border-acento pb-1">Calidad del catálogo</h2>
      <p className="mt-2 text-sm text-suave max-w-3xl">
        Pulse una tarjeta para ver solo esas obligaciones. Nada de esto bloquea el trabajo: se completa editando cada obligación.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tarjetas.map((t) => {
          const contenido = (
            <>
              <span className="block text-sm text-suave">{t.titulo}</span>
              <span className="block text-2xl font-bold">{t.n.toLocaleString("es-CR")}</span>
              <span className="block text-xs text-suave">{t.ayuda}</span>
            </>
          );
          const activa = t.falta && t.falta === faltaActiva;
          return (
            <li key={t.titulo}>
              {t.falta ? (
                <button
                  type="button"
                  onClick={() => alFiltrarFalta(t.falta!)}
                  aria-pressed={activa}
                  className={`w-full h-full text-left rounded border-2 px-4 py-3 hover:bg-fondo-suave ${activa ? "border-control bg-fondo-suave" : "border-divisor"}`}
                >
                  {contenido}
                  <span className="mt-1 block text-xs font-medium underline">{activa ? "Mostrando estas" : "Ver estas"}</span>
                </button>
              ) : (
                <div className="h-full rounded border border-divisor bg-fondo-suave px-4 py-3">{contenido}</div>
              )}
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
        {(r.frecuenciaPorConfirmar > 0 || r.monedaPorConfirmar > 0 || r.sinMesArranque > 0) && (
          <p className="mt-3 text-sm text-suave">
            {(r.frecuenciaPorConfirmar > 0 || r.monedaPorConfirmar > 0) && "La tabla de pagos no trae frecuencia, moneda, monto ni cuenta; se aplicó mensual y colones. "}
            {r.sinMesArranque > 0 && `${r.sinMesArranque} con frecuencia no mensual no tienen mes de arranque y no generan vencimientos.`}
          </p>
        )}
      </div>
    </section>
  );
}
