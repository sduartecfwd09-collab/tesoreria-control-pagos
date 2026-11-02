"use client";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { MESES, nombreFecha } from "@/lib/formato";
import type { EtiquetaObligacion, Frecuencia, Obligacion } from "@/lib/tipos";
import { Etiqueta, NombreSociedad, type Tono } from "../ui";
import { EtiquetaEstadoObligacion } from "./FichaObligacion";

const col = createColumnHelper<Obligacion>();


const tonoDe = (e: EtiquetaObligacion): Tono => (e.codigo === "falta_dia" || e.codigo === "falta_mes_arranque" ? "rojo" : "ambar");

/** Solo problemas reales (identificador repetido o con formato de IBAN, sin día o sin mes de arranque); el detalle va en el título. */
function Observaciones({ o }: { o: Obligacion }) {
  // una «Revisada» (con efecto) sale de las alertas: sus observaciones no se muestran (se ven en su ficha)
  if (o.etiquetas.length === 0 || o.estado === "revisada") return <span className="text-suave">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {o.etiquetas.map((e) => (
        <Etiqueta key={e.codigo} tono={tonoDe(e)} titulo={e.ayuda}>
          {e.texto}
        </Etiqueta>
      ))}
    </div>
  );
}

const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

export function TablaObligaciones({ datos, alEditar, alGestionar }: { datos: Obligacion[]; alEditar: (o: Obligacion) => void; alGestionar: (o: Obligacion) => void }) {
  // el servidor solo envía el responsable (el tesorero de la sociedad) a Jefatura: sin ese dato no hay columna
  const conResponsable = datos.some((o) => o.responsableEfectivo !== undefined);
  const columnas = useMemo(
    () => [
      col.accessor("sociedad", { header: "Sociedad", cell: (c) => <NombreSociedad nombre={c.getValue()} className="min-w-28 max-w-44" /> }),
      col.accessor("proveedor", {
        header: "Proveedor",
        cell: (c) => (
          <>
            <span className="font-medium">{c.getValue()}</span>
            <span className="block text-xs text-suave">{c.row.original.categoria}</span>
          </>
        ),
      }),
      col.accessor("identificador", { header: "Identificador", cell: (c) => <span className="font-mono text-sm whitespace-nowrap">{c.getValue()}</span> }),
      col.display({
        id: "pago",
        header: "Pago",
        cell: ({ row: { original: o } }) => (
          <>
            {o.diaEsperadoPago !== null ? <span>Día {o.diaEsperadoPago}</span> : <span className="text-suave">Sin día</span>}
          </>
        ),
      }),
      col.display({
        id: "frecuencia",
        header: "Frecuencia",
        cell: ({ row: { original: o } }) => (
          <span>
            {NOMBRE_FRECUENCIA[o.frecuencia]}
            {o.frecuencia !== "mensual" && o.mesArranque !== null && <span className="block text-xs text-suave">desde {MESES[o.mesArranque - 1]}</span>}
          </span>
        ),
      }),
      col.accessor("proximoPago", {
        header: "Próximo pago",
        cell: (c) => (c.getValue() ? <span>{nombreFecha(c.getValue()!)}</span> : <span className="text-suave">—</span>),
      }),
      ...(conResponsable
        ? [col.accessor("responsableEfectivo", {
            header: "Responsable",
            cell: ({ row: { original: o } }) => (o.responsableEfectivo ? <span>{o.responsableEfectivo}</span> : <span className="text-suave">—</span>),
          })]
        : []),
      col.display({
        id: "estado",
        header: "Estado",
        cell: ({ row: { original: o } }) => <EtiquetaEstadoObligacion estado={o.estado} />,
      }),
      col.display({ id: "observaciones", header: "Observaciones", cell: ({ row }) => <Observaciones o={row.original} /> }),
      col.display({
        id: "acciones",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row: { original: o } }) => (
          <div className="flex flex-wrap justify-end gap-2">
            {/* «Gestionar» solo si hay una acción posible para esta persona (marcar como revisada o quitar la revisión) */}
            {o.puedeGestionar && (
              <button
                type="button"
                onClick={() => alGestionar(o)}
                aria-label={`Gestionar ${o.proveedor} ${o.identificador} (${o.sociedad})`}
                className="rounded border-2 border-control px-2 py-1 text-sm font-semibold hover:bg-fondo-suave"
              >
                Gestionar
              </button>
            )}
            <button
              type="button"
              onClick={() => alEditar(o)}
              aria-label={`Editar ${o.proveedor} ${o.identificador} (${o.sociedad})`}
              className="rounded border-2 border-control px-2 py-1 text-sm font-semibold hover:bg-fondo-suave"
            >
              Editar
            </button>
          </div>
        ),
      }),
    ],
    [alEditar, alGestionar, conResponsable],
  );

  const tabla = useReactTable({ data: datos, columns: columnas, getCoreRowModel: getCoreRowModel(), getRowId: (o) => String(o.id) });

  return (
    <div className="mt-4 overflow-x-auto rounded border border-divisor">
      <table className="w-full text-sm">
        <caption className="sr-only">Obligaciones del catálogo</caption>
        <thead className="bg-fondo-suave text-left">
          {tabla.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id} scope="col" className="px-2 py-2 font-semibold border-b-2 border-control">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-divisor">
          {tabla.getRowModel().rows.map((r) => (
            <tr key={r.id} className={r.original.activa ? "" : "bg-fondo-suave"}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-2 py-2 align-top">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
