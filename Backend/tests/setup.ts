import { beforeAll } from "vitest";
import { exigirBaseDePruebas } from "../src/config/proteccion-pruebas.js";

// Segunda barrera: antes de cada archivo de pruebas se comprueba que la base a la que se va a conectar
// (DATABASE_URL, que vitest.config.ts fija igual a TEST_DATABASE_URL) termina en _test.
exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL");

// Las pruebas parten sin vencimientos generados por adelantado (0 meses): así cada una ve solo el mes en curso y lo que su aviso alcanza.
// Las del calendario anticipado (vencimientos-futuros.test.ts) suben el valor a 12, que es el del sistema.
beforeAll(async () => {
  const { fijarMesesAdelante } = await import("./helpers/db.js");
  await fijarMesesAdelante(0);
});
