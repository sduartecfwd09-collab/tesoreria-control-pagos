import type { Continuidad, MovimientoLeido } from "./tipos.js";

/**
 * Continuidad del saldo: saldo anterior + crédito - débito = saldo siguiente.
 * Se prueba en el orden del archivo y en el inverso (algunos bancos listan del más reciente al más antiguo)
 * y se informa el que tenga menos fallos. Si hay saldo de apertura se compara con el primer movimiento
 * (en el orden elegido). Nunca descarta nada: solo informa.
 *
 * saldoDiario = true (E7): el saldo es el de cierre del día; se compara por día:
 * saldo del último movimiento del día = saldo del último movimiento del día anterior + suma del día.
 */
export function verificarContinuidad(
  movs: MovimientoLeido[],
  opts: { apertura: number | null; saldoDiario?: boolean },
): Continuidad {
  const conSaldo = movs.filter((m) => m.saldo !== null);
  if (movs.length === 0) {
    return { estado: "no_verificable", verificados: 0, fallos: 0, orden: "ascendente", filasConFallo: [], usoSaldoApertura: false, motivo: "sin movimientos" };
  }
  if (conSaldo.length !== movs.length) {
    return { estado: "no_verificable", verificados: 0, fallos: 0, orden: "ascendente", filasConFallo: [], usoSaldoApertura: false, motivo: "hay movimientos sin saldo" };
  }

  const probar = (lista: MovimientoLeido[]) => (opts.saldoDiario ? porDia(lista, opts.apertura) : porMovimiento(lista, opts.apertura));
  const asc = probar(movs);
  if (asc.fallos === 0) return construir(asc, "ascendente", opts.apertura);
  const desc = probar([...movs].reverse());
  return desc.fallos < asc.fallos ? construir(desc, "descendente", opts.apertura) : construir(asc, "ascendente", opts.apertura);
}

interface Prueba {
  verificados: number;
  fallos: number;
  filas: number[];
  usoApertura: boolean;
}

function porMovimiento(lista: MovimientoLeido[], apertura: number | null): Prueba {
  let verificados = 0;
  const filas: number[] = [];
  let previo = apertura;
  for (const m of lista) {
    if (previo !== null) {
      verificados++;
      if (previo + m.credito - m.debito !== m.saldo) filas.push(m.fila);
    }
    previo = m.saldo;
  }
  return { verificados, fallos: filas.length, filas, usoApertura: apertura !== null };
}

function porDia(lista: MovimientoLeido[], apertura: number | null): Prueba {
  const dias = new Map<number, { neto: number; cierre: number; fila: number }>();
  for (const m of lista) {
    const k = m.fecha.getTime();
    const d = dias.get(k) ?? { neto: 0, cierre: 0, fila: m.fila };
    d.neto += m.credito - m.debito;
    d.cierre = m.saldo!;
    dias.set(k, d);
  }
  const orden = [...dias.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
  let verificados = 0;
  const filas: number[] = [];
  let previo = apertura;
  for (const d of orden) {
    if (previo !== null) {
      verificados++;
      if (previo + d.neto !== d.cierre) filas.push(d.fila);
    }
    previo = d.cierre;
  }
  return { verificados, fallos: filas.length, filas, usoApertura: apertura !== null };
}

function construir(p: Prueba, orden: "ascendente" | "descendente", apertura: number | null): Continuidad {
  if (p.verificados === 0) {
    return { estado: "no_verificable", verificados: 0, fallos: 0, orden, filasConFallo: [], usoSaldoApertura: apertura !== null, motivo: "un solo saldo y sin saldo de apertura" };
  }
  return {
    estado: p.fallos === 0 ? "cuadra" : "no_cuadra",
    verificados: p.verificados,
    fallos: p.fallos,
    orden,
    filasConFallo: p.filas.slice(0, 10),
    usoSaldoApertura: p.usoApertura,
  };
}
