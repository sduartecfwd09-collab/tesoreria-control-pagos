import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { inspeccionarSaldo } from "../src/ingest/inspeccionar-saldo.js";
import { asegurarRoles, mapaDeRoles } from "../src/repositories/usuarios.js";
import { vaciarImportaciones, vaciarUsuarios } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Panel «Ver información completa» e inspección del saldo, con datos inventados.
const reloj = () => new Date(2026, 9, 27, 10, 0);
const dia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const encabezado = (id: number) => ({ "x-usuario-actual": String(id) });

let ana: number;
let beto: number;
let jefa: number;
let sociedadA: number;
let sociedadB: number;
let archivoA: number;
let archivoB: number;
let contenidoA: Buffer;
let n = 0;

const NOMBRE_A = "CR91010710102200000001 1026 AAA.xlsx";
const NOMBRE_B = "CR91010710102200000002 1026 BBB.xlsx";


beforeEach(async () => {
  await vaciarImportaciones();
  await vaciarUsuarios();
  await asegurarRoles();
  const roles = await mapaDeRoles();
  ana = (await prisma.usuario.create({ data: { correo: "ana@x.cr", nombre: "Ana Uno", nombreNormalizado: "ana uno", rolId: roles.get("Tesorero")! } })).id;
  beto = (await prisma.usuario.create({ data: { correo: "beto@x.cr", nombre: "Beto Dos", nombreNormalizado: "beto dos", rolId: roles.get("Tesorero")! } })).id;
  jefa = (await prisma.usuario.create({ data: { correo: "jefa@x.cr", nombre: "Jefa Tres", nombreNormalizado: "jefa tres", rolId: roles.get("Jefatura")! } })).id;
  sociedadA = (await prisma.sociedad.create({ data: { codigo: "AAA", nombreLargo: "Sociedad AAA", tesoreroId: ana } })).id;
  sociedadB = (await prisma.sociedad.create({ data: { codigo: "BBB", nombreLargo: "Sociedad BBB", tesoreroId: beto } })).id;
  const cuentaA = (await prisma.cuenta.create({ data: { sociedadId: sociedadA, numero: "CR91010710102200000001", formato: "E1", codigoBanco: "0107", banco: "Banco Uno", moneda: "CRC" } })).id;
  const cuentaB = (await prisma.cuenta.create({ data: { sociedadId: sociedadB, numero: "CR91010710102200000002", formato: "E1", codigoBanco: "0107" } })).id;
  const detalle = JSON.stringify({ hojaLeida: "Movimientos", continuidad: { estado: "no_verificable", razon: "un_solo_saldo", movimientos: 1 }, saldoInicial: null, saldoFinal: 123456, periodoDeclarado: { del: "2026-10-01", al: "2026-10-31" }, fechas: { del: "2026-10-05", al: "2026-10-05" } });
  archivoA = (await prisma.archivoImportado.create({ data: { ruta: `AAA/${NOMBRE_A}`, hash: "a", sociedadId: sociedadA, cuentaId: cuentaA, mes: "2026-10", estado: "leido", formato: "E1", numMovimientos: 1, detalle } })).id;
  archivoB = (await prisma.archivoImportado.create({ data: { ruta: `BBB/${NOMBRE_B}`, hash: "b", sociedadId: sociedadB, cuentaId: cuentaB, mes: "2026-10", estado: "leido", formato: "E1", numMovimientos: 1, detalle } })).id;
  contenidoA = await M.e1();
});
afterAll(async () => {
  await vaciarUsuarios();
  await vaciarImportaciones();
});

const pedir = async (url: string, cabeceras: Record<string, string> = {}) => {
  const app = await crearApp({ reloj, modoPruebas: true });
  try {
    return await app.inject({ method: "GET", url, headers: cabeceras });
  } finally {
    await app.close();
  }
};

describe("información completa de un archivo", () => {
  it("trae la ficha con el saldo en tres partes y la ruta relativa; el nombre y la cuenta van enmascarados", async () => {
    const r = await pedir(`/api/archivos/${archivoA}`, encabezado(ana));
    expect(r.statusCode).toBe(200);
    const d = r.json().datos;
    expect(d).toMatchObject({ sociedad: "Sociedad AAA", cuenta: "****0001", banco: "Banco Uno", mes: "2026-10", hoja: "Movimientos", periodoDeclarado: { del: "2026-10-01", al: "2026-10-31" }, filasLeidas: 1, movimientos: 1, saldoInicial: null, saldoFinal: 123456, rutaRelativa: `AAA/${NOMBRE_A}` });
    expect(d.nombre).not.toContain("91010710102200000001");
    expect(d.saldo.queSePaso).toBe("Este archivo trae un solo movimiento, así que no hay un saldo anterior para revisar.");
    expect(JSON.stringify(d)).not.toContain("CR91010710102200000001\"");
  });

  it("un tesorero ajeno recibe «no encontrado»; Jefatura y quien tiene la sociedad lo ven", async () => {
    expect((await pedir(`/api/archivos/${archivoB}`, encabezado(ana))).statusCode).toBe(404);
    expect((await pedir(`/api/archivos/${archivoB}`, encabezado(beto))).statusCode).toBe(200);
    expect((await pedir(`/api/archivos/${archivoB}`, encabezado(jefa))).statusCode).toBe(200);
    expect((await pedir("/api/archivos/999999", encabezado(jefa))).statusCode).toBe(404);
    expect((await pedir("/api/archivos/abc", encabezado(jefa))).statusCode).toBe(404);
  });
});

