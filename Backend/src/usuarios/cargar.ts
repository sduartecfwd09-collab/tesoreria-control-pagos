// Carga de usuarios desde un Excel (hoja 1, encabezados en la fila 1: Nombre, Correo, Rol; datos desde la fila 2).
// El informe solo trae conteos: nunca correos ni nombres.
import { readFile } from "node:fs/promises";
import { correoValido, normalizarCorreo, normalizarNombrePersona, rolDesdeTexto } from "../domain/usuarios.js";
import { ErrorLectura, leerLibro, type LibroLeido } from "../ingest/lector.js";
import { normalizar, valorPlano } from "../ingest/utiles.js";
import {
  actualizarUsuario, buscarUsuarioPorCorreo, buscarUsuarioPorNombre, crearUsuario, mapaDeRoles,
} from "../repositories/usuarios.js";

export interface FilaUsuario {
  fila: number;
  nombre: string;
  correo: string;
  rol: string;
}

export interface InformeUsuarios {
  filasLeidas: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  ignorados: Record<string, number>; // motivo -> filas
}

const texto = (v: unknown): string => {
  const p = valorPlano(v);
  return p === null || p instanceof Date ? "" : String(p).replace(/\s+/g, " ").trim();
};

/** Lee la hoja 1. Las filas totalmente vacías se saltan. Falla (sin mostrar contenido) si faltan los encabezados. */
export function leerUsuarios(libro: LibroLeido): FilaUsuario[] {
  const hoja = libro.wb.worksheets[0];
  if (!hoja) throw new ErrorLectura("El libro no tiene hojas");
  const columnas: Record<"nombre" | "correo" | "rol", number> = { nombre: 0, correo: 0, rol: 0 };
  hoja.getRow(1).eachCell((celda, col) => {
    const t = normalizar(celda.value);
    if (t === "nombre" || t === "correo" || t === "rol") columnas[t] = col;
  });
  const faltan = (Object.keys(columnas) as (keyof typeof columnas)[]).filter((k) => !columnas[k]);
  if (faltan.length > 0) throw new ErrorLectura(`Faltan encabezados en la fila 1: ${faltan.join(", ")}`);
  const filas: FilaUsuario[] = [];
  for (let n = 2; n <= hoja.rowCount; n++) {
    const r = hoja.getRow(n);
    const f = { fila: n, nombre: texto(r.getCell(columnas.nombre).value), correo: texto(r.getCell(columnas.correo).value), rol: texto(r.getCell(columnas.rol).value) };
    if (f.nombre || f.correo || f.rol) filas.push(f);
  }
  return filas;
}

/** Aplica las filas a la base. Se puede repetir sin duplicar. */
export async function cargarUsuarios(filas: FilaUsuario[]): Promise<InformeUsuarios> {
  const roles = await mapaDeRoles();
  const informe: InformeUsuarios = { filasLeidas: filas.length, creados: 0, actualizados: 0, sinCambios: 0, ignorados: {} };
  const ignorar = (motivo: string) => { informe.ignorados[motivo] = (informe.ignorados[motivo] ?? 0) + 1; };
  const correosVistos = new Set<string>();

  for (const f of filas) {
    const correo = normalizarCorreo(f.correo);
    if (!correo) { ignorar("sin correo"); continue; }
    if (!correoValido(correo)) { ignorar("correo mal formado"); continue; }
    if (!f.nombre) { ignorar("sin nombre"); continue; }
    const rolNombre = rolDesdeTexto(f.rol);
    if (!rolNombre) { ignorar("rol desconocido"); continue; }
    const rolId = roles.get(rolNombre);
    if (rolId === undefined) throw new Error("Faltan los roles en la base: ejecute npm run db:seed (o db:reiniciar)");
    if (correosVistos.has(correo)) { ignorar("correo repetido en el archivo"); continue; }
    correosVistos.add(correo);

    const porNombre = await buscarUsuarioPorNombre(f.nombre);
    if (porNombre && porNombre.correo !== correo) { ignorar("nombre ya usado por otro correo"); continue; }
    const existente = await buscarUsuarioPorCorreo(correo);
    if (!existente) {
      await crearUsuario({ correo, nombre: f.nombre, rolId });
      informe.creados++;
    } else if (existente.nombre !== f.nombre || existente.nombreNormalizado !== normalizarNombrePersona(f.nombre) || existente.rolId !== rolId) {
      await actualizarUsuario(existente.id, { nombre: f.nombre, rolId });
      informe.actualizados++;
    } else {
      informe.sinCambios++;
    }
  }
  return informe;
}

export async function cargarUsuariosDesdeArchivo(ruta: string): Promise<InformeUsuarios> {
  return cargarUsuarios(leerUsuarios(await leerLibro(await readFile(ruta))));
}

export function textoInformeUsuarios(i: InformeUsuarios): string {
  const L = [
    `Usuarios: ${i.filasLeidas} filas leidas`,
    `creados: ${i.creados} | actualizados: ${i.actualizados} | sin cambios: ${i.sinCambios}`,
  ];
  const ign = Object.entries(i.ignorados);
  L.push(`ignorados: ${ign.reduce((s, [, n]) => s + n, 0)}`);
  for (const [motivo, n] of ign.sort((a, b) => b[1] - a[1])) L.push(`  ${n} fila(s): ${motivo}`);
  return L.join("\n");
}
