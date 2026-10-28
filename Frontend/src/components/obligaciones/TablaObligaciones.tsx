"use client";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { FRECUENCIAS, MESES, nombreFecha } from "@/lib/formato";
import type { EstadoObligacion, EtiquetaObligacion, Frecuencia, Obligacion } from "@/lib/tipos";
import { claseControl, Etiqueta, NombreSociedad, type Tono } from "../ui";

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

const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = { mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

/** Frecuencia de la fila: se edita ahí mismo (selector y mes de arranque) y muestra si ya está confirmada. */
function EditorFrecuencia({
  o, alCambiar, alConfirmar,
}: {
  o: Obligacion;
  alCambiar: (o: Obligacion, f: Frecuencia, mes: number | null) => void;
  alConfirmar: (o: Obligacion) => void;
}) {
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(o.frecuencia);
  const [mes, setMes] = useState(o.mesArranque !== null ? String(o.mesArranque) : "");
  const mesEfectivo = frecuencia === "mensual" ? null : mes === "" ? null : Number(mes);
  const cambiado = frecuencia !== o.frecuencia || mesEfectivo !== (o.frecuencia === "mensual" ? null : o.mesArranque);
  const completo = frecuencia === "mensual" || mesEfectivo !== null;
  const confirmada = !o.frecuenciaPorConfirmar;
  const nombre = `${o.proveedor} ${o.identificador}`;

  return (
    <div className="min-w-44 space-y-1">
      <select
        aria-label={`Frecuencia de ${nombre}`}
        className={`${claseControl} w-full py-1 text-sm`}
        value={frecuencia}
        onChange={(e) => {
          const f = e.target.value as Frecuencia;
          setFrecuencia(f);
          if (f === "mensual") setMes("");
        }}
      >
        {FRECUENCIAS.map((f) => (
          <option key={f.valor} value={f.valor}>
            {NOMBRE_FRECUENCIA[f.valor]}
          </option>
        ))}
      </select>
      {frecuencia !== "mensual" && (
        <select aria-label={`Mes de arranque de ${nombre}`} className={`${claseControl} w-full py-1 text-sm`} value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Mes de arranque</option>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {confirmada ? <Etiqueta tono="verde">Frecuencia confirmada</Etiqueta> : <Etiqueta tono="ambar">Sin confirmar</Etiqueta>}
        {cambiado ? (
          <button
            type="button"
            disabled={!completo}
            title={completo ? undefined : "Indique el mes de arranque"}
            onClick={() => alCambiar(o, frecuencia, mesEfectivo)}
            className="rounded border-2 border-control px-2 py-0.5 text-xs font-semibold hover:bg-fondo-suave disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        ) : (
          !confirmada && (
            <button
              type="button"
              disabled={!completo}
              title={completo ? undefined : "Indique el mes de arranque"}
              onClick={() => alConfirmar(o)}
              className="rounded border-2 border-control px-2 py-0.5 text-xs font-semibold hover:bg-fondo-suave disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirmar frecuencia
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function TablaObligaciones({
  datos, alEditar, seleccion, alAlternar, alAlternarTodas, alCambiarFrecuencia, alConfirmarFrecuencia,
}: {
  datos: Obligacion[];
  alEditar: (o: Obligacion) => void;
  seleccion: ReadonlySet<number>;
  alAlternar: (o: Obligacion) => void;
  alAlternarTodas: () => void;
  alCambiarFrecuencia: (o: Obligacion, f: Frecuencia, mes: number | null) => void;
  alConfirmarFrecuencia: (o: Obligacion) => void;
}) {
  const todas = datos.length > 0 && datos.every((o) => seleccion.has(o.id));
  const columnas = useMemo(
    () => [
      col.display({
        id: "seleccion",
        header: () => (
          <input type="checkbox" className="h-4 w-4" aria-label="Seleccionar todas las obligaciones cargadas" checked={todas} onChange={alAlternarTodas} />
        ),
        cell: ({ row: { original: o } }) => (
          <input type="checkbox" className="h-4 w-4" aria-label={`Seleccionar ${o.proveedor} ${o.identificador} (${o.sociedad})`} checked={seleccion.has(o.id)} onChange={() => alAlternar(o)} />
        ),
      }),
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
          </>
        ),
      }),
      col.display({
        id: "frecuencia",
        header: "Frecuencia",
        cell: ({ row: { original: o } }) => (
          <EditorFrecuencia key={`${o.id}-${o.frecuencia}-${o.mesArranque}-${o.frecuenciaPorConfirmar}`} o={o} alCambiar={alCambiarFrecuencia} alConfirmar={alConfirmarFrecuencia} />
        ),
      }),
      col.accessor("proximoPago", {
        header: "Próximo pago",
        cell: (c) => (c.getValue() ? <span className="whitespace-nowrap">{nombreFecha(c.getValue()!)}</span> : <span className="text-suave">—</span>),
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
    [alEditar, seleccion, todas, alAlternar, alAlternarTodas, alCambiarFrecuencia, alConfirmarFrecuencia],
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