describe("Movimientos sin obligación: información completa", () => {
  it("el detalle trae la descripción completa y el número completo; la lista solo lo enmascarado y una clave opaca", async () => {
    const cuentaA = (await prisma.cuenta.findFirstOrThrow({ where: { sociedadId: sociedadA } })).id;
    await prisma.movimiento.create({ data: { cuentaId: cuentaA, archivoId: archivoA, hoja: "Movimientos", fila: ++n + 6, periodo: "2026-10", fecha: dia(2026, 10, 5), descripcion: "Pago:TIGO 55500055 REF", referencia: "R-9", debito: 150000n, credito: 0n, claveDedup: "z1".padEnd(40, "0") } });
    const lista = (await pedir("/api/movimientos-sin-obligacion", encabezado(ana))).json();
    expect(lista.datos).toHaveLength(1);
    expect(JSON.stringify(lista)).not.toContain("55500055");
    const clave = lista.datos[0].clave as string;
    const det = (await pedir(`/api/movimientos-sin-obligacion/detalle?clave=${encodeURIComponent(clave)}`, encabezado(ana))).json().datos;
    expect(det.proveedor).toBe("TIGO");
    expect(det.pagos[0]).toMatchObject({ fecha: "2026-10-05", banco: "Banco Uno", cuenta: "****0001", sociedad: "Sociedad AAA", descripcion: "Pago:TIGO 55500055 REF", referencia: "R-9", monto: 150000, moneda: "CRC", identificador: "55500055", hoja: "Movimientos", archivo: { id: archivoA } });
    expect(det.pagos[0].comoSeExtrajo).toContain("55500055");
    // un tesorero ajeno no lo ve: ni en la lista ni pidiendo su clave
    expect(((await pedir("/api/movimientos-sin-obligacion", encabezado(beto))).json().datos as unknown[]).length).toBe(0);
    expect((await pedir(`/api/movimientos-sin-obligacion/detalle?clave=${encodeURIComponent(clave)}`, encabezado(beto))).statusCode).toBe(404);
    expect((await pedir("/api/movimientos-sin-obligacion/detalle", encabezado(ana))).statusCode).toBe(400);
  });
});

