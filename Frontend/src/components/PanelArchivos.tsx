"use client";
import { LineaAlcance } from "./LineaAlcance";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { compararSociedades } from "@/lib/formato";
import { SelectorSociedad } from "./SelectorSociedad";
import { NombreSociedad } from "./ui";
import type { ArchivoImportado, CeldaCobertura, Cobertura, Importaciones } from "@/lib/tipos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] ?? m.slice(5)} ${m.slice(0, 4)}`;
const numero = (n: number) => n.toLocaleString("es-CR");

function Etiqueta({ children, tono }: { children: React.ReactNode; tono: "ambar" | "rojo" | "suave" }) {
  const clases = {
    ambar: "bg-ambar-fondo text-ambar-texto",
    rojo: "bg-rojo-fondo text-rojo",
    suave: "bg-fondo-suave text-suave border border-divisor",
  }[tono];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${clases}`}>{children}</span>;
}

const TEXTO_SALDO: Record<string, string> = { cuadra: "Saldo cuadra", no_cuadra: "Saldo no cuadra", no_verificable: "Saldo no verificable" };

function Celda({ c }: { c: CeldaCobertura }) {
  if (c.estado === "falta") {
    return (
      <div title="No hay archivo de esta cuenta para este mes" className="rounded border border-dashed border-control px-2 py-1.5 text-suave">
        <span className="font-semibold">Falta</span>
        <span className="block text-xs">sin archivo</span>
      </div>
    );
  }
  if (c.estado === "error" || c.estado === "sin_sociedad") {
    const motivo = c.error ?? "Sin motivo registrado";
    const clases = c.estado === "error" ? "border-2 border-rojo bg-rojo-fondo text-rojo" : "border-2 border-ambar-texto bg-ambar-fondo text-ambar-texto";
    const contenido = (
      <>
        <span className="font-semibold">{c.estado === "error" ? "Error" : "Sin sociedad"}</span>
        <span className="block text-xs line-clamp-2">{motivo}</span>
      </>
    );
    // Cada celda con problema enlaza a su motivo en el detalle de abajo (ahí está el mismo archivo).
    return c.archivoId !== undefined ? (
      <a href={`#archivo-${c.archivoId}`} title={motivo} className={`block rounded px-2 py-1.5 ${clases}`}>
        {contenido}
        <span className="block text-xs underline">Ver motivo</span>
      </a>
    ) : (
      <div title={motivo} className={`rounded px-2 py-1.5 ${clases}`}>
        {contenido}
      </div>
    );
  }
  return (
    <div title={`Formato ${c.formato ?? "?"}${c.duplicados > 0 ? ` · ${c.duplicados} repetidos en otro archivo` : ""}${c.saldoMotivo ? ` · ${c.saldoMotivo}` : ""}`} className="rounded border border-control px-2 py-1.5">
      <span className="font-semibold">{c.movimientos === 0 ? "Sin movimientos" : `${numero(c.movimientos)} mov.`}</span>
      {c.saldo !== undefined && (
        <span className="mt-1 block">
          <Etiqueta tono={c.saldo === "no_cuadra" ? "ambar" : "suave"}>{TEXTO_SALDO[c.saldo] ?? "Saldo sin comprobar"}</Etiqueta>
        </span>
      )}
    </div>
  );
}

