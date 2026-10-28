import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { relojSistema, type Reloj } from "../domain/reloj.js";
import { actualizarVencimientos } from "../vencimientos/mantenimiento.js";
import { MOTIVO_CARPETA_SIN_SOCIEDAD, MOTIVO_NOMBRE_NO_COINCIDE } from "../domain/estado-archivo.js";
import { clavesDeDeduplicacion } from "./clave-dedup.js";
import { valorGlobal } from "../repositories/parametros.js";
import { ErrorLectura, LECTOR_VERSION, TOLERANCIA_SALDO_DEFECTO, leerEstadoDeCuenta, leerLibro } from "./lector.js";
import { monedaDeIbanBct, parsearNombreArchivo, type NombreArchivo } from "./nombre-archivo.js";
import type { ResultadoLectura } from "./tipos.js";
import {
  ArchivoConConciliaciones, buscarArchivoPorRuta, buscarSociedadPorCodigo, marcarRetirados, reactivarArchivo,
  guardarArchivoConError, guardarArchivoEnRevision, guardarArchivoLeido, guardarCuenta, type ArchivoParaGuardar,
} from "../repositories/importaciones.js";
import { completarControlDesdePendientes } from "../repositories/obligaciones.js";

export type EstadoArchivo = "leido" | "error" | "sin_cambios" | "en_revision";

// Motivos fijos por los que un archivo queda "en revisión": ver domain/estado-archivo.ts.
export { MOTIVO_CARPETA_SIN_SOCIEDAD, MOTIVO_NOMBRE_NO_COINCIDE };
export type OrigenMoneda = "archivo" | "iban" | "otro_mes" | "desconocida";

export interface ResumenArchivo {
  ruta: string; // relativa a STATEMENTS_ROOT
  sociedad: string;
  formato: string | null;
  estado: EstadoArchivo;
  movimientos: number;
  duplicados: number;
  error?: string;
}

export interface ResumenImportacion {
  archivos: ResumenArchivo[];
  leidos: number;
  conError: number;
  enRevision: number;
  sinCambios: number;
  /** archivos registrados que ya no están en la carpeta (se marcan «Retirado de la carpeta», no se borran) */
  retirados: number;
  movimientos: number;
  duplicados: number;
}

// Una sola importación a la vez.
let enCurso = false;
export const hayImportacionEnCurso = () => enCurso;

const CARPETAS_EXCLUIDAS = new Set(["resultados"]);

interface Candidato {
  ruta: string; // relativa, con "/"
  rutaAbsoluta: string;
  carpeta: string; // sociedad según la carpeta
  nombre: NombreArchivo | null;
}

/** Subcarpetas inmediatas de la raíz (una por sociedad) con sus .xlsx. No entra en "resultados" ni toca archivos de la raíz. */
export async function listarCandidatos(raiz: string): Promise<Candidato[]> {
  const out: Candidato[] = [];
  for (const d of await readdir(raiz, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".") || CARPETAS_EXCLUIDAS.has(d.name.toLowerCase())) continue;
    const dir = path.join(raiz, d.name);
    for (const f of await readdir(dir, { withFileTypes: true })) {
      if (!f.isFile() || !/\.xlsx$/i.test(f.name) || f.name.startsWith("~$")) continue;
      out.push({ ruta: `${d.name}/${f.name}`, rutaAbsoluta: path.join(dir, f.name), carpeta: d.name.toUpperCase(), nombre: parsearNombreArchivo(f.name) });
    }
  }
  return out.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

interface Lectura {
  cand: Candidato;
  sociedadId: number;
  hash: string;
  resultado?: ResultadoLectura;
  error?: string;
}

export async function importarCarpeta(raiz: string, reloj: Reloj = relojSistema): Promise<ResumenImportacion> {
  if (enCurso) throw new Error("Ya hay una importación en curso");
  enCurso = true;
  try {
    const resumen = await ejecutar(raiz);
    await completarControlDesdePendientes(); // los estados nuevos pueden definir «Control desde» de obligaciones que aún no lo tienen
    await actualizarVencimientos(reloj); // calendario y cruce con los estados de cuenta nuevos
    return resumen;
  } finally {
    enCurso = false;
  }
}

