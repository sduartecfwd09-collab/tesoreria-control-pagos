import { env } from "../config/env.js";
import { nombreDeBase } from "../conexion.js";
import { informeFechas } from "../ingest/informe-fechas.js";
import { fechasPorSociedadYMes } from "../repositories/consultas.js";
import { prisma } from "../db.js";

// Uso: npm run db:verificar-datos
// Solo lee la base (no escribe) e imprime agregados de fechas por sociedad y mes: nunca montos, cuentas,
// descripciones ni nombres.
console.log(informeFechas(nombreDeBase(env.DATABASE_URL), await fechasPorSociedadYMes()));
await prisma.$disconnect();
