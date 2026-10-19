# Control de pagos · Tesorería (piloto)

Dos aplicaciones independientes que se comunican por HTTP:

- **Backend/** — Node.js + TypeScript, Fastify, Prisma + SQLite, zod, vitest. API REST en `http://localhost:3001`.
- **Frontend/** — Next.js (App Router) + TypeScript + Tailwind. Solo interfaz, en `http://localhost:3000`. Nunca toca la base de datos.

## Arranque (Hito 1)

Requiere Node 20 o superior. Dos terminales:

```
# Terminal 1 — Backend (primera vez: instala, crea la base y carga parámetros iniciales)
cd Backend
npm install
copy .env.example .env
npm run db:setup
npm run dev          # http://localhost:3001/api/salud

# Terminal 2 — Frontend
cd Frontend
npm install
copy .env.local.example .env.local
npm run dev          # http://localhost:3000  (abre Configuración)
```

Pruebas: `cd Backend && npm test` · `cd Frontend && npm run lint && npm run typecheck && npm run contraste`.

## Contrato Backend ↔ Frontend

| Ruta | Descripción |
|---|---|
| `GET /api/salud` | Estado del servidor |
| `GET /api/parametros` | Lista parámetros con etiqueta, ayuda, unidad, rango, opciones y marca `supuesto` → `{ datos: [...] }` |
| `PUT /api/parametros/:id` | Cuerpo `{ "valor": ... }`. 200 `{ datos }`, 400 cuerpo inválido, 404 no existe, 422 valor fuera de regla (`{ error }` en español) |

Formato: JSON; errores como `{ "error": "texto" }`; fechas ISO 8601; montos en centavos (enteros).
**CORS:** el Backend solo acepta los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:3000`). El Frontend lee la URL del API desde `NEXT_PUBLIC_API_URL`.
**Tipos compartidos (propuesta):** sin carpeta común. Hoy `Frontend/src/lib/tipos.ts` replica el contrato a mano. Cuando crezca, el Backend publicará un `openapi.json` (esquemas zod) y el Frontend generará sus tipos desde él con un script. Esto necesita librerías nuevas (por aprobar).

## Supuestos (por confirmar con Tesorería)

- `tolerancia_pct = 10` por categoría y `frecuencia_defecto = mensual`. No se aplican aún (el monto no se valida en el piloto).
- Colores de estado rojo y ámbar (tokens en `Frontend/src/app/globals.css`).
- Las categorías Electricidad, Telecom y CCSS se crean desde la tabla de pagos; el catálogo completo llega en el Hito 3.
