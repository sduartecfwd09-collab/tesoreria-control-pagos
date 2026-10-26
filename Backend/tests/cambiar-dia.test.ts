import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { ErrorDeServicio } from "../src/domain/permisos.js";
import { cambiarDiaPermanente, cambiarFechaDeUnaVez } from "../src/obligaciones/cambiar-dia.js";
import { generarVencimientos, regenerarObligacion } from "../src/vencimientos/generar.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Datos inventados. Hoy = 2026-09-10.
const reloj = () => new Date(2026, 8, 10, 10, 0);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

let jefe: number, tesAAA: number, tesBBB: number, inactivo: number;
let obligacion: number;

async function vencimiento(periodo: string) {
  return prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: obligacion, periodo } });
}
async function fallo(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErrorDeServicio) return e;
    throw e;
  }
  return null;
}

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  const rol = async (nombre: string) => (await prisma.rol.findUniqueOrThrow({ where: { nombre } })).id;
  const usuario = async (n: string, rolNombre: string, activo = true) =>
    (await prisma.usuario.create({ data: { correo: `${n}@ejemplo.invalid`, nombre: n, nombreNormalizado: n, rolId: await rol(rolNombre), activo } })).id;
  jefe = await usuario("jefe", "Jefatura");
  tesAAA = await usuario("tesorero-a", "Usuario");
  tesBBB = await usuario("tesorero-b", "Usuario");
  inactivo = await usuario("jefe-inactivo", "Jefatura", false);
  const a = await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: tesAAA } });
  await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: tesBBB } });
  const c = await prisma.categoria.findFirstOrThrow();
  obligacion = (await prisma.obligacion.create({ data: { sociedadId: a.id, categoriaId: c.id, proveedor: "Fono", identificador: "0001", diaEsperadoPago: 15 } })).id;
  await generarVencimientos("2026-08", "2026-11");
});
afterAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
});

describe("permisos del cambio de día", () => {
  it("el tesorero de la sociedad y Jefatura pueden; otro tesorero, un usuario inactivo o desconocido no", async () => {
    const intento = (actorId: number) => cambiarDiaPermanente({ actorId, obligacionId: obligacion, diaNuevo: 20, motivo: "Cambio de fecha interna" }, reloj);
    for (const actor of [tesBBB, inactivo, 999_999]) {
      const e = await fallo(intento(actor));
      expect(e?.codigo, `actor ${actor}`).toBe("permiso");
    }
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(15);
    expect(await prisma.cambioDia.count()).toBe(0);
    await intento(tesAAA);
    await cambiarDiaPermanente({ actorId: jefe, obligacionId: obligacion, diaNuevo: 22, motivo: "Ajuste de Jefatura" }, reloj);
    expect(await prisma.cambioDia.count()).toBe(2);
  });

  it("el permiso se revisa también al mover un vencimiento de una sola vez", async () => {
    const v = await vencimiento("2026-10");
    const e = await fallo(cambiarFechaDeUnaVez({ actorId: tesBBB, vencimientoId: v.id, fechaNueva: "2026-10-20", motivo: "Prórroga" }));
    expect(e?.codigo).toBe("permiso");
    expect(iso((await vencimiento("2026-10")).fecha)).toBe("2026-10-15");
  });
});

