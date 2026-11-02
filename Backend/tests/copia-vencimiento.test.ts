import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { cambiarDia } from "../src/obligaciones/cambiar-dia.js";
import { sincronizarVencimientos } from "../src/vencimientos/generar.js";
import { generarRango, vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";

// Datos inventados. Hoy = 2026-09-10.
const reloj = () => new Date(2026, 8, 10, 10, 0);
let obligacion: number;
let sociedadId: number;
let categoria1: number;
let categoria2: number;

const venc = (periodo: string) => prisma.vencimiento.findFirstOrThrow({ where: { obligacionId: obligacion, periodo } });

beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  sociedadId = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA" } })).id;
  const cats = await prisma.categoria.findMany({ orderBy: { id: "asc" }, take: 2 });
  categoria1 = cats[0]!.id;
  categoria2 = cats[1]!.id;
  const cuenta = await prisma.cuenta.create({ data: { sociedadId, numero: "CR00" } });
  obligacion = (await prisma.obligacion.create({
    data: {
      sociedadId, categoriaId: categoria1, proveedor: "Fono Uno", identificador: "1", diaEsperadoPago: 15, montoEsperado: 1000n,
      moneda: "USD", cuentaEsperadaId: cuenta.id,
    },
  })).id;
  await generarRango("2026-08", "2026-11");
});
afterAll(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
});

describe("copia de los datos de la obligación en cada vencimiento", () => {
  it("cada vencimiento nace con día, sociedad, categoría, proveedor, cuenta esperada, monto estimado y moneda", async () => {
    const o = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } });
    const v = await venc("2026-10");
    expect(v).toMatchObject({
      dia: 15, sociedadId, categoriaId: categoria1, proveedor: "Fono Uno", cuentaEsperadaId: o.cuentaEsperadaId, montoEsperado: 1000n, moneda: "USD",
    });
  });

  it("si la obligación se edita o se desactiva, el Histórico (vencimientos pasados y pagados) no cambia; los futuros sin pagar sí se ponen al día", async () => {
    await prisma.vencimiento.update({ where: { id: (await venc("2026-10")).id }, data: { estado: "pagado" } });
    await prisma.obligacion.update({ where: { id: obligacion }, data: { categoriaId: categoria2, proveedor: "Fono Renombrado", moneda: "CRC", montoEsperado: 2000n } });
    await sincronizarVencimientos(reloj, obligacion);

    const ago = await venc("2026-08"); // pasado
    const sep = await venc("2026-09"); // futuro sin pagar
    const oct = await venc("2026-10"); // futuro pagado
    expect([ago, oct].every((v) => v.proveedor === "Fono Uno" && v.categoriaId === categoria1 && v.moneda === "USD" && v.montoEsperado === 1000n)).toBe(true);
    expect(sep).toMatchObject({ proveedor: "Fono Renombrado", categoriaId: categoria2, moneda: "CRC", montoEsperado: 2000n });

    // desactivar conserva los pasados y los pagados con su copia
    await prisma.obligacion.update({ where: { id: obligacion }, data: { activa: false } });
    await sincronizarVencimientos(reloj, obligacion);
    expect((await venc("2026-08")).proveedor).toBe("Fono Uno");
    expect((await venc("2026-10")).proveedor).toBe("Fono Uno");
    await expect(venc("2026-09")).rejects.toThrow(); // el futuro sin pagar se retiró
  });

  it("la lista de vencimientos muestra la copia y no los datos actuales de la obligación", async () => {
    await prisma.obligacion.update({ where: { id: obligacion }, data: { proveedor: "Otro Nombre", moneda: "CRC" } });
    const app = await crearApp({ reloj });
    try {
      const r = (await app.inject("/api/vencimientos?periodo=2026-08")).json();
      expect(r.datos[0]).toMatchObject({ sociedad: "Sociedad AAA", proveedor: "Fono Uno", moneda: "USD" });
      expect((await app.inject("/api/vencimientos?q=otro nombre")).json().total).toBe(0); // la búsqueda también usa la copia
      expect((await app.inject("/api/vencimientos?q=fono uno")).json().total).toBe(4);
    } finally {
      await app.close();
    }
  });

  it("un cambio permanente del día actualiza la copia del día solo en los vencimientos que mueve", async () => {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: "Jefatura" } });
    const jefe = await prisma.usuario.create({ data: { correo: "jefe@ejemplo.invalid", nombre: "jefe", nombreNormalizado: "jefe", rolId: rol.id } });
    const o = await prisma.obligacion.findUniqueOrThrow({ where: { id: obligacion } });
    await cambiarDia({ obligacion: o, nuevoDia: 22, desdeMes: "2026-09", aplicaAlMesEnCurso: undefined, motivo: "Nuevo día interno", autor: { id: jefe.id, nombre: "jefe", modoPruebas: false } }, reloj);
    expect((await venc("2026-08")).dia).toBe(15); // pasado: no se toca
    expect((await venc("2026-09")).dia).toBe(22);
    expect((await venc("2026-11")).dia).toBe(22);
  });
});
