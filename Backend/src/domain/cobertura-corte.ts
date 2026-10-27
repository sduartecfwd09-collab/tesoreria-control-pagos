// Cobertura de datos para decidir si «no hay pago» es una afirmación segura. Funciones puras: sin base.
//
// Fecha de corte de una cuenta en un mes (fecha hasta la cual sus movimientos están completos):
//  - mes ya cerrado (anterior al mes de «hoy») con archivo leído: el último día del mes;
//  - mes en curso con archivo leído: la última fecha con movimientos (null si el archivo no trae ninguno);
//  - sin archivo leído de esa cuenta y mes: no hay corte (la cuenta no cubre ese mes).
// El archivo no guarda el fin del período que declara; por eso el mes en curso se acota con el último movimiento.
// La cobertura de una sociedad es la menor fecha de corte entre todas sus cuentas conocidas.

export interface CuentaCorte {
  cuentaId: number;
  /** AAAA-MM -> última fecha con movimientos de esa cuenta en ese mes (null si el archivo leído no trae movimientos) */
  meses: Map<string, Date | null>;
}

export interface ResultadoCobertura {
  cubre: boolean;
  /** hasta qué fecha hay datos continuos desde el inicio pedido; null si ni siquiera el inicio está cubierto */
  hasta: Date | null;
}

const MS_DIA = 86_400_000;
const periodoDeFecha = (f: Date) => f.toISOString().slice(0, 7);
const finDeMes = (periodo: string) => new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0));
const primerDia = (periodo: string) => new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, 1));
const mesSiguiente = (periodo: string) => periodoDeFecha(new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 1)));
export const diasEntre = (a: Date, b: Date) => Math.floor(b.getTime() / MS_DIA) - Math.floor(a.getTime() / MS_DIA);

/** Fecha de corte de una cuenta en un mes, o null si no cubre ese mes. */
export function corteDeMes(cuenta: CuentaCorte, mes: string, hoy: Date): Date | null {
  if (!cuenta.meses.has(mes)) return null;
  if (mes < periodoDeFecha(hoy)) return finDeMes(mes);
  if (mes === periodoDeFecha(hoy)) return cuenta.meses.get(mes) ?? null;
  return null;
}

/**
 * ¿Hay datos de todas las cuentas de la sociedad entre desde y hasta (ambos incluidos)? Si no, hasta dónde llegan
 * (continuos desde «desde»). Una sociedad sin cuentas conocidas no cubre nada.
 */
export function coberturaDeSociedad(cuentas: CuentaCorte[], desde: Date, hasta: Date, hoy: Date): ResultadoCobertura {
  if (cuentas.length === 0) return { cubre: false, hasta: null };
  let cubierto: Date | null = null;
  const ultimoMes = periodoDeFecha(hasta);
  for (let mes = periodoDeFecha(desde); mes <= ultimoMes; mes = mesSiguiente(mes)) {
    const cortes: Date[] = [];
    for (const c of cuentas) {
      const corteCuenta = corteDeMes(c, mes, hoy);
      if (corteCuenta === null) return { cubre: false, hasta: cubierto };
      cortes.push(corteCuenta);
    }
    const corte = cortes.reduce((m, c) => (c < m ? c : m), cortes[0]!);
    const necesario = hasta < finDeMes(mes) ? hasta : finDeMes(mes);
    if (corte < necesario) return { cubre: false, hasta: corte < primerDia(mes) ? cubierto : corte };
    cubierto = necesario;
  }
  return { cubre: true, hasta: cubierto };
}

/** Última fecha hasta la que una cuenta tiene datos (el corte de su mes más reciente con datos), o null si no tiene. */
export function corteMasReciente(cuenta: CuentaCorte, hoy: Date): Date | null {
  for (const mes of [...cuenta.meses.keys()].sort().reverse()) {
    const corte = corteDeMes(cuenta, mes, hoy);
    if (corte !== null) return corte; // un archivo del mes en curso sin movimientos aún no aporta corte: vale el mes anterior
  }
  return null;
}

export interface AvisoDatos { sociedadId: number; /** última fecha con datos continuos de todas sus cuentas; null si alguna no tiene */ corte: Date | null }

/** Sociedades cuyo corte de cobertura es anterior a hoy menos `dias` (el corte es el menor entre sus cuentas). */
export function avisosDeDatos(cuentas: Map<number, CuentaCorte[]>, hoy: Date, dias: number): AvisoDatos[] {
  const limite = new Date(hoy.getTime() - dias * MS_DIA);
  const avisos: AvisoDatos[] = [];
  for (const [sociedadId, lista] of cuentas) {
    const cortes = lista.map((c) => corteMasReciente(c, hoy));
    const corte = cortes.some((c) => c === null) ? null : (cortes as Date[]).reduce((m, c) => (c < m ? c : m));
    if (corte === null || corte < limite) avisos.push({ sociedadId, corte });
  }
  return avisos;
}
