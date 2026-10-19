import { defineConfig } from "vitest/config";

// Las pruebas usan su propia base (test.db) para no tocar los datos del piloto.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_URL: "file:./test.db" },
    globalSetup: ["tests/global-setup.ts"],
  },
});
