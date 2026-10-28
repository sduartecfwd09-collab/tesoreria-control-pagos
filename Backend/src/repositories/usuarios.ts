import { prisma } from "../db.js";
import { normalizarNombrePersona, ROLES } from "../domain/usuarios.js";

/** Crea los roles que falten (Jefatura y Tesorero). */
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

/** Tesoreros activos (rol Tesorero). Para el selector de identidad temporal. */
export async function listarTesoreros() {
  return prisma.usuario.findMany({ where: { activo: true, rol: { nombre: "Tesorero" } }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
}

/** Un tesorero activo con sus preferencias propias (null = usa el valor general). */
export async function obtenerTesorero(id: number) {
  return prisma.usuario.findFirst({ where: { id, activo: true, rol: { nombre: "Tesorero" } }, select: { id: true, nombre: true, diasAviso: true, diasEspera: true } });
}

export async function fijarPreferencias(id: number, d: { diasAviso: number | null; diasEspera: number | null }) {
  return prisma.usuario.update({ where: { id }, data: d, select: { id: true, nombre: true, diasAviso: true, diasEspera: true } });
}

/** El mayor aviso propio entre los usuarios activos (null si nadie tiene el suyo). */
export async function mayorAvisoDeUsuarios(): Promise<number | null> {
  const r = await prisma.usuario.aggregate({ where: { activo: true, diasAviso: { not: null } }, _max: { diasAviso: true } });
  return r._max.diasAviso;
}
