import { normalizarNombreSociedad } from "../domain/sociedades.js";

// Nombres de la lista de Tesorería que no coinciden con el nombre largo de la sociedad, y la abreviatura de la
// sociedad a la que corresponden. Es configuración del código (no un archivo de datos). Cada línea es una decisión
// explícita: no se adivina por parecido.
const ALIAS: Record<string, string> = {
  "INVERSIONES INMOBILIARIAS BONAVISTA IIBV": "BONAVISTA",
  "GARNIER Y GARNIER DESARROLLOS INMOBILIARIOS S.A.": "GGDI",
  // La lista de Tesorería tiene un error de digitación; el nombre oficial es «INVERSIONES MEMEMC, S.A».
  "INVERSIONES MEMEC, S.A": "MEMEMC",
  "WW Costa Rica": "WW",
  "ZONA FRANCA LA LIMA, S.R.L.": "ZFL",
};

const PORCLAVE = new Map(Object.entries(ALIAS).map(([nombre, codigo]) => [normalizarNombreSociedad(nombre), codigo]));

/** Abreviatura de la sociedad a la que corresponde un nombre de la lista, o null si no hay alias. */
export const codigoPorAlias = (nombre: string): string | null => PORCLAVE.get(normalizarNombreSociedad(nombre)) ?? null;
