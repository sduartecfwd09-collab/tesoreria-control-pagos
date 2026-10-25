import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL: base de desarrollo. SHADOW_DATABASE_URL: base temporal que Prisma usa solo para
// crear migraciones. Ambas vienen de .env (ver .env.example).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
