// Generadores de archivos SINTÉTICOS que imitan la estructura de cada formato (E1 a E7).
// No contienen ni derivan de datos reales: nombres, importes y descripciones son inventados.
import ExcelJS from "exceljs";

export type Fila = unknown[];
export interface HojaSpec {
  nombre: string;
  /** número de fila (1..n) -> celdas desde la columna A */
  filas: Record<number, Fila>;
  merges?: string[];
}

export async function libro(hojas: HojaSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre);
    for (const [n, celdas] of Object.entries(h.filas)) {
      celdas.forEach((v, i) => {
        if (v !== undefined && v !== null) ws.getRow(Number(n)).getCell(i + 1).value = v as ExcelJS.CellValue;
      });
    }
    for (const m of h.merges ?? []) ws.mergeCells(m);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
export const fecha = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
export const dmy = (y: number, m: number, d: number) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;

export interface Mov {
  y: number; m: number; d: number;
  ref?: string; desc: string; deb?: number; cre?: number;
}

/** Calcula el saldo corrido (en unidades, 2 decimales) a partir de una apertura. */
export function conSaldo(movs: Mov[], apertura: number): (Mov & { saldo: number })[] {
  let s = Math.round(apertura * 100);
  return movs.map((mv) => {
    s += Math.round((mv.cre ?? 0) * 100) - Math.round((mv.deb ?? 0) * 100);
    return { ...mv, saldo: s / 100 };
  });
}

export const MOVS_BASE: Mov[] = [
  { y: 2026, m: 8, d: 3, ref: "R-1001", desc: "Pago:SERVICIO UNO 11111111", deb: 150.5 },
  { y: 2026, m: 8, d: 3, ref: "R-1002", desc: "Pago:SERVICIO UNO 11111111", deb: 150.5 }, // repetido a propósito (idéntico salvo saldo)
  { y: 2026, m: 8, d: 10, ref: "R-1003", desc: "Transferencia recibida cliente", cre: 2000 },
  { y: 2026, m: 8, d: 20, ref: "R-1004", desc: "Cargo comisión", deb: 12.34 },
];

const fechaCelda = (modo: "date" | "serial" | "texto", y: number, m: number, d: number) =>
  modo === "date" ? fecha(y, m, d) : modo === "serial" ? serial(y, m, d) : dmy(y, m, d);

export type ModoFecha = "date" | "serial" | "texto";

export function e1(o: { iban?: string; hojaNombre?: string; modo?: ModoFecha; moneda?: string; movs?: Mov[]; apertura?: number; mes?: number; extra?: Fila } = {}) {
  const { iban = "CR91010710102200000001", modo = "date", moneda, movs = MOVS_BASE, apertura = 1000, mes = 8 } = o;
  const filas: Record<number, Fila> = {
    1: ["Periodo Seleccionado", null, null, "SOCIEDAD SINTETICA S.A."],
    2: ["Fecha", `Del: 01/${String(mes).padStart(2, "0")}/2026`, `Al: 28/${String(mes).padStart(2, "0")}/2026`, moneda ? `BCT 0000 ${moneda}` : "BCT 0000"],
    3: ["Emitido", fecha(2026, mes + 1, 1)],
    4: [iban],
    5: ["Movimientos"],
    6: ["Fecha", "Concepto", "Referencia", "Debito", "Credito", "Saldo"],
  };
  conSaldo(movs, apertura).forEach((m, i) => {
    filas[7 + i] = [fechaCelda(modo, m.y, m.m, m.d), m.desc, m.ref, m.deb ?? 0, m.cre ?? 0, m.saldo, ...(o.extra ?? [])];
  });
  return libro([{ nombre: o.hojaNombre ?? iban, filas }]);
}

