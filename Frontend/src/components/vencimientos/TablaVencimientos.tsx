"use client";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { montoPagado, nombreFecha, nombrePeriodo } from "@/lib/formato";
import type { Vencimiento } from "@/lib/tipos";
import { Etiqueta, NombreSociedad } from "../ui";
import { detalleDeEstado, EtiquetaEstado } from "./EstadoVencimiento";

const col = createColumnHelper<Vencimiento>();
const columnas = [
  col.accessor("fecha", {
    header: "Vence",
    cell: ({ row: { original: v } }) => (
      <>
        <span className="whitespace-nowrap font-medium">{nombreFecha(v.fecha)}</span>
        {v.fechaOriginal && <span className="block text-xs text-suave whitespace-nowrap">Original: {nombreFecha(v.fechaOriginal)}</span>}
        {v.mesAnterior && (
          <span className="mt-1 block">
            <Etiqueta tono="suave" titulo={`Vencimiento de ${nombrePeriodo(v.periodo)} que sigue sin resolver`}>
              Mes anterior
            </Etiqueta>
          </span>
        )}
      </>
    ),
  }),
  col.accessor("sociedad", { header: "Sociedad", cell: (c) => <NombreSociedad nombre={c.getValue()} className="min-w-40 max-w-64" /> }),
  col.accessor("proveedor", {
    header: "Proveedor",
    cell: (c) => (
      <>
        <span className="font-medium">{c.getValue()}</span>
        <span className="block text-xs text-suave">
          {c.row.original.categoria} · {c.row.original.frecuencia}
        </span>
      </>
    ),
  }),
  col.accessor("identificador", { header: "Identificador", cell: (c) => <span className="font-mono text-sm whitespace-nowrap">{c.getValue()}</span> }),
  col.accessor("estado", {
    header: "Estado",
    cell: ({ row: { original: v } }) => {
      const detalle = detalleDeEstado(v);
      return (
        <>
          <EtiquetaEstado estado={v.estado} />
          {detalle && <span className="mt-1 block max-w-64 text-xs text-suave">{detalle}</span>}
        </>
      );
    },
  }),
  col.display({
    id: "pago",
    header: "Pago",
    cell: ({ row: { original: v } }) =>
      v.pago ? (
        <>
          <span className="whitespace-nowrap">{nombreFecha(v.pago.fecha)}</span>
          {v.diferenciaDias !== null && v.diferenciaDias > 0 && (
            <span className="block text-xs text-suave whitespace-nowrap">
              {v.diferenciaDias} {v.diferenciaDias === 1 ? "día" : "días"} después
            </span>
          )}
          <span className="block text-xs text-suave whitespace-nowrap">Cuenta {v.pago.cuenta}</span>
        </>
      ) : (
        <span className="text-suave">—</span>
      ),
  }),
  col.display({
    id: "montoPagado",
    header: () => <span className="block text-right">Monto pagado</span>,
    cell: ({ row: { original: v } }) =>
      v.pago ? <span className="block text-right whitespace-nowrap tabular-nums">{montoPagado(v.pago.monto, v.pago.moneda)}</span> : <span className="block text-right text-suave">—</span>,
  }),
];

export function TablaVencimientos({ datos }: { datos: Vencimiento[] }) {
  const tabla = useReactTable({ data: datos, columns: columnas, getCoreRowModel: getCoreRowModel(), getRowId: (v) => String(v.id) });
  return (
    <div className="mt-4 overflow-x-auto rounded border border-divisor">
      <table className="w-full text-sm">
        <caption className="sr-only">Vencimientos</caption>
        <thead className="bg-fondo-suave text-left">
          {tabla.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id} scope="col" className="px-3 py-2 font-semibold border-b-2 border-control">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-divisor">
          {tabla.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-3 py-2 align-top">
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
