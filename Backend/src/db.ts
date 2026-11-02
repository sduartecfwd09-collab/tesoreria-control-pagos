import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./config/env.js";
import { crearAdaptador } from "./conexion.js";

// Único punto donde se crea el cliente de Prisma. Solo lo usan los repositorios.
export const prisma = new PrismaClient({ adapter: crearAdaptador(env.DATABASE_URL) });
