"use client";
import { LineaAlcance } from "./LineaAlcance";
import { Fragment, useEffect, useMemo, useState, type RefObject } from "react";
import { api } from "@/lib/api";
import { compararSociedades } from "@/lib/formato";
import { contarPorTarjeta, filtrarPorTarjeta, TARJETAS_ARCHIVOS } from "@/lib/filtro-tarjetas";
import { useFiltroTarjeta } from "@/lib/useFiltroTarjeta";
import { SelectorSociedad } from "./SelectorSociedad";
import { NombreSociedad } from "./ui";
import { EtiquetaEstado, IconoEstado } from "./pagos/EstadoPago";
import { ACENTO_ESTADO, Tarjeta } from "./pagos/TarjetaEstado";
import { FichaArchivo } from "./archivos/FichaArchivo";
import { TextoSaldoTres } from "./archivos/TextoSaldo";
import type { ArchivoImportado, CeldaCobertura, Cobertura, EstadoVencimiento, Importaciones, TextoSaldo } from "@/lib/tipos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] ?? m.slice(5)} ${m.slice(0, 4)}`;
const numero = (n: number) => n.toLocaleString("es-CR");

const TEXTO_SALDO: Record<string, string> = { cuadra: "Saldo cuadra", no_cuadra: "Saldo no cuadra", no_verificable: "Saldo no verificable" };
/** Estado existente que toma cada resultado del saldo (con su texto propio): cuadra = Pagado, no verificable = Programado (neutral), no cuadra = Sin información. */
const ESTADO_SALDO: Record<string, EstadoVencimiento> = { cuadra: "pagado", no_cuadra: "sin_informacion", no_verificable: "proyectado" };

function Celda({ c, sinMovimientos }: { c: CeldaCobertura; sinMovimientos: boolean }) {
  if (c.estado === "falta") {
    return (
      <div title="No hay archivo de esta cuenta para este mes" className="rounded border border-divisor px-2 py-1.5">
        <EtiquetaEstado estado="sin_informacion" texto="Falta" />
        <span className="mt-1 block text-xs text-suave">sin archivo</span>
      </div>
    );
  }
  if (c.estado === "error" || c.estado === "sin_sociedad") {
    const motivo = c.error ?? "Sin motivo registrado";
    const contenido = (
      <>
        <EtiquetaEstado estado={c.estado === "error" ? "vencido" : "por_revisar"} texto={c.estado === "error" ? "Error" : "Sin sociedad"} />
        <span className="mt-1 block text-xs line-clamp-2">{motivo}</span>
      </>
    );
    // Cada celda con problema enlaza a su motivo en el detalle de abajo (ahí está el mismo archivo).
    return c.archivoId !== undefined ? (
      <a href={`#archivo-${c.archivoId}`} title={motivo} className="block rounded border border-control px-2 py-1.5">
        {contenido}
        <span className="block text-xs underline">Ver motivo</span>
      </a>
    ) : (
      <div title={motivo} className="rounded border border-control px-2 py-1.5">
        {contenido}
      </div>
    );
  }
  if (c.imagenNoLegible) {
    return (
      <div title="Los movimientos vienen como imagen y no se pueden leer" className="rounded border border-control px-2 py-1.5">
        <EtiquetaEstado estado="sin_informacion" texto="Imagen no legible" />
      </div>
    );
  }
  return (
    <div title={`Formato ${c.formato ?? "?"}${c.duplicados > 0 ? ` · ${c.duplicados} repetidos en otro archivo` : ""}${c.saldoMotivo ? ` · ${c.saldoMotivo}` : ""}`} className="rounded border border-control px-2 py-1.5">
      {!sinMovimientos && <span className="font-semibold">{c.movimientos === 0 ? "Sin movimientos" : `${numero(c.movimientos)} mov.`}</span>}
      {sinMovimientos ? (
        <span className="block">
          <EtiquetaEstado estado="proyectado" texto="Sin movimientos" />
        </span>
      ) : (
        c.saldo !== undefined && (
        <span className="mt-1 block">
          <EtiquetaEstado estado={ESTADO_SALDO[c.saldo] ?? "proyectado"} texto={TEXTO_SALDO[c.saldo] ?? "Saldo sin comprobar"} />
        </span>
        )
      )}
    </div>
  );
}

