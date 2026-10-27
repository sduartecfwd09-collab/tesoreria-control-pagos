import { crearApp } from "./app.js";
import { env } from "./config/env.js";
import { programarMantenimiento } from "./vencimientos/mantenimiento.js";

const app = await crearApp({ logger: true });
await app.listen({ port: env.PORT, host: env.HOST });
programarMantenimiento((mensaje) => app.log.info(mensaje));
