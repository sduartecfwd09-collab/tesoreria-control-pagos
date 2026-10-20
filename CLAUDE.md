# CLAUDE.md · Control de pagos de Tesorería (piloto)

Reglas fijas del proyecto. Detalle técnico, arranque y contrato de API: `README.md`.

## Confidencialidad (no negociable)
- La carpeta PASANTES (estados de cuenta y tabla de pagos frecuentes) es **solo lectura**: nunca se escribe, mueve ni copia al repositorio.
- Nunca se versionan datos financieros (`.xlsx`, `.csv`, `.eml`, resultados), `.env` ni bases de datos (`*.db`). El `.gitignore` ya los excluye; revisar `git status` antes de cada commit.
- Consola, logs y errores muestran solo conteos y estados, nunca descripciones, montos, identificadores ni filas reales.
- Las pruebas usan archivos sintéticos generados por código. Las de integración con datos reales se omiten solas si la ruta no existe.
- Rutas a datos reales solo en variables de entorno (`.env`), con su ejemplo vacío en `.env.example`.

## Git
- Se trabaja en la rama `sarai`. Se integra a `main` por PR con **merge commit**.
- Commits pequeños, uno por tarea, con prefijo convencional en español (`feat(backend):`, `feat(frontend):`, `chore:`, `docs:`, `test:`).
- `git status` antes de cada commit. **Push solo cuando se pida.**
- Cada hito termina con reporte y espera aprobación antes del siguiente.

## Arquitectura
- `Backend/` (Node + TypeScript, Fastify, Prisma + SQLite, zod, vitest; puerto 3001) y `Frontend/` (Next.js App Router + Tailwind; puerto 3000) son aplicaciones separadas que hablan solo por HTTP. El Frontend nunca toca la base.
- Los **repositorios** (`Backend/src/repositories`) son la única capa que usa Prisma; rutas y dominio no importan Prisma directamente.
- Los **parámetros de negocio viven en la base** (tabla Parametro, editables en Configuración), no en el código. Los que son supuesto se marcan `supuesto: true`.
- Montos en centavos (enteros); fechas ISO 8601; errores `{ "error": "texto" }` en español claro.
- Cambios al esquema de Prisma: explicar qué cambia y por qué **antes** de aplicarlos.
- Dependencias nuevas: solo las que el hito necesite, y avisar cuáles se instalaron.

## Decisiones tomadas
- **Ventana de cruce:** ±3 días calendario alrededor de la fecha esperada, y puede cruzar de un mes a otro (parámetro `ventana_dias`).
- **Monto sin definir:** el monto esperado es opcional; en el piloto no se valida el monto (`tolerancia_pct` existe pero no se aplica). Si falta, se muestra "monto sin definir".
- **Pago repetido:** un vencimiento se concilia con un solo pago; un segundo pago que calce con el mismo vencimiento no lo duplica, se marca como alerta para revisión.
- **sin_informacion:** si no hay estado de cuenta leído para la cuenta y el periodo, el vencimiento queda "sin información", no "vencido".
- **Banco y moneda de la cuenta:** editables a mano por Tesorería; la importación ya no los pisa.
- **Frecuencia por defecto:** mensual (supuesto, parámetro `frecuencia_defecto`).
- **Estilo:** paleta Garnier, contraste verificado (`npm run contraste`), todo estado con etiqueta de texto además del color.
- Los supuestos se marcan en código, README y pantalla ("Por confirmar con Tesorería").

## Hitos
| Hito | Alcance | Estado |
|---|---|---|
| 1 | Esqueleto Backend/Frontend, modelo, parámetros y pantalla Configuración | Integrado en `main` |
| 2 | Importación de estados de cuenta, cobertura y Archivos importados | Integrado en `main` (PR #1) |
| 3 | Catálogo de obligaciones y generación de vencimientos | En curso |
| 4 | Cruce pagos ↔ vencimientos y cálculo de estados | Pendiente |
| 5+ | Avisos, autenticación y roles, despliegue con TI | Por definir |
