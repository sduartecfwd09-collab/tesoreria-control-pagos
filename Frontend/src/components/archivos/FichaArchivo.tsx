"use client";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { montoPagado, nombreFecha, nombrePeriodo } from "@/lib/formato";
import type { InfoArchivo } from "@/lib/tipos";
import { Ficha } from "../Ficha";
import { AccionesArchivo } from "./AccionesArchivo";
import { TextoSaldoTres } from "./TextoSaldo";

const ESTADO_ARCHIVO: Record<string, string> = { leido: "Leído", con_error: "Con error", sin_sociedad: "Sin sociedad", retirado: "Retirado de la carpeta" };
const RESULTADO_SALDO = { cuadra: "cuadra", no_cuadra: "no cuadra", no_verificable: "no verificable" } as const;

/** Información completa de un archivo de estado de cuenta (solo lectura), con «Abrir archivo» y «Copiar ruta». */
export function FichaArchivo({ id, alCerrar }: { id: number; alCerrar: () => void }) {
  const [a, setA] = useState<InfoArchivo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api.informacionArchivo(id).then((r) => vigente && setA(r)).catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar la información del archivo"));
    return () => {
      vigente = false;
    };
  }, [id]);

  const fila = (k: string, v: ReactNode) => (
    <>
      <dt className="text-suave">{k}</dt>
      <dd className="font-semibold break-words">{v}</dd>
    </>
  );
  const pd = a?.periodoDeclarado;
  const periodo = pd && (pd.del || pd.al) ? `Del ${pd.del ? nombreFecha(pd.del) : "—"} al ${pd.al ? nombreFecha(pd.al) : "—"}` : "No declarado";
  const saldoTexto = (c: number | null | undefined) => (c === null || c === undefined ? "No detectado" : montoPagado(c, a?.moneda ?? null));

  return (
    <Ficha etiqueta="Información del archivo" titulo={a ? a.nombre : "Cargando…"} idTitulo="titulo-archivo" alCerrar={alCerrar}>
      {error && <p role="alert" className="font-semibold text-rojo">{error}</p>}
      {!a && !error && <p role="status" className="text-suave">Cargando la información…</p>}
      {a && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {fila("Estado", ESTADO_ARCHIVO[a.estado] ?? a.estado)}
            {a.motivoArchivo && fila("Motivo", a.motivoArchivo)}
            {fila("Sociedad", a.sociedad ?? "Sin sociedad")}
            {fila("Cuenta", <span className="font-mono">{a.cuenta ?? "Sin dato"}</span>)}
            {fila("Banco", a.banco ?? "Sin dato")}
            {fila("Mes", a.mes ? nombrePeriodo(a.mes) : "Sin dato")}
            {fila("Hoja", a.hoja ?? "Sin dato")}
            {fila("Período declarado", periodo)}
            {fila("Filas leídas", a.filasLeidas.toLocaleString("es-CR"))}
            {fila("Movimientos", a.movimientos.toLocaleString("es-CR"))}
            {fila("Saldo anterior detectado", saldoTexto(a.saldoInicial))}
            {fila("Saldo siguiente detectado", saldoTexto(a.saldoFinal))}
          </dl>
          <section className="mt-5 border-t border-linea pt-4">
            <h3 className="text-sm font-bold">Resultado del saldo{a.saldo ? `: ${RESULTADO_SALDO[a.saldo.resultado]}` : ""}</h3>
            {a.saldo ? <TextoSaldoTres saldo={a.saldo} /> : <p className="mt-1 text-sm text-suave">Este archivo no trae la comprobación del saldo.</p>}
          </section>
          <section className="mt-5 border-t border-linea pt-4">
            <h3 className="text-sm font-bold">Archivo</h3>
            <p className="mt-1 break-all font-mono text-xs text-suave">{a.rutaRelativa}</p>
            <AccionesArchivo id={a.id} nombre={a.nombre} rutaRelativa={a.rutaRelativa} />
          </section>
        </>
      )}
    </Ficha>
  );
}
