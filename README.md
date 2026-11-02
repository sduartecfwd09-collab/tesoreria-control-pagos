# Control de pagos de Tesorería

Aplicativo (piloto) para que Tesorería controle los pagos recurrentes de sus sociedades. Lee los estados de cuenta bancarios, los cruza con un catálogo de obligaciones (servicios, impuestos, cargas sociales) y muestra, mes a mes, qué está pagado, qué está por vencer y qué requiere revisión.

## Qué hace

- **Importa estados de cuenta** (Excel y CSV) por sociedad, cuenta y mes, y verifica su integridad por saldo.
- **Mantiene el catálogo de obligaciones** con proveedor, sociedad, categoría, frecuencia, responsable y día de pago.
- **Genera los vencimientos automáticamente** respetando la frecuencia y el mes de arranque de cada obligación.
- **Cruza pagos y vencimientos** por identificador, sociedad, cuenta y fecha. Lo claro se concilia solo; lo dudoso queda para revisión humana, con opción de asociar o quitar un pago a mano.
- **Calcula el estado de cada pago:** Vencido, Por vencer, Pagado, Pagado con atraso, Revisar, Programado, Justificado y Sin información.
- **Avisos** en una campana y borradores de correo semanal (no se envía nada en el piloto).
- **Historial de cambios** de toda modificación manual, con filtros.
- **Diferencias con el Excel:** detecta renombres, obligaciones que ya no están y cambios de día de pago respecto del catálogo.
- **Alcance por persona:** Jefatura ve todo; cada Tesorero ve solo lo de su responsabilidad. El filtro se aplica en el servidor.

## Pantallas

Inicio · Pagos del mes · Vencidos · Obligaciones · Estados de cuenta · Movimientos sin obligación · Diferencias con el Excel · Histórico · Historial de cambios · Avisos · Configuración.

## Arquitectura

Dos aplicaciones independientes que se comunican solo por HTTP:

| Carpeta | Tecnología | Puerto |
|---|---|---|
| `Backend/` | Node.js 20+, TypeScript, Fastify, Prisma + MySQL, zod, exceljs, vitest | 3001 |
| `Frontend/` | Next.js (App Router), TypeScript, Tailwind, TanStack Table, react-hook-form | 3000 |

- El Frontend nunca toca la base de datos.
- Solo los repositorios (`Backend/src/repositories`) usan Prisma.
- Los parámetros de negocio viven en la base y se editan en Configuración.
- Montos en centavos (enteros), fechas ISO 8601, errores como `{ "error": "texto" }` en español.

## Puesta en marcha

Requisitos: Node 20 o superior y un MySQL local (desarrollo con 9.2; el esquema también corre en 8.0 y 8.4). Hay que crear tres bases vacías: de trabajo (`tesoreria_dev`), de pruebas (el nombre debe terminar en `_test`) y sombra (para crear migraciones).

```
# Terminal 1: Backend
cd Backend
npm install
copy .env.example .env      # completar con sus rutas y direcciones de MySQL
npm run db:verificar        # dice «conectó» o «falló» por base, sin mostrar credenciales
npm run db:setup            # genera el cliente, aplica migraciones y siembra
npm run dev                 # http://localhost:3001/api/salud

# Terminal 2: Frontend
cd Frontend
npm install
copy .env.local.example .env.local
npm run dev                 # http://localhost:3000
```

Las variables de `Backend/.env.example` se documentan una por una en ese archivo. Para probar sin inicio de sesión, `MODO_PRUEBAS=true` habilita un selector de «Actuando como» (el servidor no arranca con ese valor si `NODE_ENV=production`).

## Pruebas

```
cd Backend  && npm test
cd Frontend && npm run lint && npm run contraste
```

Las pruebas usan datos sintéticos generados por código. Las de integración con datos reales se omiten solas si la ruta configurada no existe.

## Confidencialidad

El proyecto maneja información financiera. Por eso:

- Nunca se versionan estados de cuenta, catálogos, `.xlsx`, `.csv`, `.eml`, bases de datos ni el archivo `.env`.
- La consola y los registros muestran solo conteos y estados, nunca montos, cuentas ni descripciones.
- Las carpetas de origen son de solo lectura: el sistema no las modifica ni las mueve.
- Las rutas a datos reales viven únicamente en el `.env` de cada equipo.
- Toda ruta de la API es privada por defecto; el control de acceso llegará con el inicio de sesión de Microsoft.

## Flujo de trabajo (Git)

Se trabaja en la rama `sarai`, se integra a `dev` por PR y luego a `main` por PR, siempre con **merge commit**. Los commits son pequeños, uno por tarea, con prefijo convencional en español (`feat(backend):`, `feat(frontend):`, `fix:`, `chore:`, `docs:`, `test:`).

## Estado del proyecto

| Hito | Alcance | Estado |
|---|---|---|
| 1 | Esqueleto, modelo, parámetros y Configuración | Integrado |
| 2 | Importación de estados de cuenta | Integrado |
| 3 | Catálogo y generación de vencimientos | Integrado |
| 4 | Cruce automático, estados y ficha del pago | Integrado |
| 5 | Avisos, borradores de correo, Movimientos sin obligación | En curso |
| 6 | Inicio (tablero), proyección y Configuración con el diseño nuevo | Pendiente |

Después de los hitos, con TI: inicio de sesión con Microsoft y roles, Docker, base de datos de producción y despliegue.

## Documentación

- [`CLAUDE.md`](CLAUDE.md): reglas fijas y decisiones vigentes del proyecto.
- [`docs/guia-tecnica.md`](docs/guia-tecnica.md): base de datos, orden de ejecución con datos reales, contrato de la API, supuestos y deuda técnica.
- [`docs/registro-de-decisiones.md`](docs/registro-de-decisiones.md): el porqué de cada decisión, con fecha.