function Resumen({ r, cuentas, activa, alTocar }: { r: Importaciones["resumen"]; cuentas: Record<string, number>; activa: string | null; alTocar: (clave: string) => void }) {
  // Archivos = Leídos + Con error + Sin sociedad. Los retirados de la carpeta no cuentan y tienen su propia tarjeta.
  // Cada tarjeta toma un estado que ya existe con su texto propio; los totales son neutrales (Programado) y lo que está en cero no alerta.
  // Las tarjetas con `clave` filtran los grupos de abajo; su número sale de la misma lista de archivos (lib/filtro-tarjetas).
  const items: { clave?: string; titulo: string; n: number; nota?: string; estado: EstadoVencimiento; texto: string }[] = [
    { titulo: "Archivos", n: r.archivos, nota: "leídos + con error + sin sociedad", estado: "proyectado", texto: "Total" },
    { clave: "leidos", titulo: "Leídos", n: cuentas.leidos!, estado: "pagado", texto: "Leídos" },
    { clave: "con_error", titulo: "Con error", n: cuentas.con_error!, ...(cuentas.con_error! > 0 ? { estado: "vencido" as const, texto: "Con error" } : { estado: "proyectado" as const, texto: "Sin errores" }) },
    { clave: "sin_sociedad", titulo: "Sin sociedad", n: cuentas.sin_sociedad!, ...(cuentas.sin_sociedad! > 0 ? { estado: "por_revisar" as const, texto: "Requiere decisión" } : { estado: "proyectado" as const, texto: "Completo" }) },
    ...(cuentas.retirados! > 0 ? [{ clave: "retirados", titulo: "Retirados de la carpeta", n: cuentas.retirados!, nota: "no cuentan en los totales", estado: "proyectado" as const, texto: "Informativo" }] : []),
    { titulo: "Movimientos", n: r.movimientos, estado: "proyectado", texto: "Total" },
  ];
  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((t) => (
        <li key={t.titulo}>
          <Tarjeta titulo={t.titulo} filtro={t.clave ? { activa: activa === t.clave, alTocar: () => alTocar(t.clave!) } : undefined} acento={ACENTO_ESTADO[t.estado]} icono={<IconoEstado estado={t.estado} />} insignia={<EtiquetaEstado estado={t.estado} texto={t.texto} />} detalle={t.nota}>
            {numero(t.n)}
          </Tarjeta>
        </li>
      ))}
    </ul>
  );
}

interface FilaAtencion {
  ruta: string;
  texto?: string;
  /** el saldo en tres partes (qué pasó, qué significa, qué hacer) */
  saldo?: TextoSaldo;
  id?: number;
  /** muestra «Ver información completa» */
  verInfo?: boolean;
}

