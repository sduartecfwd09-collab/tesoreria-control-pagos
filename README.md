# Control de pagos · Tesorería (piloto)

Dos aplicaciones independientes que se comunican por HTTP:

- **Backend/** — Node.js + TypeScript, Fastify, Prisma + SQLite, zod, exceljs, vitest. API REST en `http://localhost:3001`.
- **Frontend/** — Next.js (App Router) + TypeScript + Tailwind. Solo interfaz, en `http://localhost:3000`. Nunca toca la base de datos.

## Arranque

Requiere Node 20 o superior. Dos terminales:

```
# Terminal 1 — Backend (primera vez: instala, crea la base y carga parámetros iniciales)
cd Backend
npm install
copy .env.example .env          # luego edite STATEMENTS_ROOT y CATALOGO_FILE (solo lectura)
npm run db:setup
npm run importar                # lee la carpeta e informa conteos (no imprime descripciones)
npm run catalogo                # importa la tabla de pagos frecuentes y muestra las alertas de calidad
npm run dev                     # http://localhost:3001/api/salud

# Terminal 2 — Frontend
cd Frontend
npm install
copy .env.local.example .env.local
npm run dev                     # http://localhost:3000  (Archivos importados y Configuración)
```

Pruebas: `cd Backend && npm test` · `cd Frontend && npm run lint && npm run typecheck && npm run contraste`.
Las pruebas de integración con datos reales (`tests/integracion-real.test.ts` y `tests/integracion-catalogo.test.ts`) se omiten solas si `STATEMENTS_ROOT` o `CATALOGO_FILE` no existen.

## Contrato Backend ↔ Frontend

| Ruta | Descripción |
|---|---|
| `GET /api/salud` | Estado del servidor |
| `GET /api/parametros` · `PUT /api/parametros/:id` | Parámetros (valor, ayuda, rango, `supuesto`). 422 si el valor no cumple la regla |
| `POST /api/importaciones` | Importa `STATEMENTS_ROOT`. 422 si no está configurada o no existe; 409 si ya hay una importación en curso |
| `GET /api/importaciones` | Archivos con estado, formato, error, advertencias, discrepancias y continuidad del saldo |
| `GET /api/cobertura` | Cobertura por sociedad, cuenta y mes (`leido` / `error` / `falta`) |
| `GET /api/movimientos` | Filtros `sociedad`, `cuenta`, `periodo` (AAAA-MM), `pagina`, `porPagina` (máx. 500) |
| `GET /api/cuentas` · `PATCH /api/cuentas/:id` | Tesorería edita a mano `banco` y/o `moneda` (la importación ya no los pisa) |
| `GET /api/sociedades` · `GET /api/categorias` | Con conteo de obligaciones (y de cuentas, en sociedades) |
| `GET /api/obligaciones` | Filtros `sociedad`, `categoria` (id), `activa` (true/false), `q` (proveedor, identificador o responsable), `falta` (monto/cuenta/responsable/dia), `pagina`, `porPagina`. Cada obligación trae `etiquetas` |
| `GET /api/obligaciones/resumen` | Conteos y alertas de calidad del catálogo |
| `GET /api/obligaciones/:id` · `POST /api/obligaciones` · `PATCH /api/obligaciones/:id` | Alta manual y edición. 409 si ya existe; 422 si un valor no cumple la regla |
| `POST /api/catalogo/importar` | Importa `CATALOGO_FILE`. 422 si no está configurada, no existe o no tiene la cabecera; 409 si ya hay una en curso |

Formato: JSON; errores como `{ "error": "texto" }` (en altas y ediciones también `campo`, para marcarlo en el formulario); fechas ISO 8601; montos en centavos (enteros).
**CORS:** el Backend solo acepta los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:3000`). El Frontend lee la URL del API desde `NEXT_PUBLIC_API_URL`.

## Importación de estados de cuenta (Hito 2)

- Lee solo las subcarpetas de `STATEMENTS_ROOT` (una por sociedad); ignora `resultados/` y los archivos de la raíz. **Nunca escribe en esa carpeta.**
- Nombre esperado: `<IBAN o número> <MMAA> <SOCIEDAD>.xlsx`. Se compara con el contenido y se reportan las diferencias.
- Formato por encabezado (fila de encabezado buscada dinámicamente) y código de banco del IBAN. Detalle de los 7 formatos en `Backend/src/ingest/formatos.ts`.
- Un archivo con error se marca y la importación continúa. Un archivo sin cambios (hash + versión del lector) no se relee; si cambia, se reimporta reemplazando sus movimientos (se bloquea si ya tiene conciliaciones).
- Continuidad del saldo en cada archivo; los que no cuadran se reportan, nunca se descartan.
- **Clave de deduplicación** entre archivos: ver `Backend/src/ingest/clave-dedup.ts`. Las filas idénticas dentro de un mismo archivo no se colapsan.
- Moneda: encabezado → IBAN BCT (…1010 21… = CRC, …1010 22… = USD) → otro mes de la cuenta. Si no vino en el archivo, la cuenta queda "por confirmar".
- Los datos son confidenciales: ni la CLI ni los logs imprimen descripciones de movimientos; las pruebas usan solo archivos sintéticos generados por código.

## Catálogo de obligaciones (Hito 3)

- Lee `CATALOGO_FILE` (solo lectura). La cabecera se busca por nombre en las primeras 20 filas: Sociedad, Categoría, Proveedor, NISE / Cuenta / Identificador, Última fecha de pago.
- "15 DIA" = día esperado de pago (entero de 1 a 31). Un día inválido o vacío **no descarta la fila**: se importa sin día, queda "Falta día" y se reporta con su número de fila. Solo se descartan (y se reportan) las filas sin sociedad, categoría, proveedor o identificador, y las repetidas.
- El identificador es texto (conserva ceros), sin espacios y en mayúsculas. Proveedor y categoría con espacios colapsados; las variantes que solo difieren en mayúsculas o tildes se unifican y se reportan.
- **Idempotente:** una obligación = sociedad + proveedor normalizado + identificador. Reimportar solo actualiza categoría, forma del nombre y día (si no fue editado a mano y el archivo trae uno válido). Nunca toca frecuencia, mes de arranque, monto, moneda, cuenta, responsable ni activa, ni las obligaciones creadas a mano. Lo que ya no está en el archivo se cuenta, no se desactiva.
- Nada se borra: se desactiva (`activa = false`). Sociedad, proveedor e identificador no se editan; si están mal, se desactiva y se crea otra.
- **Alertas de calidad** (se recalculan siempre, sobre las activas): mismo identificador en una sociedad con distinto proveedor, identificador con formato de IBAN, sociedades sin obligaciones, y obligaciones sin monto, cuenta, responsable, día o mes de arranque.

## Supuestos (por confirmar con Tesorería)

- `tolerancia_pct = 10` por categoría y `frecuencia_defecto = mensual`. No se aplican aún (el monto no se valida en el piloto).
- Colores de estado rojo y ámbar (tokens en `Frontend/src/app/globals.css`).
- Texto con barras = día/mes/año. Punto = decimal, coma = miles. Símbolo ¢/₡ o $ al final del nombre de cuenta = moneda.
- Nombres de banco: solo BCT, BNCR y Davivienda se leen del propio archivo. Los códigos 0102, 0123 y 0104 (en E4) no están confirmados.
- Las categorías Electricidad, Telecom y CCSS y las 6 sociedades (DM incluida) se siembran con `db:seed`; la importación del catálogo agrega las que falten.
- Frecuencias: mensual, bimestral, trimestral, semestral y anual. Las obligaciones nuevas toman `frecuencia_defecto` y quedan "por confirmar" hasta que Tesorería la edite.
- Moneda de la obligación: CRC por defecto (la tabla no la trae), "por confirmar" hasta que se edite.
- Identificador: se quitan los espacios internos (un IBAN escrito con espacios cuenta como el mismo).

## Pendientes y deuda técnica

- **Tipos compartidos:** `Frontend/src/lib/tipos.ts` replica el contrato a mano. Evaluar OpenAPI generado más adelante.
- **SQL Server:** al ir a producción, verificar el soporte de SQL Server con Prisma 7.10.1 (hoy se usa SQLite).
- **Docker / despliegue:** Dockerfile y compose se preparan antes de entregar a TI.
- **Vulnerabilidades:** `eslint-config-next` (5 altas, solo desarrollo) y `uuid` transitiva de exceljs (2 moderadas); revisar antes de entregar a TI. No usar `npm audit fix --force`.
- **exceljs 4.4.0** no tiene versiones nuevas desde dic. 2024; no abre libros con dibujos incrustados (se resuelve con una copia en memoria sin dibujos, `src/ingest/quitar-dibujos.ts`).
- **Autenticación y roles:** pendientes de definir con TI.
- **Montos de 32 bits:** los campos de monto son `Int` de Prisma (máximo ₡21 474 836,47 en centavos). El API rechaza montos mayores con un mensaje claro; si Tesorería maneja montos mayores (p. ej. CCSS), migrar a `BigInt`.
- **Alertas al vuelo:** `GET /api/obligaciones` recalcula los identificadores repetidos sobre todo el catálogo en cada consulta; es trivial con ~65 obligaciones, revisar si el catálogo crece mucho.
