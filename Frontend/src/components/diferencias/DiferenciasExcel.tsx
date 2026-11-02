"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import {
  AYUDA_ACCION, limitesDeDesdeMes, periodoActual, TEXTO_ACCION, TEXTO_DECIDIDA, TIPOS_DIFERENCIA, textoDia,
} from "@/lib/formato";
import type { AccionDiferencia, DatosDiferencia, FilaDiferencia, RespuestaDiferencias, TipoDiferencia } from "@/lib/tipos";
import { CajaFiltros } from "../CajaFiltros";
import { Ficha } from "../Ficha";
import { LineaAlcance } from "../LineaAlcance";
import { EtiquetaEstado, IconoEstado } from "../pagos/EstadoPago";
import { ACENTO_ESTADO, Tarjeta } from "../pagos/TarjetaEstado";
import { SelectorMes } from "../SelectorFechas";
import { SelectorSociedad } from "../SelectorSociedad";
import { Campo, CajaError, claseBoton, claseBotonSecundario, claseControl, Etiqueta } from "../ui";
import { claseBotonTabla, claseCelda, claseContenedorTabla, claseEncabezadoTabla, claseFila, claseTabla, claseTh, FiltroConEtiqueta } from "../estilo-tabla";

const MENSAJE_MOTIVO = "Indique el motivo (entre 3 y 300 caracteres)";
const motivoValido = (m: string) => m.trim().length >= 3 && m.trim().length <= 300;

/** Lo que dice una de las dos partes: proveedor, identificador enmascarado y día. */
function Datos({ d, vacio }: { d: DatosDiferencia | null; vacio: string }) {
  if (!d) return <span className="text-suave">{vacio}</span>;
  return (
    <>
      <span className="block font-semibold">{d.proveedor}</span>
      <span className="block font-mono text-xs text-suave">{d.identificador}</span>
      <span className="block text-xs text-suave">{textoDia(d.dia)}</span>
    </>
  );
}

/**
 * Diferencias con el Excel: lo que el Excel del catálogo dice y la plataforma no tiene igual. El Excel es la fuente principal, pero nada se pisa:
 * aquí una persona decide cada diferencia. El alcance, los filtros y los permisos los resuelve el servidor.
 */