export function e2(o: { iban?: string; moneda?: string; movs?: Mov[]; apertura?: number } = {}) {
  const { iban = "CR94010200000000000004", moneda = "USD", movs = MOVS_BASE, apertura = 400 } = o;
  const filas: Record<number, Fila> = {
    2: [null, null, null, null, "DETALLE DE MOVIMIENTOS DEL PERÍODO"],
    5: ["Encabezado"],
    6: ["Nombre", "SOCIEDAD SINTETICA", null, null, null, null, "Saldo Inicial", null, apertura],
    7: ["Producto", iban, null, null, null, moneda],
    13: ["Fecha", "Referencia", null, "Código", "Descripción", null, null, "Débitos", "Créditos", "Balance*"],
    14: [null, null, null, null, "Saldo Inicial", null, null, null, null, apertura],
  };
  const merges = ["B13:C13", "E13:G13", "J13:K13"];
  const datos = conSaldo(movs, apertura);
  datos.forEach((m, i) => {
    const r = 15 + i;
    filas[r] = [dmy(m.y, m.m, m.d), m.ref, m.ref, "PP", m.desc, m.desc, m.desc, m.deb ?? 0, m.cre ?? 0, m.saldo, m.saldo];
    merges.push(`B${r}:C${r}`, `E${r}:G${r}`, `J${r}:K${r}`);
  });
  const pie = 15 + datos.length + 2;
  filas[pie] = ["Cuadro de Resumen"];
  filas[pie + 1] = ["Código", "Descripción", null, null, null, null, null, "Cant. Débitos", "Total Débitos", "Cant. Créditos", "Total Créditos"];
  filas[pie + 2] = ["PP", "Pago Proveedores", null, null, null, null, null, "3", 313.34, "1", 2000];
  filas[pie + 3] = ["Totales", null, null, null, null, null, null, "3", 313.34, "1", 2000];
  return libro([{ nombre: "Report1", filas, merges }]);
}

/** E3 variante DM: fila 1 «fantasma» con rótulos, encabezado en fila 18; importes y saldo como TEXTO con comas. */
export function e3dm(o: { iban?: string; movs?: Mov[]; apertura?: number; monedaTexto?: string } = {}) {
  const { iban = "CR98012300130000000008", movs = MOVS_BASE, apertura = 1000, monedaTexto = "DOLAR" } = o;
  const filas: Record<number, Fila> = {
    1: ["GENERAL", "REFERENCIA", "DESCRIPCION", "DEBITOS", "CREDITOS", "SALDO"],
    4: [null, null, "ESTADO"], 5: [null, null, "DE"], 6: [null, null, "MOVIMIENTO"],
    9: ["FECHA       :", null, "01/09/2026"],
    14: ["Nº DE CUENTA     :", null, iban],
    16: ["MONEDA              :", null, monedaTexto],
    17: [null, null, "MOVIMIENTOS"],
    18: ["FECHA", "REFERENCIA", "DESCRIPCION", "DEBITOS", "CREDITOS", "SALDO"],
  };
  const coma = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  conSaldo(movs, apertura).forEach((m, i) => {
    filas[19 + i] = [dmy(m.y, m.m, m.d), m.ref, m.desc, m.deb ? String(m.deb.toFixed(2)) : " ", m.cre ? m.cre.toFixed(2) : "", coma(m.saldo)];
  });
  return libro([{ nombre: iban, filas }]);
}

export function e3mememc(o: { iban?: string; movs?: Mov[]; apertura?: number } = {}) {
  const { iban = "CR99012300130000000009", movs = MOVS_BASE, apertura = 1000 } = o;
  const filas: Record<number, Fila> = {
    11: ["Nº DE CUENTA     :", iban],
    12: ["MONEDA              :", "Colones"],
    14: ["FECHA", "REFERENCIA", "DESCRIPCION", "DEBITOS", "CREDITOS", "SALDO"],
  };
  conSaldo(movs, apertura).forEach((m, i) => {
    filas[15 + i] = [dmy(m.y, m.m, m.d), m.ref, m.desc, m.deb ?? "", m.cre ?? "", `${m.saldo.toFixed(2)}`];
  });
  return libro([{ nombre: iban, filas }]);
}

export function e4(o: { iban?: string; movs?: Mov[]; apertura?: number } = {}) {
  const { iban = "CR90010402340000000010", movs = MOVS_BASE, apertura = 1000 } = o;
  const filas: Record<number, Fila> = {
    5: ["Titular de la cuenta", "SOCIEDAD SINTETICA"],
    6: ["Número de Cuenta", iban],
    7: ["Moneda", "Dolares"],
    13: ["Fecha", "Descripción", "Ref.", "Débitos (DR)", "Créditos (CR)", "Saldo Contable", "Ref2", "Tipo Tran", "Causa", "Sucursal", "D/C", "Cuenta"],
  };
  conSaldo(movs, apertura).forEach((m, i) => {
    filas[14 + i] = [dmy(m.y, m.m, m.d), m.desc, m.ref, m.deb ?? 0, m.cre ?? 0, m.saldo, "x", "TT", "C", "001", m.deb ? "D" : "C", iban];
  });
  return libro([{ nombre: "Movimmientos", filas }]);
}

