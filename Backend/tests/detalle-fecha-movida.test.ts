import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// El detalle del pago dice quién movió la fecha solo cuando la fecha se movió. Datos inventados; hoy = 27 de octubre de 2026.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

let app: Awaited<ReturnType<typeof crearApp>>;
let movido: number;
let normal: number;

beforeAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  const ana = await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } });
  const s = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana.id } });
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  const crear = async (proveedor: string, fecha: Date, fechaOriginal: Date | null) => {
    const o = await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId, proveedor, identificador: proveedor, diaEsperadoPago: 10 } });
    return prisma.vencimiento.create({ data: { obligacionId: o.id, fecha, fechaOriginal, periodo: fecha.toISOString().slice(0, 7), estado: "proyectado", ...copiaDeObligacion(o) } });
  };
  const v = await crear("Movido", dia(2026, 12, 15), dia(2026, 12, 10));
  await prisma.cambioDia.create({ data: { obligacionId: v.obligacionId, vencimientoId: v.id, tipo: "una_vez", fechaAnterior: dia(2026, 12, 10), fechaNueva: dia(2026, 12, 15), motivo: "Pidió el proveedor", usuarioId: ana.id } });
  movido = v.id;
  normal = (await crear("Normal", dia(2026, 12, 10), null)).id;
  app = await crearApp({ reloj, modoPruebas: false });
});
afterAll(async () => {
  await vaciarImportaciones(); // primero los cambios de fecha, que apuntan a la persona
  await vaciarUsuarios();
});

const detalle = async (id: number) => (await app.inject(`/api/vencimientos/${id}`)).json().datos;

describe("detalle del pago: fecha movida", () => {
  it("con la fecha movida trae la original y quién la cambió", async () => {
    const d = await detalle(movido);
    expect(d).toMatchObject({ movida: true, fecha: "2026-12-15", fechaOriginal: "2026-12-10", fechaMovidaPor: "Ana Uno" });
  });

  it("sin mover la fecha no hay quién la cambió", async () => {
    const d = await detalle(normal);
    expect(d).toMatchObject({ movida: false, fechaMovidaPor: null });
  });

  it("un vencimiento programado se resume con su fecha", async () => {
    expect((await detalle(normal)).textos.resumen).toBe("Programado para el 10 dic 2026.");
  });
});