describe("inspeccionar el saldo de un archivo (solo lectura)", () => {
  /** Como la muestra E1, pero con «Saldo inicial» en el encabezado (un importe de 1 234 567,89). */
  const conSaldoInicial = () =>
    M.libro([{
      nombre: "Movimientos",
      filas: {
        1: ["Periodo Seleccionado", null, null, "SOCIEDAD SINTETICA S.A."],
        2: ["Fecha", "Del: 01/08/2026", "Al: 28/08/2026", "BCT 0000"],
        3: ["Saldo inicial", null, 1234567.89],
        4: ["CR91010710102200000001"],
        6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"],
        7: [M.fecha(2026, 8, 3), "Pago:SERVICIO UNO 11111111", "R-1", 150.5, 0, 1234417.39],
        8: [M.fecha(2026, 8, 4), "Cargo comision", "R-2", 12.34, 0, 1234405.05],
      },
    }]);

  it("indica dónde está el saldo y qué guardó el lector, sin imprimir montos, nombres ni cuentas completas", async () => {
    const texto = (await inspeccionarSaldo(await conSaldoInicial(), "CR91010710102200000001 0826 AAA.xlsx")).join("\n");
    expect(texto).toContain("Formato detectado: E1");
    expect(texto).toMatch(/fila 3, columna 1: «Saldo inicial»[^\n]*primera celda con valor a la derecha con número: sí/);
    expect(texto).toMatch(/columna 6 \(«Saldo»\) · filas con saldo: 2 de 2/);
    expect(texto).toContain("saldo anterior (inicial): presente");
    expect(texto).toContain("saldo siguiente (de la última fila): presente");
    expect(texto).toContain("usó el saldo anterior del encabezado para comparar: sí");
    for (const prohibido of ["1234567", "1 234 567", "1.234.567", "1234417", "1234405", "150.5", "150,5", "12.34", "SERVICIO UNO", "SOCIEDAD SINTETICA", "CR91010710102200000001", "91010710102200000001"]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("un archivo sin «Saldo inicial» lo dice: nulo y sin comparar con el saldo anterior", async () => {
    const texto = (await inspeccionarSaldo(contenidoA, "CR91010710102200000001 0826 AAA.xlsx")).join("\n");
    expect(texto).toContain("saldo anterior (inicial): nulo");
    expect(texto).toContain("usó el saldo anterior del encabezado para comparar: no");
  });
});

describe("inspeccionar el saldo: segunda pasada sobre toda la hoja", () => {
  const raro = () =>
    M.libro([{
      nombre: "Movimientos",
      filas: {
        1: ["Periodo Seleccionado", null, null, "SOCIEDAD SINTETICA S.A."],
        2: ["Fecha", "Del: 01/08/2026", "Al: 28/08/2026", "BCT 0000"],
        4: ["CR91010710102200000001"],
        6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"],
        7: [M.fecha(2026, 8, 3), "SECRETO UNO", "R-1", 111.11, 0, 5000.55],
        8: [M.fecha(2026, 8, 4), "SECRETO DOS", "R-2", 222.22, 0, 4778.33],
        9: [null, "SECRETO TRES", "R-3", 333.33, 0, 4445, M.fecha(2026, 8, 5)], // la fecha está en otra columna
        10: ["03-ago-2026", "SECRETO CUATRO", "R-4", 444.44, 0, 4000.56], // fecha escrita en un formato que el lector no entiende
        13: ["Total débitos", null, null, 1111.1],
      },
    }]);

  it("agrupa las filas por su forma, explica por qué se leyó o se descartó cada fila con forma de movimiento y no imprime contenido", async () => {
    const texto = (await inspeccionarSaldo(await raro(), "CR91010710102200000001 0826 AAA.xlsx")).join("\n");
    expect(texto).toContain("filas con forma de movimiento: 3 · leídas por el lector: 2 · no leídas: 1");
    expect(texto).toMatch(/filas 9: no leídas: la columna de fecha del encabezado \(1\) no trae una fecha legible en estas filas; la fecha legible está en la columna 7|filas 9: no leídas/);
    expect(texto).toContain("filas 11 a 12: 0 celdas");
    expect(texto).toContain("«99-aaa-9999»"); // la forma de la fecha que no se pudo leer
    expect(texto).toMatch(/fila 13, columna 1: «Total débitos» · dentro o después de la tabla/);
    expect(texto).toContain("filas completamente vacías: 2");
    for (const prohibido of ["SECRETO", "111.11", "5000.55", "4778", "03-ago-2026", "1111.1", "SINTETICA", "91010710102200000001"]) expect(texto).not.toContain(prohibido);
  });

  it("un archivo con encabezado y ninguna fila de datos lo dice con claridad", async () => {
    const vacio = await M.libro([{
      nombre: "Movimientos",
      filas: { 1: ["Periodo Seleccionado"], 2: ["Fecha", "Del: 01/08/2026", "Al: 28/08/2026", "BCT 0000"], 4: ["CR91010710102200000001"], 6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"], 9: ["Sin movimientos en el período"] },
    }]);
    const texto = (await inspeccionarSaldo(vacio, "CR91010710102200000001 0826 AAA.xlsx")).join("\n");
    expect(texto).toContain("movimientos leídos: 0");
    expect(texto).toMatch(/«Sin movimientos en el período»/);
    expect(texto).toContain("filas con forma de movimiento: 0");
  });
});

describe("sin descarga y con archivos sin movimientos", () => {
  it("la ruta de descarga ya no existe", async () => {
    expect((await pedir(`/api/archivos/${archivoA}/descargar`, encabezado(jefa))).statusCode).toBe(404);
  });

  const ponerDetalle = (conImagenes: boolean, estado: string, razon?: string) =>
    prisma.archivoImportado.update({ where: { id: archivoA }, data: { detalle: JSON.stringify({ conImagenes, continuidad: { estado, razon, movimientos: 0 } }) } });
  const lista = async () => ((await pedir("/api/importaciones", encabezado(ana))).json().datos as { id: number; sinMovimientos: boolean; soloImagen?: unknown; saldo: { queSePaso: string; queSignifica: string; queHacer: string; motivo: string } }[]).find((a) => a.id === archivoA)!;

  it("todo archivo leído con 0 movimientos es «sin movimientos», tenga imagen o no, con el mismo texto", async () => {
    for (const conImagenes of [true, false]) {
      await ponerDetalle(conImagenes, "no_verificable", "sin_movimientos");
      const a = await lista();
      expect(a.sinMovimientos).toBe(true);
      expect(a.soloImagen).toBeUndefined();
      expect(a.saldo.queSePaso).toBe("Este archivo no trae movimientos del mes.");
      expect(a.saldo.queSignifica).toBe("Tesorería indica que corresponde a una cuenta sin actividad, por eso se cuenta como cobertura.");
      expect(a.saldo.queHacer).toBe("No hay nada que hacer.");
      expect(a.saldo.motivo).not.toMatch(/captura|imagen|Excel|CSV|Pida al banco/);
      const ficha = (await pedir(`/api/archivos/${archivoA}`, encabezado(ana))).json().datos;
      expect(ficha.sinMovimientos).toBe(true);
      expect(ficha.soloImagen).toBeUndefined();
    }
  });

  it("un archivo con movimientos, aunque traiga imagen, no es «sin movimientos»", async () => {
    await ponerDetalle(true, "cuadra");
    expect((await lista()).sinMovimientos).toBe(false);
    await ponerDetalle(true, "no_verificable", "un_solo_saldo");
    expect((await lista()).sinMovimientos).toBe(false);
  });
});
