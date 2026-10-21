import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { relojSistema, type Reloj } from "./domain/reloj.js";
import { rutasImportaciones } from "./routes/importaciones.js";
import { rutasObligaciones } from "./routes/obligaciones.js";
import { rutasParametros } from "./routes/parametros.js";
import { rutasVencimientos } from "./routes/vencimientos.js";

/** `reloj` se inyecta en las pruebas para fijar la fecha de hoy. */
export async function crearApp(opts: { logger?: boolean; reloj?: Reloj } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  const reloj = opts.reloj ?? relojSistema;

  // CORS: solo los orígenes del Frontend configurados en CORS_ORIGINS.
  await app.register(cors, { origin: env.CORS_ORIGINS, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] });

  app.get("/api/salud", async () => ({ estado: "ok", hora: reloj().toISOString() }));
  await app.register(rutasParametros);
  await app.register(rutasImportaciones);
  await app.register(rutasObligaciones, { reloj });
  await app.register(rutasVencimientos, { reloj });

  return app;
}
