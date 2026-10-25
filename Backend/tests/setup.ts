import { exigirBaseDePruebas } from "../src/config/proteccion-pruebas.js";

// Segunda barrera: antes de cada archivo de pruebas se comprueba que la base a la que se va a conectar
// (DATABASE_URL, que vitest.config.ts fija igual a TEST_DATABASE_URL) termina en _test.
exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL");