describe("cambio permanente", () => {
  it("el motivo es obligatorio y el día debe ser de 1 a 31 y distinto del actual", async () => {
    for (const motivo of [undefined, "", "  ", "ab", "x".repeat(301)]) {
      expect((await fallo(cambiarDiaPermanente({ actorId: jefe, obligacionId: obligacion, diaNuevo: 20, motivo }, reloj)))?.codigo).toBe("validacion");
    }
    for (const diaNuevo of [0, 32, 1.5, 15]) {
      expect((await fallo(cambiarDiaPermanente({ actorId: jefe, obligacionId: obligacion, diaNuevo, motivo: "Motivo válido" }, reloj)))?.codigo).toBe("validacion");
    }
    expect((await fallo(cambiarDiaPermanente({ actorId: jefe, obligacionId: 999_999, diaNuevo: 20, motivo: "Motivo válido" }, reloj)))?.codigo).toBe("no_encontrado");
    expect(await prisma.cambioDia.count()).toBe(0);
  });

  it("mueve solo los futuros no pagados y sin conciliación; no toca pasados, pagados ni conciliados", async () => {
    await prisma.vencimiento.update({ where: { id: (await vencimiento("2026-10")).id }, data: { estado: "pagado" } });
    const nov = await vencimiento("2026-11");
    const cuenta = await prisma.cuenta.create({ data: { sociedadId: (await prisma.sociedad.findFirstOrThrow({ where: { codigo: "AAA" } })).id, numero: "CR00" } });
    const archivo = await prisma.archivoImportado.create({ data: { ruta: "x.xlsx", hash: "h" } });
    const mov = await prisma.movimiento.create({
      data: { cuentaId: cuenta.id, archivoId: archivo.id, hoja: "H", fila: 1, periodo: "2026-11", fecha: new Date(), debito: 1, credito: 0, claveDedup: "k" },
    });
    await prisma.conciliacion.create({ data: { vencimientoId: nov.id, movimientoId: mov.id, tipoCruce: "manual", estado: "claro" } });

    const r = await cambiarDiaPermanente({ actorId: tesAAA, obligacionId: obligacion, diaNuevo: 20, motivo: "  Nuevo   acuerdo interno " }, reloj);
    expect(r.vencimientosMovidos).toBe(1); // solo septiembre (futuro, sin pagar ni conciliar)
    const fechas = await Promise.all(["2026-08", "2026-09", "2026-10", "2026-11"].map(async (p) => iso((await vencimiento(p)).fecha)));
    expect(fechas).toEqual(["2026-08-15", "2026-09-20", "2026-10-15", "2026-11-15"]);
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(20);

    const h = await prisma.cambioDia.findMany();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ tipo: "permanente", diaAnterior: 15, diaNuevo: 20, motivo: "Nuevo acuerdo interno", usuarioId: tesAAA, obligacionId: obligacion, vencimientoId: null });
    expect(h[0]!.creadoEn).toBeInstanceOf(Date);
  });

  it("un vencimiento movido de una sola vez conserva su fecha vigente ante un cambio permanente", async () => {
    const oct = await vencimiento("2026-10");
    await cambiarFechaDeUnaVez({ actorId: jefe, vencimientoId: oct.id, fechaNueva: "2026-10-28", motivo: "Prórroga del proveedor" });
    await cambiarDiaPermanente({ actorId: jefe, obligacionId: obligacion, diaNuevo: 5, motivo: "Nuevo día" }, reloj);
    const v = await vencimiento("2026-10");
    expect(iso(v.fecha)).toBe("2026-10-28");
    expect(iso(v.fechaOriginal)).toBe("2026-10-05"); // la fecha original sigue al día nuevo
    expect(iso((await vencimiento("2026-11")).fecha)).toBe("2026-11-05");
  });
});

