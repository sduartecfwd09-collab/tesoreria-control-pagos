import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { aNumero } from "./domain/montos.js";
import { relojSistema, type Reloj } from "./domain/reloj.js";
import { rutasArchivos } from "./routes/archivos.js";
import { rutasAvisos } from "./routes/avisos.js";
import { rutasMovimientosSinObligacion } from "./routes/movimientos-sin-obligacion.js";
import { rutasFechas } from "./routes/fechas.js";
import { rutasHistorico } from "./routes/historico.js";
import { rutasIdentidad } from "./routes/identidad.js";
import { rutasImportaciones } from "./routes/importaciones.js";
import { rutasObligaciones } from "./routes/obligaciones.js";
import { rutasParametros } from "./routes/parametros.js";
import { rutasVencimientos } from "./routes/vencimientos.js";

/** `reloj` se inyecta en las pruebas para fijar la fecha de hoy. */
export async function crearApp(opts: { logger?: boolean; reloj?: Reloj; modoPruebas?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  const reloj = opts.reloj ?? relojSistema;
  const modoPruebas = opts.modoPruebas ?? env.MODO_PRUEBAS;

  // JSON no admite BigInt: las rutas convierten los montos, y esta red de seguridad evita que un BigInt olvidado rompa la respuesta.
  app.setReplySerializer((payload) => JSON.stringify(payload, (_clave, v) => (typeof v === "bigint" ? aNumero(v) : v)));

  // Los errores nunca exponen detalles internos (rutas de archivos, consultas): solo un texto claro. Se registra el estado, no el mensaje.
  app.setErrorHandler((error, req, reply) => {
    const codigo = (error as { statusCode?: unknown }).statusCode;
    const estado = typeof codigo === "number" && codigo >= 400 ? codigo : 500;
    req.log.error({ estado }, "error en la solicitud");
    if (estado >= 500) return reply.code(500).send({ error: "Ocurrió un error en el servidor" });
    return reply.code(estado).send({ error: estado === 404 ? "No encontrado" : "La solicitud no es válida" });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "No encontrado" }));

  // CORS: solo los orígenes del Frontend configurados en CORS_ORIGINS.
  await app.register(cors, { origin: env.CORS_ORIGINS, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] });

  app.get("/api/salud", async () => ({ estado: "ok", hora: reloj().toISOString() }));
  await app.register(rutasParametros);
  await app.register(rutasAvisos, { reloj, modoPruebas });
  await app.register(rutasArchivos, { modoPruebas });
  await app.register(rutasMovimientosSinObligacion, { modoPruebas });
  await app.register(rutasIdentidad, { modoPruebas, reloj });
  await app.register(rutasImportaciones, { modoPruebas });
  await app.register(rutasObligaciones, { reloj, modoPruebas });
  await app.register(rutasVencimientos, { reloj, modoPruebas });
  await app.register(rutasFechas, { reloj, modoPruebas });
  await app.register(rutasHistorico, { reloj, modoPruebas });

  return app;
}
