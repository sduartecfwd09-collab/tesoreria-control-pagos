// Carga de la lista maestra de sociedades y sus tesoreros desde un Excel de Tesorería.
// Hoja 1, encabezados en la fila 4 (A = «Nombre sociedad», B = «Tesorero»), datos desde la fila 5.
// Reglas: una sociedad existente (por nombre normalizado o por alias) nunca se modifica; la que no existe se crea
// sin abreviatura; el tesorero debe ser un usuario ya cargado (esta carga no crea usuarios). Se puede repetir.
// El informe solo trae conteos: nunca nombres de sociedades ni de personas.
import { readFile } from "node:fs/promises";
import { codigoPorAlias } from "../config/alias-sociedades.js";
import { normalizarNombreSociedad } from "../domain/sociedades.js";
import { ErrorLectura, leerLibro, type LibroLeido } from "../ingest/lector.js";
import { normalizar, valorPlano } from "../ingest/utiles.js";
import { asignarTesorero, crearSociedadSinAbreviatura, listarSociedadesParaCarga } from "../repositories/sociedades.js";
import { buscarUsuarioPorNombre } from "../repositories/usuarios.js";

const FILA_ENCABEZADOS = 4;
const PRIMERA_FILA_DATOS = 5;

export interface FilaSociedad {
  fila: number;
  nombre: string;
  tesorero: string;
}

export interface InformeSociedades {
  filasLeidas: number;
  existentes: number;
  creadas: number;
  /** tesoreros distintos encontrados entre los usuarios */
  tesorerosEncontrados: number;
  /** filas cuyo tesorero no es un usuario del sistema (la sociedad queda sin asignar) */
  tesoreroSinUsuario: number;
  filasSinTesorero: number;
  asignacionesNuevas: number;
  cambiosDeTesorero: number;
  sinCambioDeTesorero: number;
  /** cantidad de sociedades de cada tesorero, de mayor a menor (sin nombres) */
  sociedadesPorTesorero: number[];
  sociedadesEnBase: number;
  ignoradas: Record<string, number>; // motivo -> filas
}

const texto = (v: unknown): string => {
  const p = valorPlano(v);
  return p === null || p instanceof Date ? "" : String(p).replace(/\s+/g, " ").trim();
};

export function leerListaSociedades(libro: LibroLeido): FilaSociedad[] {
  const hoja = libro.wb.worksheets[0];
  if (!hoja) throw new ErrorLectura("El libro no tiene hojas");
  const a = normalizar(hoja.getCell(FILA_ENCABEZADOS, 1).value);
  const b = normalizar(hoja.getCell(FILA_ENCABEZADOS, 2).value);
  if (a !== "nombre sociedad" || b !== "tesorero") {
    throw new ErrorLectura(`Los encabezados esperados en la fila ${FILA_ENCABEZADOS} (columnas A y B) no coinciden con «Nombre sociedad» y «Tesorero»`);
  }
  const filas: FilaSociedad[] = [];
  for (let n = PRIMERA_FILA_DATOS; n <= hoja.rowCount; n++) {
    const f = { fila: n, nombre: texto(hoja.getCell(n, 1).value), tesorero: texto(hoja.getCell(n, 2).value) };
    if (f.nombre || f.tesorero) filas.push(f);
  }
  return filas;
}

