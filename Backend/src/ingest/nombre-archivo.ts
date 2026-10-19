// Convención de nombre: <IBAN o número de cuenta> <MMAA> <SOCIEDAD>.xlsx

export interface NombreArchivo {
  cuenta: string;
  periodo: string; // AAAA-MM
  sociedad: string;
  codigoBanco: string | null; // dígitos 5-8 del IBAN (CRkk BBBB ...); null si la cuenta no es un IBAN
}

export function parsearNombreArchivo(nombre: string): NombreArchivo | null {
  const m = /^(\S+)\s+(\d{2})(\d{2})\s+(\S+?)\.xlsx$/i.exec(nombre.trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  const cuenta = m[1]!.toUpperCase();
  return {
    cuenta,
    periodo: `${2000 + Number(m[3])}-${m[2]}`,
    sociedad: m[4]!.toUpperCase(),
    codigoBanco: /^CR\d{20}$/.test(cuenta) ? cuenta.slice(4, 8) : null,
  };
}

/** SUPUESTO (confirmado por el texto de los archivos de BCT): ...1010 21... = CRC, ...1010 22... = USD. */
export function monedaDeIbanBct(cuenta: string): "CRC" | "USD" | null {
  if (!/^CR\d{20}$/.test(cuenta) || cuenta.slice(4, 8) !== "0107") return null;
  const marca = cuenta.slice(8, 14);
  if (marca === "101021") return "CRC";
  if (marca === "101022") return "USD";
  return null;
}
