import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { borrarCategoria, crearCategoria, desactivarCategoria } from "../src/categorias/servicio.js";
import { prisma } from "../src/db.js";
import { claveCategoria, compararNombre, distanciaDeEdicion, nombreCategoriaLimpio, sonParecidas } from "../src/domain/categorias.js";
import { ErrorDeServicio } from "../src/domain/permisos.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

describe("nombres de categoría (dominio)", () => {
  it("«Cable» = «CABLE» = « c a b l e »: se comparan sin mayúsculas, tildes ni espacios", () => {
    expect(["Cable", "CABLE", " c a b l e ", "Cáble"].map(claveCategoria)).toEqual(Array(4).fill("cable"));
    expect(claveCategoria("Teléfono")).toBe(claveCategoria("TELEFONO"));
  });
  it("limpia espacios y rechaza vacíos o demasiado largos", () => {
    expect(nombreCategoriaLimpio("  Agua   potable ")).toBe("Agua potable");
    for (const n of [undefined, "", " ", "A", "x".repeat(101), 5]) expect(nombreCategoriaLimpio(n)).toBeNull();
  });
  it("detecta nombres casi iguales (errores menores) y no confunde los distintos", () => {
    expect(distanciaDeEdicion("cable", "cabel")).toBe(2);
    expect(sonParecidas("cable", "cables")).toBe(true);
    expect(sonParecidas("telefono", "telefno")).toBe(true);
    expect(sonParecidas("electricidad", "electricidd")).toBe(true);
    expect(sonParecidas("cable", "cable")).toBe(false); // igual no es parecida
    expect(sonParecidas("cable", "agua")).toBe(false);
    expect(sonParecidas("ccss", "cable")).toBe(false);
  });
  it("compararNombre separa igual, parecidas y nuevo", () => {
    const ex = ["Cable", "Internet", "Teléfono"];
    expect(compararNombre("CABLE", ex)).toEqual({ tipo: "igual", existente: "Cable" });
    expect(compararNombre("Internt", ex)).toEqual({ tipo: "parecidas", existentes: ["Internet"] });
    expect(compararNombre("Agua", ex)).toEqual({ tipo: "nuevo" });
  });
});

const PROPIAS = ["agua", "gas", "cables"]; // categorías que crean estas pruebas
let jefe: number, tesorero: number, inactivo: number;

async function fallo(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErrorDeServicio) return e;
    throw e;
  }
  return null;
}

async function limpiarPropias() {
  const ids = (await prisma.categoria.findMany({ where: { nombreNormalizado: { in: PROPIAS } }, select: { id: true } })).map((c) => c.id);
  await prisma.vencimiento.deleteMany({ where: { categoriaId: { in: ids } } });
  await prisma.obligacion.deleteMany({ where: { categoriaId: { in: ids } } });
  await prisma.categoria.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await limpiarPropias();
  const rol = async (n: string) => (await prisma.rol.findUniqueOrThrow({ where: { nombre: n } })).id;
  const usuario = async (n: string, r: string, activo = true) =>
    (await prisma.usuario.create({ data: { correo: `${n}@ejemplo.invalid`, nombre: n, nombreNormalizado: n, rolId: await rol(r), activo } })).id;
  jefe = await usuario("jefe", "Jefatura");
  tesorero = await usuario("tesorero", "Usuario");
  inactivo = await usuario("jefe-inactivo", "Jefatura", false);
});
afterAll(async () => {
  await vaciarImportaciones();
  await limpiarPropias();
  await vaciarUsuarios();
});

