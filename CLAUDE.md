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
- **Pago repetido:** un solo pago concilia el vencimiento. Dos pagos de la misma obligación en el mismo periodo son una inconsistencia: el vencimiento queda "pagado con inconsistencia" para revisión.
- **sin_informacion:** no significa "pago no aparece" ni "vencido". Se muestra como un problema de cobertura de datos, no como alerta de pago.
- **Avisos:** 3 días antes del vencimiento (parámetro `aviso_dias`). Llegan por tablero y por correo (el correo solo como borrador) al responsable asignado y al encargado principal; sin responsable, solo al encargado.
- **Roles:** Encargado principal (ve todo, asigna o cambia responsables, crea y desactiva obligaciones) y Responsable (ve y trabaja solo lo asignado: «Mis pagos»). El responsable se elige de la lista de usuarios, no es texto libre, y cada cambio queda en un historial. El inicio de sesión con las cuentas de la empresa se coordina con TI.
- **Estados y colores (diseño B):** Vencido rojo `#B3261E`, Por vencer ámbar `#F2A900`, Pagado verde, Revisar verde con borde negro, Programado borde punteado; siempre con ícono y texto. Programado = faltan más de 7 días.
- **Cambios manuales:** toda modificación hecha a mano pide confirmación mostrando el valor de antes y el de después.
- **Catálogo:** sociedad y categoría admiten «Otra…» para crear una nueva desde el alta. Lo que se activa o desactiva es el servicio (no la factura); además, el encargado puede desactivar o reactivar todos los servicios de un proveedor de una vez.
- **Fuentes:** por ahora solo Excel. PDF y carpetas de OneDrive llegan después, con TI.
- **Banco y moneda de la cuenta:** editables a mano por Tesorería; la importación ya no los pisa.
- **Frecuencia por defecto:** mensual (supuesto, parámetro `frecuencia_defecto`).
- **Estilo:** paleta Garnier, contraste verificado (`npm run contraste`), todo estado con etiqueta de texto además del color. El aplicativo debe ser muy intuitivo: alguien nuevo lo usa sin explicación.

## Cómo trabajar
- Responder en español y de forma concisa.
- Marcar los supuestos en código, README y pantalla ("Por confirmar con Tesorería").
- Si hay dudas, preguntar antes de suponer.
- No empezar un hito sin aprobación.

## Hitos
| Hito | Alcance | Estado |
|---|---|---|
| 1 | Esqueleto, modelo, parámetros y Configuración | Integrado en `main` |
| 2 | Importación de estados de cuenta y cobertura | Integrado en `main` (PR #1) |
| 3 | Catálogo y generación de vencimientos | Terminado, por aprobar |
| 4 | Cruce y cálculo de estados | Pendiente |
| 5 | Inconsistencias, avisos y borradores de correo | Pendiente |
| 6 | Tablero, proyección y revisión humana | Pendiente |

Después de los hitos, con TI: autenticación y roles, Docker, base de datos de producción y despliegue.
