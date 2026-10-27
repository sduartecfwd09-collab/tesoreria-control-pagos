"use client";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { MESES_CORTOS } from "@/lib/formato";
import type { EstadoObligacion, EtiquetaObligacion, Obligacion } from "@/lib/tipos";
import { Etiqueta, NombreSociedad, type Tono } from "../ui";

const col = createColumnHelper<Obligacion>();

const ESTADO: Record<EstadoObligacion, { texto: string; tono: Tono }> = {
  activa: { texto: "Activa", tono: "verde" },
  inactiva: { texto: "Inactiva", tono: "suave" },
  en_revision: { texto: "En revisión", tono: "ambar" },
};

const tonoDe = (e: EtiquetaObligacion): Tono => (e.codigo === "falta_dia" || e.codigo === "falta_mes_arranque" ? "rojo" : "ambar");

/** Solo problemas reales (identificador repetido o con formato de IBAN, sin día o sin mes de arranque); el detalle va en el título. */
function Observaciones({ o }: { o: Obligacion }) {
  if (o.etiquetas.length === 0) return <span className="text-suave">—</span>;
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

export function TablaObligaciones({ datos, alEditar }: { datos: Obligacion[]; alEditar: (o: Obligacion) => void }) {
  const columnas = useMemo(
    () => [
      col.accessor("sociedad", { header: "Sociedad", cell: (c) => <NombreSociedad nombre={c.getValue()} className="min-w-40 max-w-64" /> }),
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
            <span className="block text-xs text-suave">
              {o.frecuencia}
              {o.frecuencia !== "mensual" && o.mesArranque !== null && ` · desde ${MESES_CORTOS[o.mesArranque - 1]}`}
            </span>
          </>
        ),
      }),
      col.accessor("responsableEfectivo", {
        header: "Responsable",
        cell: ({ row: { original: o } }) =>
          o.responsableEfectivo === null ? (
            <span className="text-suave">—</span>
          ) : (
            <>
              {o.responsableEfectivo}
              {o.responsableDe === "tesorero" && <span className="block text-xs text-suave">Tesorero de la sociedad</span>}
            </>
          ),
      }),
      col.display({
        id: "estado",
        header: "Estado",
        cell: ({ row: { original: o } }) => <Etiqueta tono={ESTADO[o.estado].tono}>{ESTADO[o.estado].texto}</Etiqueta>,
      }),
      col.display({ id: "observaciones", header: "Observaciones", cell: ({ row }) => <Observaciones o={row.original} /> }),
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