describe("crearCategoria", () => {
  it("solo Jefatura activa puede crear", async () => {
    for (const actorId of [tesorero, inactivo, 999_999]) {
      expect((await fallo(crearCategoria({ actorId, nombre: "Agua" })))?.codigo, `actor ${actorId}`).toBe("permiso");
    }
    expect(await prisma.categoria.count({ where: { nombreNormalizado: "agua" } })).toBe(0);
  });

  it("crea la categoría con el nombre limpio", async () => {
    const r = await crearCategoria({ actorId: jefe, nombre: "  Agua   " });
    expect(r).toEqual({ creada: { id: expect.any(Number), nombre: "Agua" } });
    const c = await prisma.categoria.findFirstOrThrow({ where: { nombre: "Agua" } });
    expect(c).toMatchObject({ nombreNormalizado: "agua", activa: true });
  });

  it("rechaza un nombre igual a uno existente aunque cambien mayúsculas, tildes o espacios", async () => {
    for (const nombre of ["CABLE", "cable", " c able", "Teléfono", "TELEFONO"]) {
      expect((await fallo(crearCategoria({ actorId: jefe, nombre })))?.codigo, nombre).toBe("conflicto");
    }
  });

  it("si es casi igual a una existente pregunta «¿quisiste decir…?» sin crear, y crea solo si se confirma", async () => {
    const r = await crearCategoria({ actorId: jefe, nombre: "Cables" });
    expect(r).toMatchObject({ sugerencias: ["Cable"], mensaje: expect.stringContaining("«Cable»") });
    expect(await prisma.categoria.count({ where: { nombre: "Cables" } })).toBe(0);
    expect(await crearCategoria({ actorId: jefe, nombre: "Cables", confirmarNueva: true })).toHaveProperty("creada");
  });

  it("exige un nombre válido", async () => {
    for (const nombre of [undefined, "", "   ", "A", "x".repeat(101)]) {
      expect((await fallo(crearCategoria({ actorId: jefe, nombre })))?.codigo).toBe("validacion");
    }
  });
});

describe("desactivar y borrar", () => {
  const nueva = async (nombre: string) => (await crearCategoria({ actorId: jefe, nombre })) as { creada: { id: number } };

  it("desactivar solo lo hace Jefatura y no borra nada", async () => {
    const { creada } = await nueva("Gas");
    expect((await fallo(desactivarCategoria({ actorId: tesorero, categoriaId: creada.id })))?.codigo).toBe("permiso");
    expect((await prisma.categoria.findUniqueOrThrow({ where: { id: creada.id } })).activa).toBe(true);
    await desactivarCategoria({ actorId: jefe, categoriaId: creada.id });
    expect((await prisma.categoria.findUniqueOrThrow({ where: { id: creada.id } })).activa).toBe(false);
    expect((await fallo(desactivarCategoria({ actorId: jefe, categoriaId: 999_999 })))?.codigo).toBe("no_encontrado");
  });

  it("borrar: solo Jefatura y solo sin obligaciones ni vencimientos", async () => {
    const { creada } = await nueva("Gas");
    expect((await fallo(borrarCategoria({ actorId: tesorero, categoriaId: creada.id })))?.codigo).toBe("permiso");
    expect((await fallo(borrarCategoria({ actorId: jefe, categoriaId: 999_999 })))?.codigo).toBe("no_encontrado");
    await borrarCategoria({ actorId: jefe, categoriaId: creada.id });
    expect(await prisma.categoria.count({ where: { id: creada.id } })).toBe(0);
  });

  it("no borra una categoría con obligaciones ni con vencimientos (aunque la obligación ya esté en otra categoría)", async () => {
    const { creada } = await nueva("Agua");
    const s = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } });
    const o = await prisma.obligacion.create({ data: { sociedadId: s.id, categoriaId: creada.id, proveedor: "P", identificador: "1", diaEsperadoPago: 5 } });
    expect((await fallo(borrarCategoria({ actorId: jefe, categoriaId: creada.id })))?.codigo).toBe("conflicto");
    expect(await prisma.categoria.count({ where: { id: creada.id } })).toBe(1);

    await prisma.vencimiento.create({
      data: { obligacionId: o.id, fecha: new Date(Date.UTC(2026, 8, 5)), periodo: "2026-09", dia: 5, sociedadId: s.id, categoriaId: creada.id, proveedor: "P", moneda: "CRC" },
    });
    const otra = await prisma.categoria.findFirstOrThrow({ where: { nombreNormalizado: "cable" } });
    await prisma.obligacion.update({ where: { id: o.id }, data: { categoriaId: otra.id } });
    expect((await fallo(borrarCategoria({ actorId: jefe, categoriaId: creada.id })))?.codigo).toBe("conflicto");
  });
});
