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

export async function fijarPreferencias(id: number, d: { diasAviso: number | null; diasEspera: number | null }) {
  return prisma.usuario.update({ where: { id }, data: d, select: { id: true, nombre: true, diasAviso: true, diasEspera: true } });
}

/** El mayor aviso propio entre los usuarios activos (null si nadie tiene el suyo). */
export async function mayorAvisoDeUsuarios(): Promise<number | null> {
  const r = await prisma.usuario.aggregate({ where: { activo: true, diasAviso: { not: null } }, _max: { diasAviso: true } });
  return r._max.diasAviso;
}

/** Una persona activa con su rol (Tesorero o Jefatura) y sus preferencias propias (null = usa el valor general). */
export async function obtenerUsuarioActivo(id: number) {
  const u = await prisma.usuario.findFirst({ where: { id, activo: true }, select: { id: true, nombre: true, nombreNormalizado: true, diasAviso: true, diasEspera: true, rol: { select: { nombre: true } } } });
  return u ? { id: u.id, nombre: u.nombre, nombreNormalizado: u.nombreNormalizado, rol: u.rol.nombre, diasAviso: u.diasAviso, diasEspera: u.diasEspera } : null;
}

/** Todas las personas activas con su rol, para el selector de pruebas; Jefatura primero. */
export async function listarUsuariosActivos() {
  const u = await prisma.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, rol: { select: { nombre: true } } }, orderBy: { nombre: "asc" } });
  return u.map((x) => ({ id: x.id, nombre: x.nombre, rol: x.rol.nombre })).sort((a, b) => Number(b.rol === "Jefatura") - Number(a.rol === "Jefatura"));
}