export async function cargarSociedades(filas: FilaSociedad[]): Promise<InformeSociedades> {
  const informe: InformeSociedades = {
    filasLeidas: filas.length, existentes: 0, creadas: 0, tesorerosEncontrados: 0, tesoreroSinUsuario: 0, filasSinTesorero: 0,
    asignacionesNuevas: 0, cambiosDeTesorero: 0, sinCambioDeTesorero: 0, sociedadesPorTesorero: [], sociedadesEnBase: 0, ignoradas: {},
  };
  const ignorar = (motivo: string) => { informe.ignoradas[motivo] = (informe.ignoradas[motivo] ?? 0) + 1; };

  const existentes = await listarSociedadesParaCarga();
  const porClave = new Map<string, typeof existentes>();
  for (const s of existentes) {
    const k = normalizarNombreSociedad(s.nombreLargo);
    porClave.set(k, [...(porClave.get(k) ?? []), s]);
  }
  const porCodigo = new Map(existentes.filter((s) => s.codigo).map((s) => [s.codigo!, s]));

  const vistas = new Set<string>();
  const tesorerosVistos = new Set<number>();
  const cuentaPorTesorero = new Map<number, number>();

  for (const f of filas) {
    if (!f.nombre) { ignorar("fila sin nombre de sociedad"); continue; }
    const clave = normalizarNombreSociedad(f.nombre);
    if (vistas.has(clave)) { ignorar("sociedad repetida en el archivo"); continue; }
    vistas.add(clave);

    // (i) igualdad exacta del nombre normalizado, o alias explícito de la configuración.
    const porNombre = porClave.get(clave) ?? [];
    if (porNombre.length > 1) { ignorar("nombre coincide con más de una sociedad"); continue; }
    const codigoAlias = codigoPorAlias(f.nombre);
    let sociedad = porNombre[0] ?? (codigoAlias ? porCodigo.get(codigoAlias) : undefined);
    if (sociedad) {
      informe.existentes++;
    } else {
      // (ii) no existe: se crea con ese nombre, sin abreviatura.
      sociedad = await crearSociedadSinAbreviatura(f.nombre);
      informe.creadas++;
    }

    // (iii) el tesorero tiene que ser un usuario existente (no se crean usuarios aquí).
    if (!f.tesorero) { informe.filasSinTesorero++; continue; }
    const usuario = await buscarUsuarioPorNombre(f.tesorero);
    if (!usuario) { informe.tesoreroSinUsuario++; continue; }
    const r = await asignarTesorero(sociedad.id, usuario.id);
    if (r === "inicial") informe.asignacionesNuevas++;
    else if (r === "cambio") informe.cambiosDeTesorero++;
    else informe.sinCambioDeTesorero++;
    tesorerosVistos.add(usuario.id);
    cuentaPorTesorero.set(usuario.id, (cuentaPorTesorero.get(usuario.id) ?? 0) + 1);
  }
  informe.tesorerosEncontrados = tesorerosVistos.size;
  informe.sociedadesPorTesorero = [...cuentaPorTesorero.values()].sort((x, y) => y - x);
  informe.sociedadesEnBase = (await listarSociedadesParaCarga()).length;
  return informe;
}

export async function cargarSociedadesDesdeArchivo(ruta: string): Promise<InformeSociedades> {
  return cargarSociedades(leerListaSociedades(await leerLibro(await readFile(ruta))));
}

export function textoInformeSociedades(i: InformeSociedades): string {
  const L = [
    `Sociedades: ${i.filasLeidas} filas leidas`,
    `existentes encontradas: ${i.existentes} | creadas: ${i.creadas} | en la base: ${i.sociedadesEnBase}`,
    `tesoreros encontrados: ${i.tesorerosEncontrados} | tesorero sin usuario: ${i.tesoreroSinUsuario} | fila sin tesorero: ${i.filasSinTesorero}`,
    `asignaciones nuevas: ${i.asignacionesNuevas} | cambios de tesorero: ${i.cambiosDeTesorero} | sin cambio: ${i.sinCambioDeTesorero}`,
    "sociedades por tesorero (de mayor a menor, sin nombres):",
  ];
  if (i.sociedadesPorTesorero.length === 0) L.push("  ninguno");
  i.sociedadesPorTesorero.forEach((n, k) => L.push(`  tesorero ${k + 1}: ${n}`));
  const ign = Object.entries(i.ignoradas);
  L.push(`filas ignoradas: ${ign.reduce((s, [, n]) => s + n, 0)}`);
  for (const [motivo, n] of ign.sort((a, b) => b[1] - a[1])) L.push(`  ${n} fila(s): ${motivo}`);
  return L.join("\n");
}
