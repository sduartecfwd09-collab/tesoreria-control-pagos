import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { leerLibro } from "../src/ingest/lector.js";
import { cargarUsuarios, leerUsuarios, textoInformeUsuarios } from "../src/usuarios/cargar.js";
import { correoValido, normalizarCorreo, rolDesdeTexto } from "../src/domain/usuarios.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Datos inventados; los correos usan el dominio reservado ejemplo.invalid.
const hoja = async (filas: unknown[][], encabezado: unknown[] = ["Nombre", "Correo", "Rol"]) =>
  leerUsuarios(await leerLibro(await M.libro([{ nombre: "Usuarios", filas: Object.fromEntries([encabezado, ...filas].map((f, i) => [i + 1, f])) }])));

beforeAll(async () => { await vaciarImportaciones(); await vaciarUsuarios(); });
afterAll(async () => { await vaciarUsuarios(); });

describe("dominio de usuarios", () => {
  it("normaliza correos y reconoce los dos roles", () => {
    expect(normalizarCorreo("  Ana.Prueba@Ejemplo.INVALID ")).toBe("ana.prueba@ejemplo.invalid");
    expect(correoValido("a@ejemplo.invalid")).toBe(true);
    expect(correoValido("sin-arroba")).toBe(false);
    expect(rolDesdeTexto(" jefatura ")).toBe("Jefatura");
    expect(rolDesdeTexto("USUARIO")).toBe("Usuario");
    expect(rolDesdeTexto("Administrador")).toBeNull();
  });
});

describe("usuarios:cargar", () => {
  it("el seed deja los roles Jefatura y Usuario y ningún usuario", async () => {
    expect((await prisma.rol.findMany()).map((r) => r.nombre).sort()).toEqual(["Jefatura", "Usuario"]);
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("crea usuarios, ignora lo inválido con su motivo y guarda el correo en minúsculas", async () => {
    const filas = await hoja([
      ["Persona Uno", " Persona.Uno@Ejemplo.INVALID ", "Jefatura"],
      ["Persona Dos", "dos@ejemplo.invalid", "usuario"],
      ["Persona Tres", "", "Usuario"], // sin correo
      ["Persona Cuatro", "no-es-correo", "Usuario"], // mal formado
      ["Persona Cinco", "cinco@ejemplo.invalid", "Administrador"], // rol desconocido
      ["", "seis@ejemplo.invalid", "Usuario"], // sin nombre
      [null, null, null], // fila vacía: se salta
      ["Persona Siete", "dos@ejemplo.invalid", "Usuario"], // correo repetido
    ]);
    const r = await cargarUsuarios(filas);
    expect(r).toMatchObject({ filasLeidas: 7, creados: 2, actualizados: 0, sinCambios: 0 });
    expect(r.ignorados).toEqual({ "sin correo": 1, "correo mal formado": 1, "rol desconocido": 1, "sin nombre": 1, "correo repetido en el archivo": 1 });
    const u = await prisma.usuario.findUniqueOrThrow({ where: { correo: "persona.uno@ejemplo.invalid" }, include: { rol: true } });
    expect(u).toMatchObject({ nombre: "Persona Uno", nombreNormalizado: "persona uno", activo: true });
    expect(u.rol.nombre).toBe("Jefatura");
  });

  it("repetir la carga no duplica; un cambio de nombre o rol cuenta como actualizado", async () => {
    const igual = [["Persona Uno", "persona.uno@ejemplo.invalid", "Jefatura"], ["Persona Dos", "dos@ejemplo.invalid", "Usuario"]];
    expect(await cargarUsuarios(await hoja(igual))).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 2 });
    const cambiado = [["Persona Uno", "persona.uno@ejemplo.invalid", "Jefatura"], ["Persona Dos Apellido", "dos@ejemplo.invalid", "Jefatura"]];
    expect(await cargarUsuarios(await hoja(cambiado))).toMatchObject({ creados: 0, actualizados: 1, sinCambios: 1 });
    expect(await prisma.usuario.count()).toBe(2);
    const dos = await prisma.usuario.findUniqueOrThrow({ where: { correo: "dos@ejemplo.invalid" }, include: { rol: true } });
    expect(dos).toMatchObject({ nombre: "Persona Dos Apellido", nombreNormalizado: "persona dos apellido" });
    expect(dos.rol.nombre).toBe("Jefatura");
  });

  it("no permite que dos correos distintos tengan el mismo nombre", async () => {
    const r = await cargarUsuarios(await hoja([["PERSONA UNO", "otro@ejemplo.invalid", "Usuario"]]));
    expect(r.creados).toBe(0);
    expect(r.ignorados).toEqual({ "nombre ya usado por otro correo": 1 });
  });

  it("el informe imprime solo conteos: ni correos ni nombres", async () => {
    const r = await cargarUsuarios(await hoja([["Persona Nueva", "nueva@ejemplo.invalid", "Usuario"], ["X", "malo", "Usuario"]]));
    const texto = textoInformeUsuarios(r);
    expect(texto).toContain("creados: 1");
    expect(texto).toContain("1 fila(s): correo mal formado");
    expect(texto).not.toMatch(/ejemplo|invalid|Persona|@/i);
  });

  it("falla sin mostrar contenido si faltan encabezados", async () => {
    await expect(hoja([["a", "b@ejemplo.invalid"]], ["Nombre", "Correo"])).rejects.toThrow(/Faltan encabezados.*rol/);
  });

  it("acepta los encabezados en cualquier orden y con otra capitalización", async () => {
    const filas = await hoja([["secreto@ejemplo.invalid", "Persona Orden", "Usuario"]], ["CORREO", "nombre", "Rol"]);
    expect(filas[0]).toMatchObject({ nombre: "Persona Orden", correo: "secreto@ejemplo.invalid" });
  });
});
