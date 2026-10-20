"use client";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { MESES_CORTOS, monto } from "@/lib/formato";
import type { EtiquetaObligacion, Obligacion } from "@/lib/tipos";
import { Etiqueta, type Tono } from "../ui";

const col = createColumnHelper<Obligacion>();

const tonoDe = (e: EtiquetaObligacion): Tono =>
  e.codigo === "falta_dia" || e.codigo === "falta_mes_arranque" ? "rojo" : e.codigo.startsWith("falta") ? "suave" : "ambar";

/** Una etiqueta por texto (varias razones de "Por confirmar con Tesorería" se juntan en una, con todas en el título). */
function Etiquetas({ o }: { o: Obligacion }) {
  const grupos = new Map<string, EtiquetaObligacion[]>();
  for (const e of o.etiquetas) if (e.codigo !== "falta_responsable") grupos.set(e.texto, [...(grupos.get(e.texto) ?? []), e]);
  return (
    <div className="flex flex-wrap gap-1">
      {!o.activa && <Etiqueta tono="suave">Inactiva</Etiqueta>}
      {[...grupos.entries()].map(([texto, es]) => (
        <Etiqueta key={texto} tono={tonoDe(es[0]!)} titulo={es.map((e) => e.ayuda).join("\n")}>
          {texto}
        </Etiqueta>
      ))}
    </div>
  );
}

export function TablaObligaciones({ datos, alEditar }: { datos: Obligacion[]; alEditar: (o: Obligacion) => void }) {
  const columnas = useMemo(
    () => [
      col.accessor("sociedad", { header: "Sociedad", cell: (c) => <span className="font-semibold">{c.getValue()}</span> }),
      col.accessor("proveedor", {
        header: "Proveedor",
        cell: (c) => (
          <>
            <span className="font-medium">{c.getValue()}</span>
            <span className="block text-xs text-suave">{c.row.original.categoria}</span>
          </>
        ),
      }),
      col.accessor("identificador", { header: "Identificador", cell: (c) => <span className="font-mono text-sm break-all">{c.getValue()}</span> }),
      col.display({
        id: "pago",
        header: "Pago",
        cell: ({ row: { original: o } }) => (
          <>
            {o.diaEsperadoPago !== null ? <span>Día {o.diaEsperadoPago}</span> : <span className="text-suave">Sin día</span>}
            <span className="block text-xs text-suave">
              {o.frecuencia}
              {o.frecuencia !== "mensual" && o.mesArranque !== null && ` · desde ${MESES_CORTOS[o.mesArranque - 1]}`}
            </span>
          </>
        ),
      }),
      col.accessor("montoEsperado", {
        header: "Monto esperado",
        cell: (c) => <span className="whitespace-nowrap">{monto(c.getValue(), c.row.original.moneda)}</span>,
      }),
      col.accessor("responsable", { header: "Responsable", cell: (c) => c.getValue() ?? <span className="text-suave">—</span> }),
      col.display({ id: "avisos", header: "Estado y avisos", cell: ({ row }) => <Etiquetas o={row.original} /> }),
      col.display({
        id: "acciones",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row: { original: o } }) => (
          <button
            type="button"
            onClick={() => alEditar(o)}
            aria-label={`Editar ${o.proveedor} ${o.identificador} (${o.sociedad})`}
            className="rounded border-2 border-control px-3 py-1 text-sm font-semibold hover:bg-fondo-suave"
          >
            Editar
          </button>
        ),
      }),
    ],
    [alEditar],
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
                <th key={h.id} scope="col" className="px-3 py-2 font-semibold border-b-2 border-control">
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