function Resumen({ r }: { r: Importaciones["resumen"] }) {
  // Archivos = Leídos + Con error + Sin sociedad. Los retirados de la carpeta no cuentan y tienen su propia tarjeta.
  const items: [string, number, string?][] = [
    ["Archivos", r.archivos, "leídos + con error + sin sociedad"],
    ["Leídos", r.leidos],
    ["Con error", r.conError],
    ["Sin sociedad", r.sinSociedad],
    ...(r.retirados > 0 ? [["Retirados de la carpeta", r.retirados, "no cuentan en los totales"] as [string, number, string]] : []),
    ["Movimientos", r.movimientos],
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([t, n, nota]) => (
        <div key={t} className="rounded border border-divisor bg-fondo-suave px-4 py-3">
          <dt className="text-sm text-suave">{t}</dt>
          <dd className={`text-2xl font-bold ${t === "Con error" && n > 0 ? "text-rojo" : ""}`}>{numero(n)}</dd>
          {nota && <dd className="text-xs text-suave">{nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

function ListaAtencion({ titulo, ayuda, vacio, filas }: { titulo: string; ayuda: string; vacio: string; filas: { ruta: string; texto: string; id?: number }[] }) {
  return (
    <section className="mt-8" aria-label={titulo}>
      <h3 className="font-bold">
        {titulo} <span className="font-normal text-suave">({filas.length})</span>
      </h3>
      <p className="mt-1 text-sm text-suave max-w-2xl">{ayuda}</p>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm">{vacio}</p>
      ) : (
        <ul className="mt-3 divide-y divide-divisor border border-divisor rounded">
          {filas.map((f, i) => (
            <li key={f.ruta + i} id={f.id !== undefined ? `archivo-${f.id}` : undefined} className="px-3 py-2 text-sm scroll-mt-4 target:bg-fondo-suave">
              <span className="font-medium break-all">{f.ruta}</span>
              <span className="block text-suave">{f.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Atencion({ archivos }: { archivos: ArchivoImportado[] }) {
  const errores = archivos.filter((a) => a.estado === "con_error");
  const sinSociedad = archivos.filter((a) => a.estado === "sin_sociedad");
  const retirados = archivos.filter((a) => a.estado === "retirado");
  const vigentes = archivos.filter((a) => a.estado === "leido" && a.saldo !== null);
  const saldo = vigentes.filter((a) => a.saldo!.resultado === "no_cuadra");
  const noVerificable = vigentes.filter((a) => a.saldo!.resultado === "no_verificable");
  const cuadran = vigentes.filter((a) => a.saldo!.resultado === "cuadra");
  const nombre = archivos.filter((a) => a.estado !== "retirado" && a.discrepancias.length > 0);
  return (
    <>
      <h2 className="mt-12 text-lg font-bold border-b-2 border-acento pb-1">Archivos que requieren atención</h2>
      <ListaAtencion
        titulo="Archivos con error"
        ayuda="No se pudieron leer. El resto de la importación continuó con normalidad."
        vacio="Todos los archivos se leyeron."
        filas={errores.map((a) => ({ id: a.id, ruta: a.archivo, texto: a.motivo ?? "Sin motivo registrado" }))}
      />
      <ListaAtencion
        titulo="Archivos sin sociedad"
        ayuda="La carpeta del archivo no tiene una sociedad asignada, así que no se leyó. Se lee cuando la carpeta tenga sociedad."
        vacio="Todas las carpetas tienen sociedad."
        filas={sinSociedad.map((a) => ({ id: a.id, ruta: a.archivo, texto: a.motivo ?? "La carpeta no tiene una sociedad asignada" }))}
      />
      <ListaAtencion
        titulo="Archivos retirados de la carpeta"
        ayuda="Ya no están en la carpeta. Se conservan con su historial, pero no cuentan en totales ni cobertura. Si vuelven a aparecer, se reactivan."
        vacio="Todos los archivos registrados siguen en la carpeta."
        filas={retirados.map((a) => ({ id: a.id, ruta: a.archivo, texto: "Retirado de la carpeta" }))}
      />
      <p className="mt-8 text-sm" aria-label="Resultado del saldo">
        <span className="font-bold">Resultado del saldo de los archivos leídos:</span> {numero(cuadran.length)} cuadran · {numero(saldo.length)} no cuadran · {numero(noVerificable.length)} no se pueden verificar
      </p>
      <ListaAtencion
        titulo="Archivos donde el saldo no cuadra"
        ayuda="El saldo anterior más créditos y menos débitos no coincide con el saldo siguiente. Un archivo así no cuenta como estado de cuenta completo: los pagos de esa sociedad quedan en «Sin información» hasta revisarlo."
        vacio="El saldo cuadra en todos los archivos que se pueden verificar."
        filas={saldo.map((a) => ({
          ruta: a.archivo,
          texto: `${a.saldo!.motivo}${a.continuidad && a.continuidad.filasConFallo.length > 0 ? ` Filas: ${a.continuidad.filasConFallo.join(", ")}.` : ""}`,
        }))}
      />
      <ListaAtencion
        titulo="Archivos con saldo no verificable"
        ayuda="No se puede comprobar el saldo de estos archivos. No cambia la cobertura: sigue por fechas."
        vacio="El saldo se pudo comprobar en todos los archivos."
        filas={noVerificable.map((a) => ({ ruta: a.archivo, texto: a.saldo!.motivo }))}
      />
      <ListaAtencion
        titulo="Nombre del archivo distinto del contenido"
        ayuda="La cuenta, el mes o la sociedad del nombre no coinciden con lo que trae el archivo."
        vacio="Los nombres coinciden con el contenido."
        filas={nombre.flatMap((a) => a.discrepancias.map((d) => ({ ruta: a.archivo, texto: d.mensaje })))}
      />
    </>
  );
}

export function PanelArchivos() {
  const [imp, setImp] = useState<Importaciones | null>(null);
  const [cob, setCob] = useState<Cobertura | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [sociedad, setSociedad] = useState("");

  useEffect(() => {
    let vigente = true;
    Promise.all([api.listarImportaciones(), api.obtenerCobertura()])
      .then(([i, c]) => {
        if (!vigente) return;
        setImp(i);
        setCob(c);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
  }, [intento]);

  // alfabético por nombre largo (el orden es estable: las cuentas de una sociedad conservan su orden)
  const sociedades = useMemo(() => [...new Set((cob?.filas ?? []).map((f) => f.sociedad))].sort(compararSociedades), [cob]);
  const filas = useMemo(
    () => (cob?.filas ?? []).filter((f) => !sociedad || f.sociedad === sociedad).sort((a, b) => compararSociedades(a.sociedad, b.sociedad)),
    [cob, sociedad],
  );

  if (error)
    return (
      <div role="alert" className="mt-8 border-2 border-rojo bg-rojo-fondo text-rojo rounded p-4">
        <p className="font-semibold">{error}</p>
        <button onClick={() => setIntento((n) => n + 1)} className="mt-3 bg-acento text-sobre-acento font-semibold rounded px-4 py-2">
          Reintentar
        </button>
      </div>
    );
  if (!imp || !cob)
    return (
      <p className="mt-8 text-suave" role="status">
        Cargando archivos…
      </p>
    );
  if (imp.datos.length === 0)
    return (
      <>
      <LineaAlcance alcance={imp.alcance} />
      <div className="mt-8 rounded border border-divisor bg-fondo-suave p-6 max-w-2xl">
        <p className="font-semibold">Todavía no se ha importado ninguna carpeta.</p>
        <p className="mt-2 text-sm text-suave">
          La importación lee la carpeta de estados de cuenta configurada en el servidor (STATEMENTS_ROOT). Se ejecuta desde el Backend con{" "}
          <span className="font-mono">npm run reimportar</span>. Luego recargue
          esta página.
        </p>
      </div>
      </>
    );

  return (
    <>
      <LineaAlcance alcance={imp.alcance} />
      <Resumen r={imp.resumen} />

      <h2 className="mt-12 text-lg font-bold border-b-2 border-acento pb-1">Cobertura por cuenta y mes</h2>
      <p className="mt-2 text-sm text-suave max-w-2xl">
        Cada fila es una cuenta y cada columna un mes. <strong>Falta</strong> significa que no se encontró el estado de cuenta de ese mes: es un dato
        sin cubrir, no un pago pendiente.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="text-sm font-medium" htmlFor="filtro-sociedad">
          Sociedad
        </label>
        <div className="w-full sm:w-96">
          <SelectorSociedad id="filtro-sociedad" opciones={sociedades.map((x) => ({ valor: x, nombre: x }))} valor={sociedad} alCambiar={setSociedad} textoTodas="Todas" />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border border-divisor rounded">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">Cobertura de estados de cuenta por sociedad, cuenta y mes</caption>
          <thead>
            <tr className="bg-cabecera text-sobre-cabecera text-left">
              <th scope="col" className="px-3 py-2 font-semibold">
                Cuenta
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Banco
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Moneda
              </th>
              {cob.meses.map((m) => (
                <th key={m} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                  {etiquetaMes(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <Fragment key={`${f.sociedad}|${f.cuentaId ?? f.cuenta}|${i}`}>
                {(i === 0 || filas[i - 1]!.sociedad !== f.sociedad) && (
                  <tr className="bg-fondo-suave">
                    <th scope="colgroup" colSpan={3 + cob.meses.length} className="px-3 py-1.5 text-left font-normal border-t border-divisor">
                      <NombreSociedad nombre={f.sociedad} />
                    </th>
                  </tr>
                )}
                <tr className="border-t border-divisor align-top">
                  <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-normal break-all min-w-44">
                    {f.cuenta}
                  </th>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {f.banco ?? <span className="text-suave">Sin dato</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {f.moneda ?? <span className="text-suave">Sin dato</span>}
                  </td>
                  {cob.meses.map((m) => (
                    <td key={m} className="px-2 py-2 min-w-36">
                      <Celda c={f.celdas[m]!} />
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {cob.sinUbicar.length > 0 && (
        <p className="mt-2 text-sm text-suave">
          {cob.sinUbicar.length} archivo(s) con nombre fuera de la convención no se pueden ubicar en la tabla; aparecen abajo como errores.
        </p>
      )}

      <Atencion archivos={imp.datos} />
    </>
  );
}
