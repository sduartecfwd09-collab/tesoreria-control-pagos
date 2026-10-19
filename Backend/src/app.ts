import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { rutasParametros } from "./routes/parametros.js";

export async function crearApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  // CORS: solo los orígenes del Frontend configurados en CORS_ORIGINS.
  await app.register(cors, { origin: env.CORS_ORIGINS, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] });

  app.get("/api/salud", async () => ({ estado: "ok", hora: new Date().toISOString() }));
  await app.register(rutasParametros);

  return app;
}
