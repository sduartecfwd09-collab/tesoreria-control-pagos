import { prisma } from "../db.js";
import { normalizarNombrePersona, ROLES } from "../domain/usuarios.js";

/** Crea los roles que falten (Jefatura y Usuario). */
export async function asegurarRoles() {
  for (const nombre of ROLES) await prisma.rol.upsert({ where: { nombre }, create: { nombre }, update: {} });
}

export async function mapaDeRoles(): Promise<Map<string, number>> {
  return new Map((await prisma.rol.findMany()).map((r) => [r.nombre, r.id]));
}

export async function buscarUsuarioPorCorreo(correo: string) {
  return prisma.usuario.findUnique({ where: { correo } });
}

export async function buscarUsuarioPorNombre(nombre: string) {
  return prisma.usuario.findUnique({ where: { nombreNormalizado: normalizarNombrePersona(nombre) } });
}

export async function crearUsuario(d: { correo: string; nombre: string; rolId: number }) {
  return prisma.usuario.create({ data: { ...d, nombreNormalizado: normalizarNombrePersona(d.nombre) } });
}

export async function actualizarUsuario(id: number, d: { nombre: string; rolId: number }) {
  return prisma.usuario.update({ where: { id }, data: { ...d, nombreNormalizado: normalizarNombrePersona(d.nombre) } });
}

/** Quien actúa, con el nombre de su rol: lo que necesitan las reglas de permisos. */
export async function obtenerActor(id: number) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: { id: true, activo: true, rol: { select: { nombre: true } } } });
  return u ? { id: u.id, activo: u.activo, rol: u.rol.nombre } : null;
}

/** Usuarios activos con su aviso propio (null = usa el parámetro general). Para la tabla «Avisos por tesorero». */
export async function listarUsuariosConAviso() {
  return prisma.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, diasAviso: true, rol: { select: { nombre: true } } }, orderBy: { nombre: "asc" } });
}

export async function fijarDiasAviso(id: number, diasAviso: number | null) {
  return prisma.usuario.update({ where: { id }, data: { diasAviso }, select: { id: true, nombre: true, diasAviso: true } });
}

/** El mayor aviso propio entre los usuarios activos (null si nadie tiene el suyo). */
export async function mayorAvisoDeUsuarios(): Promise<number | null> {
  const r = await prisma.usuario.aggregate({ where: { activo: true, diasAviso: { not: null } }, _max: { diasAviso: true } });
  return r._max.diasAviso;
}