async function ejecutar(raiz: string): Promise<ResumenImportacion> {
  const candidatos = await listarCandidatos(raiz);
  const resumen: ResumenImportacion = { archivos: [], leidos: 0, conError: 0, enRevision: 0, sinCambios: 0, retirados: 0, movimientos: 0, duplicados: 0 };
  // Un archivo registrado que ya no está en la carpeta se marca retirado; si vuelve a estar, se reactiva (ver más abajo).
  resumen.retirados = await marcarRetirados(candidatos.map((c) => c.ruta));

  // Fase 1: sociedad, hash y lectura. La sociedad y el nombre se comprueban ANTES de abrir el archivo.
  // Un archivo con error se marca y se sigue con los demás.
  const lecturas: Lectura[] = [];
  const tolerancia = Number(await valorGlobal("tolerancia_saldo"));
  const toleranciaSaldo = Number.isInteger(tolerancia) && tolerancia >= 0 ? tolerancia : TOLERANCIA_SALDO_DEFECTO;
  const sociedades = new Map<string, Awaited<ReturnType<typeof buscarSociedadPorCodigo>>>();
  for (const cand of candidatos) {
    if (!sociedades.has(cand.carpeta)) sociedades.set(cand.carpeta, await buscarSociedadPorCodigo(cand.carpeta));
    const sociedad = sociedades.get(cand.carpeta) ?? null;
    const enRevision = async (motivo: string) => {
      await guardarArchivoEnRevision({ ruta: cand.ruta, hash: "", formato: null, mes: cand.nombre?.periodo ?? null, sociedadId: sociedad?.id ?? null, cuentaId: null }, motivo);
      resumen.enRevision++;
      resumen.archivos.push({ ruta: cand.ruta, sociedad: cand.carpeta, formato: null, estado: "en_revision", movimientos: 0, duplicados: 0, error: motivo });
    };
    if (!sociedad) { await enRevision(MOTIVO_CARPETA_SIN_SOCIEDAD); continue; }
    if (cand.nombre && cand.nombre.sociedad !== cand.carpeta) { await enRevision(MOTIVO_NOMBRE_NO_COINCIDE); continue; }
    let hash = "";
    try {
      const contenido = await readFile(cand.rutaAbsoluta);
      hash = createHash("sha256").update(contenido).digest("hex");
      const previo = await buscarArchivoPorRuta(cand.ruta);
      if (previo && previo.hash === hash && previo.estado === "leido" && versionDe(previo.detalle) === LECTOR_VERSION) {
        if (previo.retiradoEn) await reactivarArchivo(cand.ruta);
        resumen.sinCambios++;
        resumen.archivos.push({ ruta: cand.ruta, sociedad: cand.carpeta, formato: previo.formato, estado: "sin_cambios", movimientos: previo.numMovimientos, duplicados: previo.numDuplicados });
        continue;
      }
      if (!cand.nombre) throw new ErrorLectura("El nombre no cumple la convención «<IBAN> <MMAA> <SOCIEDAD>.xlsx»");
      const resultado = leerEstadoDeCuenta(await leerLibro(contenido), cand.nombre, { toleranciaSaldo });
      lecturas.push({ cand, sociedadId: sociedad.id, hash, resultado });
    } catch (e) {
      lecturas.push({ cand, sociedadId: sociedad.id, hash, error: e instanceof ErrorLectura ? e.message : "Error inesperado al leer el archivo" });
    }
  }

  // Fase 2: moneda por cuenta (archivo > IBAN BCT > otro mes). Se marca "por confirmar" si no vino explícita.
  const explicitaPorCuenta = new Map<string, Set<string>>();
  for (const l of lecturas) {
    if (l.resultado?.monedaArchivo && l.cand.nombre) {
      const k = clave(l.cand);
      (explicitaPorCuenta.get(k) ?? explicitaPorCuenta.set(k, new Set()).get(k)!).add(l.resultado.monedaArchivo);
    }
  }

  // Fase 3: persistencia.
  for (const l of lecturas) {
    const { cand, hash } = l;
    const base = { ruta: cand.ruta, hash, formato: l.resultado?.formato ?? null, mes: cand.nombre?.periodo ?? null };
    const sociedadId = l.sociedadId;
    const archivoBase: ArchivoParaGuardar = { ...base, sociedadId, cuentaId: null };
    if (l.error || !l.resultado || !cand.nombre) {
      await guardarArchivoConError(archivoBase, l.error ?? "Error desconocido", { discrepancias: [], advertencias: [] });
      resumen.conError++;
      resumen.archivos.push({ ruta: cand.ruta, sociedad: cand.carpeta, formato: null, estado: "error", movimientos: 0, duplicados: 0, error: l.error });
      continue;
    }
    const r = l.resultado;
    const nombre = cand.nombre;
    const advertencias = [...r.advertencias];
    const discrepancias = [...r.discrepancias];

    // moneda de este archivo y de la cuenta
    const explicitas = explicitaPorCuenta.get(clave(cand)) ?? new Set<string>();
    const porIban = monedaDeIbanBct(nombre.cuenta);
    let monedaArchivo: "CRC" | "USD" | null = r.monedaArchivo;
    let origen: OrigenMoneda = "archivo";
    if (!monedaArchivo) {
      if (porIban) { monedaArchivo = porIban; origen = "iban"; }
      else if (explicitas.size > 0) { monedaArchivo = [...explicitas][0] as "CRC" | "USD"; origen = "otro_mes"; }
      else origen = "desconocida";
    } else if (porIban && porIban !== monedaArchivo) {
      advertencias.push(`La moneda del archivo (${monedaArchivo}) difiere de la que sugiere el IBAN (${porIban})`);
    }
    if (explicitas.size > 1) advertencias.push("Los archivos de esta cuenta declaran monedas distintas");
    const monedaCuenta = (explicitas.size > 0 ? ([...explicitas][0] as "CRC" | "USD") : porIban) ?? null;

    const cuenta = await guardarCuenta({
      sociedadId, numero: nombre.cuenta, codigoBanco: nombre.codigoBanco, formato: r.formato,
      bancoArchivo: r.bancoArchivo, moneda: monedaCuenta, monedaPorConfirmar: explicitas.size === 0,
    });
    const claves = clavesDeDeduplicacion(cuenta.id, r.movimientos);
    const movs = r.movimientos.map((m, i) => ({ ...m, claveDedup: claves[i]! }));
    const detalle = {
      versionLector: LECTOR_VERSION, continuidad: r.continuidad, saldoInicial: r.saldoInicial, saldoFinal: r.saldoFinal, fechas: r.fechas, periodoDeclarado: r.periodoDeclarado, advertencias, discrepancias, filasPieIgnoradas: r.filasPieIgnoradas, conImagenes: r.conImagenes,
      monedaOrigen: origen, moneda: monedaArchivo, hojaLeida: r.hoja, filaEncabezado: r.filaEncabezado,
    };
    try {
      const { duplicados } = await guardarArchivoLeido(
        { ...archivoBase, cuentaId: cuenta.id, formato: r.formato },
        movs, { moneda: monedaArchivo, detalle },
      );
      resumen.leidos++;
      resumen.movimientos += movs.length;
      resumen.duplicados += duplicados;
      resumen.archivos.push({ ruta: cand.ruta, sociedad: cand.carpeta, formato: r.formato, estado: "leido", movimientos: movs.length, duplicados });
    } catch (e) {
      const msg = e instanceof ArchivoConConciliaciones ? e.message : "No se pudo guardar el archivo en la base de datos";
      await guardarArchivoConError({ ...archivoBase, cuentaId: cuenta.id, formato: r.formato }, msg, detalle);
      resumen.conError++;
      resumen.archivos.push({ ruta: cand.ruta, sociedad: cand.carpeta, formato: r.formato, estado: "error", movimientos: 0, duplicados: 0, error: msg });
    }
  }
  return resumen;
}

function versionDe(detalle: string | null): number | null {
  try {
    return detalle ? (JSON.parse(detalle).versionLector ?? null) : null;
  } catch {
    return null;
  }
}

const clave = (c: Candidato) => `${c.carpeta}|${c.nombre?.cuenta}`;