describe("cambio de una sola vez", () => {
  it("cambia la fecha de un vencimiento, muestra original y nueva, y registra quién, cuándo, de qué fecha a cuál y por qué", async () => {
    const oct = await vencimiento("2026-10");
    await cambiarFechaDeUnaVez({ actorId: tesAAA, vencimientoId: oct.id, fechaNueva: "2026-10-22", motivo: "Prórroga" });
    const v = await vencimiento("2026-10");
    expect(iso(v.fecha)).toBe("2026-10-22");
    expect(iso(v.fechaOriginal)).toBe("2026-10-15");
    expect(iso((await vencimiento("2026-11")).fecha)).toBe("2026-11-15"); // los demás no cambian
    expect((await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } })).diaEsperadoPago).toBe(15);

    // un segundo cambio conserva la fecha original (la primera) y vuelve a la original la deja sin marca
    await cambiarFechaDeUnaVez({ actorId: tesAAA, vencimientoId: oct.id, fechaNueva: "2026-10-25", motivo: "Otra prórroga" });
    expect(iso((await vencimiento("2026-10")).fechaOriginal)).toBe("2026-10-15");
    await cambiarFechaDeUnaVez({ actorId: tesAAA, vencimientoId: oct.id, fechaNueva: "2026-10-15", motivo: "Se restablece" });
    expect((await vencimiento("2026-10")).fechaOriginal).toBeNull();

    const h = await prisma.cambioDia.findMany({ orderBy: { id: "asc" } });
    expect(h.map((x) => [x.tipo, iso(x.fechaAnterior), iso(x.fechaNueva), x.motivo])).toEqual([
      ["una_vez", "2026-10-15", "2026-10-22", "Prórroga"],
      ["una_vez", "2026-10-22", "2026-10-25", "Otra prórroga"],
      ["una_vez", "2026-10-25", "2026-10-15", "Se restablece"],
    ]);
    expect(h.every((x) => x.usuarioId === tesAAA && x.vencimientoId === oct.id && x.diaAnterior === null)).toBe(true);
  });

  it("exige motivo y fecha real, y no mueve un vencimiento pagado", async () => {
    const oct = await vencimiento("2026-10");
    for (const [fechaNueva, motivo] of [["2026-10-20", ""], ["2026-02-30", "Motivo"], ["20/10/2026", "Motivo"], ["2026-10-15", "Motivo"]] as const) {
      expect((await fallo(cambiarFechaDeUnaVez({ actorId: jefe, vencimientoId: oct.id, fechaNueva, motivo })))?.codigo, `${fechaNueva}|${motivo}`).toBe("validacion");
    }
    await prisma.vencimiento.update({ where: { id: oct.id }, data: { estado: "pagado" } });
    expect((await fallo(cambiarFechaDeUnaVez({ actorId: jefe, vencimientoId: oct.id, fechaNueva: "2026-10-20", motivo: "Motivo" })))?.codigo).toBe("conflicto");
    expect((await fallo(cambiarFechaDeUnaVez({ actorId: jefe, vencimientoId: 999_999, fechaNueva: "2026-10-20", motivo: "Motivo" })))?.codigo).toBe("no_encontrado");
    expect(await prisma.cambioDia.count()).toBe(0);
  });

  it("regenerar no borra ni mueve un vencimiento movido de una sola vez", async () => {
    const nov = await vencimiento("2026-11");
    await cambiarFechaDeUnaVez({ actorId: jefe, vencimientoId: nov.id, fechaNueva: "2026-11-30", motivo: "Prórroga" });
    await prisma.obligacion.update({ where: { id: obligacion }, data: { activa: false } });
    const r = await regenerarObligacion(obligacion, reloj);
    expect(r.eliminados).toBe(2); // sep y oct, sin pagar ni mover
    expect(iso((await vencimiento("2026-11")).fecha)).toBe("2026-11-30"); // el movido queda, con su historial
  });
});

describe("historial", () => {
  it("el repositorio del historial no ofrece edición ni borrado", async () => {
    const m = await import("../src/repositories/cambios-dia.js");
    expect(Object.keys(m).filter((k) => /actualizar|editar|borrar|eliminar|delete|update/i.test(k))).toEqual([]);
  });

  it("una obligación o un vencimiento con historial no se puede borrar de la base (restricción)", async () => {
    const oct = await vencimiento("2026-10");
    await cambiarFechaDeUnaVez({ actorId: jefe, vencimientoId: oct.id, fechaNueva: "2026-10-20", motivo: "Prórroga" });
    await expect(prisma.vencimiento.delete({ where: { id: oct.id } })).rejects.toThrow();
    await expect(prisma.obligacion.delete({ where: { id: obligacion } })).rejects.toThrow();
  });
});
