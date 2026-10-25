import "dotenv/config";
import { z } from "zod";

// Las variables vacías en .env llegan como "": se tratan como no definidas.
const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = <T extends z.ZodType>(s: T) => z.preprocess(vacioAUndefined, s.optional());

const esquema = z.object({
  PORT: z.preprocess(vacioAUndefined, z.coerce.number().int().min(1).max(65535).default(3001)),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  CORS_ORIGINS: z
    .preprocess(vacioAUndefined, z.string().default("http://localhost:3000"))
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  STATEMENTS_ROOT: opcional(z.string()),
  CATALOGO_FILE: opcional(z.string()),
  USUARIOS_FILE: opcional(z.string()),
  SOCIEDADES_FILE: opcional(z.string()),
  MAIL_DRAFTS_DIR: z.preprocess(vacioAUndefined, z.string().default("./borradores")),
  SMTP_HOST: opcional(z.string()),
  SMTP_PORT: opcional(z.coerce.number().int().min(1).max(65535)),
  SMTP_USER: opcional(z.string()),
  SMTP_PASSWORD: opcional(z.string()),
  SMTP_FROM: opcional(z.string()),
});

export type Env = z.infer<typeof esquema>;

export function leerEnv(fuente: Record<string, string | undefined> = process.env): Env {
  const r = esquema.safeParse(fuente);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración inválida (.env):\n${detalle}`);
  }
  return r.data;
}

export const env = leerEnv();
