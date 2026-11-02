import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { copiaDeObligacion, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// El Detalle del pago informa el responsable solo a Jefatura. Datos inventados.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number;
let jefa: number;
let vencimientoId: number;

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  const sociedad = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } });
  const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
  const o = await prisma.obligacion.create({ data: { sociedadId: sociedad.id, categoriaId, proveedor: "P", identificador: "1", diaEsperadoPago: 10 } });
  vencimientoId = (await prisma.vencimiento.create({ data: { obligacionId: o.id, fecha: new Date(Date.UTC(2026, 11, 10)), periodo: "2026-12", estado: "proyectado", ...copiaDeObligacion(o) } })).id;
});
afterAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
});

describe("Detalle del pago: Responsable", () => {
  it("Jefatura lo ve; un tesorero no lo recibe", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const jefatura = (await app.inject({ method: "GET", url: `/api/vencimientos/${vencimientoId}`, headers: encabezado(jefa) })).json();
    expect(jefatura.datos.responsableEfectivo).toBe("Ana Uno");
    const tesorero = (await app.inject({ method: "GET", url: `/api/vencimientos/${vencimientoId}`, headers: encabezado(ana) })).json();
    expect(tesorero.datos).not.toHaveProperty("responsableEfectivo");
  });

  it("la lista de pagos tampoco lo envía a un tesorero", async () => {
    const app = await crearApp({ reloj, modoPruebas: true });
    const jefatura = (await app.inject({ method: "GET", url: "/api/vencimientos?porPagina=50", headers: encabezado(jefa) })).json();
    expect(jefatura.datos[0].responsableEfectivo).toBe("Ana Uno");
    const tesorero = (await app.inject({ method: "GET", url: "/api/vencimientos?porPagina=50", headers: encabezado(ana) })).json();
    expect(tesorero.datos).toHaveLength(1);
    expect(tesorero.datos[0]).not.toHaveProperty("responsableEfectivo");
  });
});
