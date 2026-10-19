import { crearApp } from "./app.js";
import { env } from "./config/env.js";

const app = await crearApp({ logger: true });
await app.listen({ port: env.PORT, host: "0.0.0.0" });
