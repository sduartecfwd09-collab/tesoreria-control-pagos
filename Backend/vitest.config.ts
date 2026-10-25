import "dotenv/config";
import { defineConfig } from "vitest/config";
import { exigirBaseDePruebas } from "./src/config/proteccion-pruebas.js";

// Las pruebas usan su propia base (TEST_DATABASE_URL, nombre terminado en _test) para no tocar los datos del
// piloto. Si el nombre no termina en _test, esta configuracion lanza un error y no corre nada.
const urlPruebas = exigirBaseDePruebas(process.env.TEST_DATABASE_URL);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_URL: urlPruebas },
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false, // todas las pruebas comparten la misma base
    testTimeout: 120_000,
  },
});