export function DiferenciasExcel() {
  const [tipo, setTipo] = useState<TipoDiferencia | "">("");
  const [estado, setEstado] = useState<"pendiente" | "decidida" | "">("pendiente");
  const [sociedad, setSociedad] = useState("");
  const [respuesta, setRespuesta] = useState<RespuestaDiferencias | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gestionando, setGestionando] = useState<FilaDiferencia | null>(null);
  const [intento, setIntento] = useState(0);
  const idSociedad = useId();

  const cargar = useCallback(() => {
    api
      .diferenciasExcel({ sociedadId: sociedad ? Number(sociedad) : undefined, tipo: tipo || undefined, estado: estado || undefined })
      .then((r) => (setRespuesta(r), setError(null)))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar las diferencias"));
  }, [sociedad, tipo, estado]);
  useEffect(() => {
    cargar();
  }, [cargar, intento]);

  if (error) return <CajaError mensaje={error} alReintentar={() => setIntento((n) => n + 1)} />;
  if (!respuesta) return <p role="status" className="mt-6 text-suave">Cargando…</p>;

  // las sociedades que tienen algo en la lista (para el filtro; con una sola no hay nada que elegir)
  const sociedades = [...new Map(respuesta.datos.map((f) => [f.sociedadId, f.sociedad])).entries()].map(([id, nombre]) => ({ valor: String(id), nombre }));

  return (
    <>
      <LineaAlcance alcance={respuesta.alcance} />
      {!respuesta.disponible && (
        <p role="status" className="mt-4 rounded border-l-4 border-acento bg-fondo-suave p-3 text-sm font-semibold">
          No se pudo leer la tabla de pagos frecuentes: no hay diferencias que mostrar.
        </p>
      )}

      <section aria-labelledby="h-tipos" className="mt-6">
        <h2 id="h-tipos" className="border-b-2 border-acento pb-1 text-lg font-bold">Qué difiere</h2>
        <p className="mt-2 max-w-3xl text-sm text-suave">Toque una tarjeta para ver solo ese tipo; vuelva a tocarla para quitar el filtro.</p>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TIPOS_DIFERENCIA.map((t) => {
            const n = respuesta.resumen[t.tipo];
            const activa = tipo === t.tipo;
            const e = n > 0 ? ("por_revisar" as const) : ("proyectado" as const);
            return (
              <li key={t.tipo}>
                <Tarjeta
                  titulo={t.titulo} acento={ACENTO_ESTADO[e]} icono={<IconoEstado estado={e} />}
                  insignia={<EtiquetaEstado estado={e} texto={n > 0 ? "Requiere decisión" : "Sin pendientes"} />} detalle={t.ayuda}
                  filtro={{ activa, alTocar: () => setTipo(activa ? "" : t.tipo), desactivada: n === 0 && !activa }}
                >
                  {n.toLocaleString("es-CR")}
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      </section>

      <CajaFiltros etiqueta="Filtros de las diferencias">
        {sociedades.length > 1 || sociedad ? (
          <FiltroConEtiqueta id={idSociedad} etiqueta="Sociedad">
            <div className="w-72">
              <SelectorSociedad id={idSociedad} opciones={sociedades} valor={sociedad} alCambiar={setSociedad} textoTodas="Todas las sociedades" />
            </div>
          </FiltroConEtiqueta>
        ) : null}
        <FiltroConEtiqueta id="dif-estado" etiqueta="Estado">
          <select id="dif-estado" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className={`${claseControl} text-sm`}>
            <option value="pendiente">Pendiente</option>
            <option value="decidida">Decidida</option>
            <option value="">Todos</option>
          </select>
        </FiltroConEtiqueta>
      </CajaFiltros>

      {respuesta.datos.length === 0 ? (
        <p className="mt-6 text-suave">{respuesta.disponible ? "No hay diferencias con este filtro." : ""}</p>
      ) : (
        <div className={claseContenedorTabla}>
          <table className={claseTabla}>
            <caption className="sr-only">Diferencias entre el Excel y la plataforma</caption>
            <thead className={claseEncabezadoTabla}>
              <tr>
                <th scope="col" className={claseTh}>Sociedad</th>
                <th scope="col" className={claseTh}>Qué difiere</th>
                <th scope="col" className={claseTh}>Plataforma</th>
                <th scope="col" className={claseTh}>Excel</th>
                <th scope="col" className={claseTh}>Estado</th>
                <th scope="col" className={`${claseTh} text-right`}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {respuesta.datos.map((f) => (
                <tr key={f.clave} className={claseFila}>
                  <td className={claseCelda}>{f.sociedad}</td>
                  <td className={claseCelda}>{TIPOS_DIFERENCIA.find((t) => t.tipo === f.tipo)?.difiere}</td>
                  <td className={claseCelda}><Datos d={f.plataforma} vacio="—" /></td>
                  <td className={claseCelda}><Datos d={f.excel} vacio="No aparece" /></td>
                  <td className={claseCelda}>
                    <Etiqueta tono={f.estado === "pendiente" ? "ambar" : "suave"} icono={f.estado === "decidida" ? <IconoEstado estado="pagado" /> : undefined}>
                      {f.estado === "pendiente" ? "Pendiente" : "Decidida"}
                    </Etiqueta>
                    {f.decision && <span className="mt-1 block text-xs text-suave">{TEXTO_DECIDIDA[f.decision.accion]} · {f.decision.quien}</span>}
                  </td>
                  <td className={`${claseCelda} text-right`}>
                    {f.puedeGestionar && (
                      <button type="button" onClick={() => setGestionando(f)} className={claseBotonTabla} aria-label={`Gestionar ${f.plataforma.proveedor} (${f.sociedad})`}>
                        Gestionar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gestionando && (
        <PanelGestionar f={gestionando} alCerrar={() => setGestionando(null)} alResolver={() => (setGestionando(null), setIntento((n) => n + 1))} />
      )}
    </>
  );
}

/** «Gestionar» una diferencia: se elige la acción (solo las que tienen destino) y se pide el motivo; «Usar el del Excel» pide además «Desde el mes». */
function PanelGestionar({ f, alCerrar, alResolver }: { f: FilaDiferencia; alCerrar: () => void; alResolver: () => void }) {
  const [accion, setAccion] = useState<AccionDiferencia | null>(null);
  const [motivo, setMotivo] = useState("");
  const [desdeMes, setDesdeMes] = useState(periodoActual());
  const [pregunta, setPregunta] = useState(false);
  const [aplica, setAplica] = useState<boolean | null>(null);
  const [errores, setErrores] = useState<{ motivo?: string; pregunta?: string; general?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const idMotivo = useId();
  const titulo = f.tipo === "posible_renombre" ? `${f.plataforma.proveedor} y ${f.excel?.proveedor ?? ""}` : f.plataforma.proveedor;

  async function aplicar() {
    if (accion === null) return;
    const nuevos: typeof errores = {};
    if (!motivoValido(motivo)) nuevos.motivo = MENSAJE_MOTIVO;
    if (pregunta && aplica === null) nuevos.pregunta = "Elija una opción";
    setErrores(nuevos);
    if (nuevos.motivo || nuevos.pregunta) return;
    setGuardando(true);
    try {
      await api.resolverDiferencias({
        tipo: f.tipo, claves: [f.clave], accion, motivo: motivo.trim(),
        ...(accion === "usar_excel" ? { desdeMes, ...(aplica === null ? {} : { aplicaAlMesEnCurso: aplica }) } : {}),
      });
      avisar.exito("Diferencia resuelta.");
      alResolver();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo resolver la diferencia";
      const campo = e instanceof ErrorApi ? e.campo : undefined;
      if (campo === "aplicaAlMesEnCurso") setPregunta(true);
      setErrores(campo === "motivo" ? { motivo: mensaje } : campo === "aplicaAlMesEnCurso" ? {} : { general: mensaje });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Ficha etiqueta="Diferencia con el Excel" titulo={titulo} idTitulo="titulo-diferencia" alCerrar={alCerrar}>
      <p className="font-semibold">{TIPOS_DIFERENCIA.find((t) => t.tipo === f.tipo)?.difiere}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-suave">Sociedad</dt>
        <dd className="font-semibold">{f.sociedad}</dd>
        <dt className="text-suave">Plataforma</dt>
        <dd><Datos d={f.plataforma} vacio="—" /></dd>
        <dt className="text-suave">Excel</dt>
        <dd><Datos d={f.excel} vacio="No aparece" /></dd>
      </dl>

      {accion === null ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {f.acciones.map((a) => (
            <button key={a} type="button" onClick={() => setAccion(a)} className={claseBotonSecundario}>{TEXTO_ACCION[a]}</button>
          ))}
        </div>
      ) : (
        <section className="mt-5 border-t border-linea pt-4">
          <h3 className="text-sm font-bold">{TEXTO_ACCION[accion]}</h3>
          <p className="mt-1 text-sm text-suave">{AYUDA_ACCION[accion]}</p>
          {accion === "usar_excel" && (
            <div className="mt-3">
              <span className="font-semibold">Desde el mes</span>
              <div className="mt-1 flex">
                <SelectorMes valor={desdeMes} alCambiar={(m) => (setDesdeMes(m), setPregunta(false), setAplica(null))} limites={limitesDeDesdeMes(periodoActual())} />
              </div>
              <p className="mt-1 text-sm text-suave">Los meses anteriores no cambian.</p>
            </div>
          )}
          {pregunta && (
            <fieldset className="mt-4">
              <legend className="font-semibold">Este mes todavía hay un pago pendiente. ¿El nuevo día también aplica a este mes?</legend>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="radio" name="aplica-mes-dif" className="h-4 w-4" checked={aplica === true} onChange={() => setAplica(true)} />
                Sí, también este mes
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="radio" name="aplica-mes-dif" className="h-4 w-4" checked={aplica === false} onChange={() => setAplica(false)} />
                No, solo desde el mes elegido
              </label>
              {errores.pregunta && <p role="alert" className="mt-1 text-sm font-medium text-rojo">{errores.pregunta}</p>}
            </fieldset>
          )}
          <div className="mt-4">
            <Campo id={idMotivo} etiqueta="Motivo" error={errores.motivo}>
              <input id={idMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={`${claseControl} w-full`} aria-invalid={errores.motivo ? true : undefined} aria-describedby={errores.motivo ? `${idMotivo}-error` : undefined} />
            </Campo>
          </div>
          {errores.general && <p role="alert" className="mt-3 rounded border-2 border-rojo bg-rojo-fondo p-3 font-medium text-rojo">{errores.general}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={aplicar} disabled={guardando} className={claseBoton}>{guardando ? "Guardando…" : TEXTO_ACCION[accion]}</button>
            <button type="button" onClick={() => (setAccion(null), setPregunta(false), setAplica(null), setErrores({}))} className={claseBotonSecundario}>Cancelar</button>
          </div>
        </section>
      )}
    </Ficha>
  );
}
