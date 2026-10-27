"use client";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { monto, nombreFecha } from "@/lib/formato";
import type { EstadoVencimiento, Vencimiento } from "@/lib/tipos";
import { Etiqueta, NombreSociedad, type Tono } from "../ui";

// Los estados distintos de "proyectado" llegan con el cruce (Hito 4); ya tienen texto para cuando aparezcan.
const ESTADO: Record<EstadoVencimiento, { texto: string; tono: Tono }> = {
  proyectado: { texto: "Proyectado", tono: "suave" },
  por_vencer: { texto: "Por vencer", tono: "ambar" },
  vencido: { texto: "Vencido", tono: "rojo" },
  pagado: { texto: "Pagado", tono: "verde" },
  pagado_con_inconsistencia: { texto: "Pagado con inconsistencia", tono: "ambar" },
  sin_informacion: { texto: "Sin información", tono: "suave" },
};

const col = createColumnHelper<Vencimiento>();
const columnas = [
  col.accessor("fecha", { header: "Vence", cell: (c) => <span className="whitespace-nowrap font-medium">{nombreFecha(c.getValue())}</span> }),
  col.accessor("sociedad", { header: "Sociedad", cell: (c) => <NombreSociedad nombre={c.getValue()} className="font-semibold min-w-40 max-w-64" /> }),
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
  col.accessor("montoEsperado", {
    header: "Monto esperado",
    cell: (c) => (c.getValue() === null ? <span className="text-suave">Monto sin definir</span> : <span className="whitespace-nowrap">{monto(c.getValue(), c.row.original.moneda)}</span>),
  }),
  col.accessor("estado", {
    header: "Estado",
    cell: (c) => {
      const e = ESTADO[c.getValue()] ?? { texto: c.getValue(), tono: "suave" as const };
      return <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>;
    },
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