/** Cada grupo toma el estado visual que ya existe (ícono, color y borde) con un texto propio; los estados de vencimiento no se reescriben. */
function ListaAtencion({ titulo, ayuda, vacio, filas, estado, etiqueta, alVer, ocultarVacio }: { titulo: string; ayuda: string; vacio: string; filas: FilaAtencion[]; estado: EstadoVencimiento; etiqueta: string; alVer: (id: number) => void; ocultarVacio?: boolean }) {
  if (ocultarVacio && filas.length === 0) return null;
  return (
    <section className="mt-8" aria-label={titulo}>
      <h3 className="flex flex-wrap items-center gap-2.5 font-bold">
        <EtiquetaEstado estado={estado} texto={etiqueta} />
        <span>{titulo} <span className="font-normal text-suave">({filas.length})</span></span>
      </h3>
      <p className="mt-1 text-sm text-suave max-w-2xl">{ayuda}</p>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm">{vacio}</p>
      ) : (
        <FilasArchivos filas={filas} alVer={alVer} />
      )}
    </section>
  );
}
function FilasArchivos({ filas, alVer }: { filas: FilaAtencion[]; alVer: (id: number) => void }) {
  return (
    <ul className="mt-3 divide-y divide-divisor border border-divisor rounded">
      {filas.map((f, i) => (
        <li key={f.ruta + i} id={f.id !== undefined ? `archivo-${f.id}` : undefined} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2 text-sm scroll-mt-4 target:bg-fondo-suave">
          <div className="min-w-0 flex-1">
            <span className="font-medium break-all">{f.ruta}</span>
            {f.saldo ? <TextoSaldoTres saldo={f.saldo} /> : f.texto && <span className="block text-suave">{f.texto}</span>}
          </div>
          {f.verInfo && f.id !== undefined && (
            <button type="button" onClick={() => alVer(f.id!)} aria-label={`Ver información completa de ${f.ruta}`} className="whitespace-nowrap rounded-lg border border-texto bg-fondo px-3.5 py-2 text-[13px] font-semibold hover:bg-fondo-suave">
              Ver información completa
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Una línea informativa (estado neutral Programado, con su texto propio) con el detalle plegado: lo que no pide acción no ocupa la pantalla. */
function LineaInformativa({ texto, ayuda, vacio, filas, etiqueta, alVer, ocultarVacio }: { texto: string; ayuda: string; vacio: string; filas: FilaAtencion[]; etiqueta: string; alVer: (id: number) => void; ocultarVacio?: boolean }) {
  if (ocultarVacio && filas.length === 0) return null;
  return (
    <div className="mt-3 max-w-3xl">
      <p className="flex flex-wrap items-center gap-2.5 text-sm">
        <EtiquetaEstado estado="proyectado" texto={etiqueta} />
        <span>
          <strong>{texto}</strong> <span className="text-suave">({numero(filas.length)})</span>
        </span>
      </p>
      {filas.length === 0 ? (
        <p className="mt-1 text-sm text-suave">{vacio}</p>
      ) : (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm underline">Ver el detalle</summary>
          <p className="mt-2 text-sm text-suave">{ayuda}</p>
          <FilasArchivos filas={filas} alVer={alVer} />
        </details>
      )}
    </div>
  );
}


function Atencion({ archivos, tarjeta, destino }: { archivos: ArchivoImportado[]; tarjeta: string | null; destino: RefObject<HTMLElement | null> }) {
  // Con una tarjeta activa solo se muestran los grupos que tienen archivos de esa tarjeta.
  const ocultarVacio = tarjeta !== null;
  const [verId, setVerId] = useState<number | null>(null);
  const errores = archivos.filter((a) => a.estado === "con_error");
  const sinSociedad = archivos.filter((a) => a.estado === "sin_sociedad");
  const retirados = archivos.filter((a) => a.estado === "retirado");
  const vigentes = archivos.filter((a) => a.estado === "leido" && a.saldo !== null);
  // Imagen no legible y sin movimientos tienen su propio grupo: no se cuentan además como saldo no cuadra ni no verificable.
  const imagenNoLegible = vigentes.filter((a) => a.imagenNoLegible);
  const sinMovimientos = vigentes.filter((a) => a.sinMovimientos && !a.imagenNoLegible);
  const conMovimientos = vigentes.filter((a) => !a.sinMovimientos && !a.imagenNoLegible);
  const saldo = conMovimientos.filter((a) => a.saldo!.resultado === "no_cuadra");
  const noVerificable = conMovimientos.filter((a) => a.saldo!.resultado === "no_verificable");
  const cuadran = conMovimientos.filter((a) => a.saldo!.resultado === "cuadra");
  const nombre = archivos.filter((a) => a.estado !== "retirado" && a.discrepancias.length > 0);
  return (
    <>
      <h2 ref={destino as RefObject<HTMLHeadingElement | null>} className="mt-12 scroll-mt-4 text-lg font-bold border-b-2 border-acento pb-1">Archivos que requieren atención</h2>
      <ListaAtencion
        titulo="Archivos con error"
        ayuda="No se pudieron leer. El resto de la importación continuó con normalidad."
        vacio="Todos los archivos se leyeron."
        estado="vencido"
        etiqueta="Con error"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={errores.map((a) => ({ id: a.id, ruta: a.archivo, texto: a.motivo ?? "Sin motivo registrado" }))}
      />
      <ListaAtencion
        titulo="Archivos sin sociedad"
        ayuda="La carpeta del archivo no tiene una sociedad asignada, así que no se leyó. Se lee cuando la carpeta tenga sociedad."
        vacio="Todas las carpetas tienen sociedad."
        estado="por_revisar"
        etiqueta="Requiere decisión"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={sinSociedad.map((a) => ({ id: a.id, ruta: a.archivo, texto: a.motivo ?? "La carpeta no tiene una sociedad asignada" }))}
      />
      {(tarjeta === null || tarjeta === "leidos") && (
      <>
      <h3 className="mt-8 font-bold">Comprobación del saldo</h3>
      <p className="mt-1 text-sm text-suave max-w-2xl">{'El saldo comprueba que el estado de cuenta está completo. Si no cuadra, la sociedad queda en "Sin información" en lugar de "Vencido".'}</p>
      <p className="mt-2 text-sm" aria-label="Resultado del saldo">
        <span className="font-bold">Resultado del saldo de los archivos leídos:</span> {numero(cuadran.length)} cuadran · {numero(saldo.length)} no cuadran · {numero(noVerificable.length)} no se pueden verificar{imagenNoLegible.length > 0 && ` · ${numero(imagenNoLegible.length)} con imagen no legible`}
      </p>
      </>
      )}
      <ListaAtencion
        titulo="Archivos donde el saldo no cuadra"
        ayuda="El saldo anterior más créditos y menos débitos no coincide con el saldo siguiente. Un archivo así no cuenta como estado de cuenta completo: los pagos de esa sociedad quedan en «Sin información» hasta revisarlo."
        vacio="El saldo cuadra en todos los archivos que se pueden verificar."
        estado="sin_informacion"
        etiqueta="Sin información"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={saldo.map((a) => ({
          id: a.id,
          ruta: a.archivo,
          saldo: a.saldo!,
        }))}
      />
      <ListaAtencion
        titulo="Archivos con imagen no legible"
        ayuda="Los movimientos vienen como imagen y el sistema no puede leerlos. Estos archivos no cuentan como estado de cuenta: los pagos de esa sociedad quedan en «Sin información» hasta cargar uno legible."
        vacio="No hay archivos con imagen no legible."
        estado="sin_informacion"
        etiqueta="Sin información"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={imagenNoLegible.map((a) => ({ id: a.id, ruta: a.archivo, saldo: a.saldo!, verInfo: true }))}
      />
      <ListaAtencion
        titulo="Nombre del archivo distinto del contenido"
        ayuda="La cuenta, el mes o la sociedad del nombre no coinciden con lo que trae el archivo."
        vacio="Los nombres coinciden con el contenido."
        estado="por_revisar"
        etiqueta="Por revisar"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={nombre.flatMap((a) => a.discrepancias.map((d) => ({ ruta: a.archivo, texto: d.mensaje })))}
      />
      <h3 className="mt-10 font-bold">Para su información</h3>
      <p className="mt-1 text-sm text-suave max-w-2xl">No piden ninguna acción. Despliegue cada línea para ver los archivos.</p>
      <LineaInformativa
        texto="Archivos retirados de la carpeta"
        ayuda="Ya no están en la carpeta. Se conservan con su historial, pero no cuentan en totales ni cobertura. Si vuelven a aparecer, se reactivan."
        vacio="Todos los archivos registrados siguen en la carpeta."
        etiqueta="Retirados"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={retirados.map((a) => ({ id: a.id, ruta: a.archivo, texto: "Retirado de la carpeta" }))}
      />
      {sinMovimientos.length > 0 && (
        <LineaInformativa
          texto="Archivos sin movimientos"
          ayuda="Estos archivos no traen movimientos del mes. Se entiende que la cuenta no tuvo actividad y cuentan como cobertura."
          vacio=""
          etiqueta="Sin movimientos"
          alVer={setVerId}
        ocultarVacio={ocultarVacio}
          filas={sinMovimientos.map((a) => ({ id: a.id, ruta: a.archivo, saldo: a.saldo!, verInfo: true }))}
        />
      )}
      <LineaInformativa
        texto="Archivos con saldo no verificable"
        ayuda="No se puede comprobar el saldo de estos archivos. La cobertura sigue por fechas."
        vacio="El saldo se pudo comprobar en todos los archivos."
        etiqueta="Sin cambio en la cobertura"
        alVer={setVerId}
        ocultarVacio={ocultarVacio}
        filas={noVerificable.map((a) => ({ id: a.id, ruta: a.archivo, saldo: a.saldo!, verInfo: true }))}
      />
      {verId !== null && <FichaArchivo id={verId} sinMovimientos={sinMovimientos.some((a) => a.id === verId)} alCerrar={() => setVerId(null)} />}
    </>
  );
}

export function PanelArchivos() {
  const [imp, setImp] = useState<Importaciones | null>(null);
  const [cob, setCob] = useState<Cobertura | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [sociedad, setSociedad] = useState("");
  const tarjeta = useFiltroTarjeta();

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
  // El número de cada tarjeta y los archivos que deja su filtro salen de la misma lista y la misma regla (lib/filtro-tarjetas).
  const porTarjeta = useMemo(() => contarPorTarjeta(imp?.datos ?? [], TARJETAS_ARCHIVOS), [imp]);
  const archivosVisibles = useMemo(() => filtrarPorTarjeta(imp?.datos ?? [], TARJETAS_ARCHIVOS, tarjeta.activa), [imp, tarjeta.activa]);
  const { activa: tarjetaActiva, limpiar: limpiarTarjeta } = tarjeta;
  // Si la tarjeta activa dejó de existir (p. ej. ya no hay retirados), se quita el filtro.
  useEffect(() => {
    if (tarjetaActiva !== null && !porTarjeta[tarjetaActiva]) limpiarTarjeta();
  }, [tarjetaActiva, porTarjeta, limpiarTarjeta]);
  const idsSinMovimientos = useMemo(() => new Set((imp?.datos ?? []).filter((a) => a.sinMovimientos).map((a) => a.id)), [imp]);
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
      <Resumen r={imp.resumen} cuentas={porTarjeta} activa={tarjeta.activa} alTocar={tarjeta.alternar} />

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
                    <td key={m} className="px-2 py-2 min-w-44">
                      <Celda c={f.celdas[m]!} sinMovimientos={idsSinMovimientos.has(f.celdas[m]!.archivoId ?? -1)} />
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

      <Atencion archivos={archivosVisibles} tarjeta={tarjeta.activa} destino={tarjeta.destino} />
    </>
  );
}