const e5Meta = (iban: string): Record<number, Fila> => ({
  4: [null, "CUENTA EMPRESARIAL DAVIVIENDA"],
  6: [null, "PERIODO DE ESTADO CONSOLIDADO 01/09/2026"],
  8: [null, "CUENTA ACTUAL:   11111111"],
  13: [null, "MONEDA: Colones"],
});

/** E5: hoja de consolidado (sin Concepto) + hoja de detalle con encabezado cerca de la fila 28. */
export function e5(o: { iban?: string; movs?: Mov[]; apertura?: number } = {}) {
  const { iban = "CR89010402340000000011", movs = [], apertura = 5000 } = o;
  const consolidado: Record<number, Fila> = {
    ...e5Meta(iban),
    17: [null, "Saldo Anterior", null, null, null, apertura],
    18: [null, "FECHA", "FECHA", "DEBITOS", "DEBITOS", "CREDITOS", "CREDITOS", "INTERESES OVN", "INTERESES OVN", "SALDOS", "SALDOS", "OVERNIGTH", "OVERNIGTH"],
    19: [null, null, null, null, "9999,99"],
  };
  const detalle: Record<number, Fila> = {
    ...e5Meta(iban),
    18: [null, "SALDO INICIAL", null, null, null, null, apertura],
    28: [null, "FECHA", "FECHA", "TRANSAC.", "TRANSAC.", "CONCEPTO", "CONCEPTO", "DEBITOS", "DEBITOS", "CREDITOS", "CREDITOS", "SALDO", "SALDO", "REFERENCIA", "REFERENCIA"],
  };
  conSaldo(movs, apertura).forEach((m, i) => {
    detalle[29 + i] = [null, dmy(m.y, m.m, m.d), m.desc.length ? dmy(m.y, m.m, m.d) : "", "NC", "NC", m.desc, m.desc, m.deb ?? 0, m.deb ?? 0, m.cre ?? 0, m.cre ?? 0, m.saldo, m.saldo, m.ref, m.ref];
  });
  return libro([
    { nombre: "CONSOLIDADO COLONES", filas: consolidado },
    { nombre: "DETALLE  COLONES  0000011", filas: detalle },
  ]);
}

export function e6(o: { iban?: string; movs?: Mov[]; apertura?: number } = {}) {
  const { iban = "CR88015107510000000012", movs = MOVS_BASE, apertura = 1000 } = o;
  const filas: Record<number, Fila> = {
    1: ["ESTADO DE CUENTA BNCR"],
    3: ["Cuenta IBAN:", iban],
    4: ["Moneda:", "USD"],
    6: ["FECHA", "DESCRIPCION", "REFERENCIA", "DEBITOS", "CREDITOS", "SALDO"],
  };
  conSaldo(movs, apertura).forEach((m, i) => {
    filas[7 + i] = [dmy(m.y, m.m, m.d), m.desc, m.ref, m.deb ?? "", m.cre ?? "", m.saldo];
  });
  return libro([{ nombre: iban, filas }]);
}

/** E7: monto único con signo (negativo = débito), saldo diario; sin movimientos si movs = []. */
export function e7(o: { iban?: string; movs?: Mov[]; apertura?: number } = {}) {
  const { iban = "CR97015107510000000007", movs = MOVS_BASE.map((m) => ({ ...m, y: 2026, m: 9 })), apertura = 3000000 } = o;
  const filas: Record<number, Fila> = {
    1: ["BANCO NACIONAL - Estado de Cuenta Corriente"],
    4: ["Saldo anterior (08/2026):", apertura],
    7: ["Cuenta IBAN:", iban],
    12: ["FECHA", "NÚMERO", "DESCRIPCIÓN", "MONTO", "SALDO DIARIO"],
  };
  const datos = conSaldo(movs, apertura);
  datos.forEach((m, i) => {
    filas[13 + i] = [dmy(m.y, m.m, m.d), m.ref ?? "1", m.desc, (m.cre ?? 0) - (m.deb ?? 0), m.saldo];
  });
  const r0 = 13 + datos.length + 1;
  filas[r0] = [null, null, null, "Total débitos", 0];
  filas[r0 + 1] = [null, null, null, "Total créditos", 0];
  return libro([{ nombre: "Estado de Cuenta", filas, merges: ["A1:E1"] }]);
}
