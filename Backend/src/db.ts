import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./config/env.js";

// Único punto donde se crea el cliente de Prisma. Solo lo usan los repositorios.
export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: env.DATABASE_URL }),
});
