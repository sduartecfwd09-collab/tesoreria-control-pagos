# Control de pagos · Tesorería (piloto)

Dos aplicaciones independientes que se comunican por HTTP:

- **Backend/** — Node.js + TypeScript, Fastify, Prisma + MySQL, zod, exceljs, vitest. API REST en `http://localhost:3001`.
- **Frontend/** — Next.js (App Router) + TypeScript + Tailwind, TanStack Table (tablas) y react-hook-form (formularios). Solo interfaz, en `http://localhost:3000`. Nunca toca la base de datos.

## Base de datos (MySQL)

Prisma se conecta con el adaptador `@prisma/adapter-mariadb` (sirve para MySQL y MariaDB). La documentación de Prisma lista MySQL 5.6 o superior y no menciona la 9.x; en desarrollo se comprobó que la 9.2.0 funciona. El esquema evita funciones exclusivas de la 9.x para correr también en MySQL 8.0 y 8.4 (la collation `utf8mb4_0900_ai_ci` existe desde la 8.0).

**Bases del entorno de desarrollo** (en producción hay una sola):

| Variable | Base | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | `tesoreria_dev` | Datos de trabajo: la API y la importación. |
| `TEST_DATABASE_URL` | `tesoreria_test` | Pruebas automáticas. Cada corrida la borra por completo, por eso el nombre debe terminar en `_test`: si no, las pruebas se niegan a correr. |
| `SHADOW_DATABASE_URL` | `tesoreria_shadow` | Base temporal que Prisma usa solo al crear migraciones, para comparar el esquema sin tocar `dev`. |

Formato: `mysql://USUARIO:CLAVE@127.0.0.1:3306/NOMBRE_BASE`. Siempre `127.0.0.1` (con `localhost` puede resolverse por IPv6 y fallar). Si la clave tiene caracteres especiales (`@`, `:`, `/`), se escriben codificados (`@` = `%40`). La clave solo vive en el `.env`, que no se versiona.

**Migraciones** (reemplazan a `db push`: dejan historia revisable y son lo que se aplica en producción):

| Comando | Qué hace |
|---|---|
| `npm run db:migrar:crear` | Tras cambiar `schema.prisma`: genera una migración nueva y la aplica en `dev` (usa la base sombra). Se revisa el SQL antes de versionarlo. |
| `npm run db:migrar` | Aplica las migraciones pendientes (`prisma migrate deploy`). Es la que se usa en producción. |
| `npm run db:estado` | Dice si la base está al día con las migraciones. |
| `npm run db:seed` | Siembra (idempotente): los roles Jefatura y Usuario, las 5 sociedades del piloto, las categorías y los parámetros. Los usuarios no se siembran: se cargan con `usuarios:cargar`. |
| `npm run db:setup` | Desde cero: genera el cliente, aplica las migraciones y siembra. |
| `npm run db:reiniciar` | Borra y recrea `tesoreria_dev` (migraciones y seed). Se niega a correr contra una base `_test`, contra cualquier base que no termine en `_dev` y contra un servidor que no sea 127.0.0.1. |
| `npm run db:preparar-test` | Reinicia `tesoreria_test` (la vacía, migra y siembra). `npm test` ya lo hace solo. |

Los datos no se migran entre motores: tras cambiar de base se vuelven a importar (`npm run reimportar`, `npm run catalogo`).

**Fechas y zona horaria (Costa Rica, UTC-6).** La fecha de un vencimiento es un día del calendario, no un instante: la columna es `DATE` y no guarda hora. Para que nunca se corra un día: (1) se escribe siempre como medianoche UTC (`new Date(Date.UTC(a, m, d))`); (2) se lee siempre con `toISOString().slice(0, 10)` y getters UTC, nunca con `getDate()` ni `toLocaleDateString()` en hora local; (3) las demás fechas son `DATETIME(3)` y guardan el instante en UTC. Se probó contra MySQL con el servidor en UTC-6: 1 de marzo, 31 de diciembre y 15 de marzo entran y salen iguales.

**Montos.** Se guardan en centavos como `BIGINT` (hay montos mayores a ₡21,4 millones, el límite de un entero de 32 bits en centavos). JSON no admite BigInt: la API los envía como número (`src/domain/montos.ts`) y falla en voz alta si alguno no cabe sin perder precisión.

**Collation.** Las tablas se crean con `utf8mb4_0900_ai_ci` (declarada en la migración, no depende del servidor): no distingue mayúsculas ni tildes. Efecto en los índices únicos de texto: `Cable` y `CABLE` son el mismo valor (también `Cablé`), lo que se quiere para sociedades, categorías, proveedores y correos. El único índice que debe ser exacto es `Movimiento.claveDedup`, pero es un hash hexadecimal en minúsculas (`CHAR(40)`), así que no hay ambigüedad. `ArchivoImportado.ruta` también es insensible a mayúsculas, coherente con rutas de Windows.

**Sociedades y categorías.** `Sociedad.codigo` (abreviatura interna) es opcional y único: cuando falta se guarda `NULL`, nunca una cadena vacía (dos vacíos chocarían). `nombreLargo` es el que muestra el aplicativo. Cada sociedad puede tener un tesorero vigente (`tesoreroId`, un usuario) y la tabla `SociedadTesoreroHistorial` guarda quién lo fue, desde y hasta cuándo y por qué cambió. Los roles son «Jefatura» (ve todo y administra) y «Usuario» (ve solo sus sociedades); por ahora solo se modelan, el control de acceso llega con el inicio de sesión. Un usuario tiene correo de empresa obligatorio y único (en minúsculas) y un nombre normalizado único para reconocer al tesorero por nombre. Las categorías se identifican por `nombreNormalizado` (sin mayúsculas, tildes ni espacios sobrantes) y se desactivan, no se borran.

## Orden de ejecución con datos reales (desde cero)

Lo ejecuta la persona que opera, en su terminal, porque lee datos reales (el asistente nunca los abre). El orden importa: cada paso necesita lo que dejó el anterior.

```
cd Backend
npm run db:estado          # confirma que tesoreria_dev tiene las migraciones aplicadas
npm run db:reiniciar       # 1
npm run usuarios:cargar    # 2
npm run sociedades:cargar  # 3
npm run reimportar         # 4
```

1. **`db:reiniciar`**: borra y recrea `tesoreria_dev` con las migraciones y el seed (roles, 5 sociedades del piloto, categorías, parámetros). *Por qué:* partir de una base limpia asegura que nada quede de importaciones hechas con las reglas anteriores (por ejemplo, sociedades creadas automáticamente por el importador). *Para qué:* que la base solo contenga lo que las reglas nuevas permiten. Se niega a correr contra `_test` y contra bases que no terminen en `_dev` (producción incluida).
2. **`usuarios:cargar`**: lee el Excel de `USUARIOS_FILE` (hoja 1, encabezados `Nombre`, `Correo`, `Rol` en la fila 1, datos desde la fila 2) y crea los usuarios. *Por qué:* el tesorero de cada sociedad es un usuario del sistema y el correo de empresa será la identidad del inicio de sesión de Microsoft y el destino de avisos; no se inventan correos. *Para qué:* que `sociedades:cargar` encuentre a cada tesorero. Una fila sin correo, con correo mal formado o con un rol que no sea «Jefatura» o «Usuario» se ignora con su motivo. Imprime solo conteos.
3. **`sociedades:cargar`**: lee el Excel de `SOCIEDADES_FILE` (hoja 1, encabezados en la fila 4, datos desde la fila 5), reconoce las sociedades que ya existen (por nombre normalizado o por alias de `src/config/alias-sociedades.ts`), crea las que faltan sin abreviatura y asigna el tesorero con su historial. *Por qué:* la lista maestra de Tesorería es la fuente de las 66 sociedades y de quién atiende cada una; el importador ya no crea sociedades. *Para qué:* que cada carpeta de estados de cuenta tenga una sociedad existente a la cual asignarse, y que cada tesorero vea solo las suyas cuando llegue el inicio de sesión. Imprime solo conteos (sociedades encontradas y creadas, tesoreros encontrados, tesoreros sin usuario y sociedades por tesorero sin nombres).
4. **`reimportar`**: lee la carpeta `STATEMENTS_ROOT` (solo lectura) y llena `tesoreria_dev`. *Por qué:* es el único comando de importación (`npm run importar` se retiró porque su informe imprimía rutas con IBAN). *Para qué:* tener movimientos reales ya asignados a sociedades conocidas.

Cada comando se puede repetir sin duplicar. Los tres de carga se niegan a correr si `DATABASE_URL` apunta a una base `_test`.

**Asignación carpeta-sociedad.** Es explícita, nunca se adivina: una carpeta se asigna solo a una sociedad que ya existe y cuya abreviatura (`codigo`) coincide con el nombre de la carpeta. Nunca se crea una sociedad al importar. Un archivo queda **en revisión** (no se importa ningún movimiento y se registra el motivo) cuando: la carpeta no tiene sociedad asignada («carpeta sin sociedad asignada», p. ej. DM, que no está en el piloto) o la sociedad del nombre del archivo no coincide con la de su carpeta («nombre de archivo no coincide con la carpeta»). Estas dos comprobaciones se hacen antes de abrir el archivo. Un archivo en revisión no cuenta como leído en la cobertura. Cuando una persona de Jefatura asigne la abreviatura a la sociedad, el siguiente `reimportar` importa la carpeta pendiente.

**Qué imprime `reimportar`:** solo conteos: la base usada, archivos leídos, sin cambios, con error y en revisión; los motivos de error agrupados y con números enmascarados; los archivos en revisión agrupados por motivo; movimientos importados y duplicados, y tablas por sociedad y mes y por sociedad. Nunca rutas ni nombres de archivo (llevan el IBAN), cuentas, montos, beneficiarios ni descripciones, así que esa salida se puede pegar tal cual. Se niega a correr si `DATABASE_URL` apunta a una base `_test`.

### Verificar las fechas de lo importado

```
cd Backend
npm run db:verificar-datos
```

Solo lee la base (no escribe nada) e imprime agregados por sociedad y mes del archivo: movimientos, fecha mínima, fecha máxima, cuántos movimientos caen fuera del mes del archivo con tolerancia de un día y el mayor desvío en días. No imprime montos, cuentas, descripciones ni nombres. Sirve para detectar a tiempo un desfase de fechas (zona horaria, formato día/mes o año mal leído) antes de construir el cruce encima. Cómo leerlo: cada fecha mínima y máxima debería caer en el mes del archivo o a un día de sus bordes (un estado puede traer el cierre del mes anterior o el primer día del siguiente); «fuera de tolerancia» debería ser 0, y si no lo es, el «desvío máximo» orienta: 1 a 2 días sugiere un corte de periodo, 28 a 31 sugiere un mes mal leído, 365 un año mal leído.

## Arranque

Requiere Node 20 o superior y un MySQL local (desarrollo: 9.2.0; producción: MySQL, versión por confirmar con TI). Antes de arrancar hay que crear las bases y el `.env` (sección «Base de datos»). Dos terminales:

```
# Terminal 1 — Backend (primera vez: instala, crea la base y carga parámetros iniciales)
cd Backend
npm install
copy .env.example .env          # luego escriba las tres direcciones de MySQL, STATEMENTS_ROOT, CATALOGO_FILE, USUARIOS_FILE y SOCIEDADES_FILE
npm run db:verificar            # dice «conectó» o «falló» para cada base, sin mostrar credenciales
npm run db:setup                # genera el cliente, aplica las migraciones y siembra
npm run usuarios:cargar         # con datos reales: ver «Orden de ejecución con datos reales»
npm run sociedades:cargar
npm run reimportar              # lee la carpeta e informa solo conteos
npm run catalogo                # importa la tabla de pagos frecuentes y muestra las alertas de calidad
npm run dev                     # http://localhost:3001/api/salud

# Terminal 2 — Frontend
cd Frontend
npm install
copy .env.local.example .env.local
npm run dev                     # http://localhost:3000  (Obligaciones, Vencimientos, Archivos importados y Configuración)
```

Pruebas: `cd Backend && npm test` · `cd Frontend && npm run lint && npm run typecheck && npm run contraste`.
Las pruebas de integración con datos reales (`tests/integracion-real.test.ts` y `tests/integracion-catalogo.test.ts`) se omiten solas si `STATEMENTS_ROOT` o `CATALOGO_FILE` no existen.

## Contrato Backend ↔ Frontend

Los errores responden `{ "error": "texto" }` en español; un fallo inesperado responde un texto fijo (nunca rutas ni el mensaje original). Se retiraron `GET /api/movimientos`, `POST /api/importaciones` y `PATCH /api/cuentas/:id`: volverán con el inicio de sesión y permisos cuando se necesiten.

| Ruta | Descripción |
|---|---|
| `GET /api/salud` | Estado del servidor |
| `GET /api/parametros` · `PUT /api/parametros/:id` | Parámetros (valor, ayuda, rango, `supuesto`). 422 si el valor no cumple la regla |
| `GET /api/importaciones` | Archivos con estado (`leido`, `con_error`, `sin_sociedad` o `retirado`; una sola definición para tarjetas, cobertura y detalle), formato, `motivo` (visible en `con_error` y `sin_sociedad`), advertencias, discrepancias y continuidad del saldo. Solo el nombre del archivo (`archivo`, con los números de 8 o más dígitos enmascarados) y la cuenta con sus últimos 4. El `resumen` suma: `archivos` = `leidos` + `conError` + `sinSociedad`; los `retirados` (archivos registrados que ya no están en la carpeta: no se borran, no cuentan en totales, cobertura ni cruce, y se reactivan si vuelven) se cuentan aparte. La importación se ejecuta desde el Backend (`npm run reimportar`), no por la API |
| `GET /api/cobertura` | Cobertura por sociedad, cuenta (últimos 4) y mes (`leido` / `error` / `sin_sociedad` / `falta`), con el archivo solo por nombre y `archivoId` para enlazar la celda con su motivo; no incluye archivos retirados |
| `GET /api/cuentas` | Cuentas con el número enmascarado (últimos 4); el servidor usa el completo para el cruce |
| `GET /api/sociedades` · `GET /api/categorias` | Con conteo de obligaciones (y de cuentas, en sociedades) |
| `GET /api/obligaciones` | Filtros `sociedad` (abreviatura) o `sociedadId`, `categoria` (id), `activa` (true/false), `q` (proveedor, identificador o responsable), `falta` (monto/cuenta/responsable/dia), `pagina`, `porPagina`. Cada obligación trae `etiquetas` (observaciones: solo problemas reales, como identificador repetido, formato de IBAN, sin día o sin mes de arranque), `estado` (`activa`, `inactiva` o `en_revision`) y `responsableEfectivo` (el propio o, si falta, el tesorero de la sociedad) |
| `GET /api/obligaciones/resumen` | Conteos y alertas de calidad del catálogo |
| `GET /api/obligaciones/:id` · `POST /api/obligaciones` · `PATCH /api/obligaciones/:id` | Alta manual y edición. El alta envía `sociedadId` (la sociedad se elige por nombre oficial). 409 si coinciden sociedad, proveedor, identificador (sin ceros a la izquierda) y categoría; 409 con `advertencia` (`identificador_duplicado`, con sociedad, categoría y proveedor de la otra) si el identificador ya existe en otra obligación, y se confirma con `esIntencional: true`; la respuesta del alta trae `advertencias` (`dia_ya_paso`). `controlDesde` (AAAA-MM) por defecto es el mes de alta. 422 si un valor no cumple la regla. El día de pago ya definido no se cambia por esta ruta |
| `POST /api/catalogo/importar` | Importa `CATALOGO_FILE`. 422 si no está configurada, no existe o no tiene la cabecera; 409 si ya hay una en curso |
| `GET /api/vencimientos` | Filtros `sociedad` (abreviatura) o `sociedadId`, `categoria`, `periodo` o `desde`/`hasta`, `q`, `estado` (lista separada por comas), `responsableEfectivo` y `dias` (de hoy a la fecha vigente) en cada fila, `diasAviso` en la respuesta, `pendientesAnteriores=true` (con `periodo`: suma los vencidos, sin información y por revisar de meses anteriores, marcados con `mesAnterior`), `pagina`, `porPagina`. La respuesta trae `resumen` (conteo por estado de lo que se ve, sin el filtro de estado). Cada vencimiento trae `estado` (proyectado, por_vencer, vencido, pagado, pagado_con_inconsistencia, sin_informacion, por_revisar), `motivo`, `textoEstado` (con fechas si es «Sin información»), `pago` (fecha, monto en centavos, moneda de la cuenta que pagó o null si no hay dato, banco y cuenta enmascarada), `diferenciaDias` (pago menos fecha vigente), `sinInfoHasta`, `conciliado` y `futuro` |
| `GET /api/importaciones` (campo `imagenes`) | Además de los archivos, trae por sociedad y mes cuántos archivos traen imágenes (que el lector ignora, sin OCR) y cuántos de ellos tienen cero movimientos; la celda de cobertura de esos archivos lleva la nota «Sin movimientos (con imagen): revisar» sin cambiar cómo cuentan. El dato se registra al leer (versión 6 del lector): `npm run reimportar` lo completa |
| `GET /api/vencimientos/avisos-datos` | Sociedades con obligaciones activas cuyos estados de cuenta llegan hasta una fecha anterior a hoy menos `aviso_datos_dias` (o que no tienen ninguno): `{ sociedad, sinEstadosDesde, texto }` |
| `GET /api/vencimientos/periodos` | Meses con vencimientos y su total, y `hoy` (la fecha de hoy según el reloj del servidor) |
| `GET /api/vencimientos/:id` | Detalle de solo lectura: datos, fechas original y vigente, ventana buscada, cobertura de estados de cuenta (hasta qué fecha y en cuántas cuentas, cuáles faltan) y los movimientos que explican el estado (cuenta con últimos 4, moneda de la cuenta, descripción con números largos enmascarados) |

Al crear o editar una obligación (frecuencia, mes de arranque, día, monto o activa), la respuesta incluye `regeneracion` con lo que cambió en sus vencimientos futuros. Cada obligación trae `proximoPago` (fecha calculada según la frecuencia a partir del último vencimiento).

Formato: JSON; errores como `{ "error": "texto" }` (en altas y ediciones también `campo`, para marcarlo en el formulario); fechas ISO 8601; montos en centavos (enteros).
**CORS:** el Backend solo acepta los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:3000`). El Frontend lee la URL del API desde `NEXT_PUBLIC_API_URL`.

**Dirección de escucha:** la API escucha por defecto solo en `127.0.0.1` (este equipo). La variable opcional `HOST` la cambia; vacía equivale a `127.0.0.1`. No usar `0.0.0.0` hasta que exista autenticación.

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

## Vencimientos (Hito 3)

- Un vencimiento por obligación activa y periodo (`@@unique`). El calendario es automático y sin meses futuros: se crean los vencimientos desde «Control desde» hasta el fin del mes en curso (o hasta hoy + `aviso_dias` si eso cruza al mes siguiente). Corre solo al crear, editar o activar una obligación, tras cada importación, al arrancar el servidor y una vez al día; es idempotente. No hay ruta ni botón para generarlos a mano.
- **Cruce (Hito 4):** `npm run cruzar` recalcula el estado de todos los vencimientos (reglas en `src/domain/cruce.ts`); `npm run cruzar:diagnostico` imprime solo conteos por estado, sociedad y mes, y al final el bloque «margen de búsqueda» (cifras antes y después del margen, distribución de fechas de pago, clasificación de lo que no queda pagado, débitos «Pago:» sin obligación, formatos de banco y lista para validar con identificadores enmascarados a 4 dígitos); `npm run cruzar:grupos` muestra, por cada grupo de obligaciones de una sociedad con el mismo número de servicio, el estado de cada vencimiento por mes y los rótulos del banco (con los números largos enmascarados) y si se reconoce el nombre del proveedor. El cruce usa solo débitos de archivos no retirados, la ventana `ventana_dias_antes` y `ventana_dias_despues` (3 y 12) y la cobertura de las cuentas (`src/domain/cobertura-corte.ts`): nunca marca «Vencido» si hay duda de cobertura: queda «Sin información», un estado que requiere atención. El parámetro `marcar_vencido_sin_estado` (apagado) lo muestra como Vencido con la nota «sin estado de cuenta que lo confirme».
- Frecuencia como paso en meses (mensual 1, bimestral 2, trimestral 3, semestral 6, anual 12) contado desde el **mes de arranque**. Una frecuencia no mensual sin mes de arranque, o una obligación sin día, se omite y se reporta con su motivo.
- Si el día no existe en el mes se usa el último día (31 → 30, o 28/29 en febrero). Sin ajuste por fines de semana ni feriados.
- Todos nacen **proyectado**; los demás estados se calculan con el cruce (Hito 4).
- **Regeneración al editar:** solo vencimientos de hoy en adelante y hasta el último mes ya generado. Se ajustan fecha y monto, se eliminan los que ya no corresponden (frecuencia distinta u obligación desactivada) y se crean los que faltan. Nunca se tocan los pasados ni los que tienen conciliación.
- **Reloj inyectable:** `crearApp({ reloj })` recibe la fecha de hoy (las pruebas la fijan). "Hoy" es la fecha local del servidor.

## Pantallas

- **Obligaciones:** resumen de calidad (las tarjetas filtran la tabla), pendientes con Tesorería, filtros, tabla y formulario de alta y edición con ayudas visibles. En la edición solo se envían los campos cambiados; los supuestos se confirman con la casilla «Confirmada con Tesorería».
- **Vencimientos:** aviso de estados, generación por rango de meses con confirmación previa y resumen del resultado, y tabla por periodo.
- Las pestañas sin pantalla (Tablero, Conciliación, Inconsistencias, Avisos) muestran «Próximamente» con el hito en que llegan.

## Supuestos (por confirmar con Tesorería)

- `frecuencia_defecto = mensual`. La tolerancia de monto se eliminó: el monto esperado es opcional y no se valida contra el pago.
- Colores de estado rojo y ámbar (tokens en `Frontend/src/app/globals.css`).
- Texto con barras = día/mes/año. Punto = decimal, coma = miles. Símbolo ¢/₡ o $ al final del nombre de cuenta = moneda.
- Nombres de banco: solo BCT, BNCR y Davivienda se leen del propio archivo. Los códigos 0102, 0123 y 0104 (en E4) no están confirmados.
- Las categorías Electricidad, Telecom y CCSS y las 6 sociedades (DM incluida) se siembran con `db:seed`; la importación del catálogo agrega las que falten.
- Frecuencias: mensual, bimestral, trimestral, semestral y anual. Las obligaciones nuevas toman `frecuencia_defecto` y quedan "por confirmar" hasta que Tesorería la edite.
- Moneda de la obligación: CRC por defecto (la tabla no la trae), "por confirmar" hasta que se edite.
- Identificador: se quitan los espacios internos (un IBAN escrito con espacios cuenta como el mismo).
- Vencimientos: sin ajuste por fines de semana ni feriados; "futuro" = fecha de hoy en adelante.

## Pendientes y deuda técnica

- **Tipos compartidos:** `Frontend/src/lib/tipos.ts` replica el contrato a mano. Evaluar OpenAPI generado más adelante.
- **MySQL de producción:** confirmar con TI la versión exacta y verificar que el esquema y las migraciones corren en ella (se evitan funciones exclusivas de la 9.x).
- **Docker / despliegue:** Dockerfile y compose se preparan antes de entregar a TI.
- **Vulnerabilidades:** `eslint-config-next` (5 altas, solo desarrollo) y `uuid` transitiva de exceljs (2 moderadas); revisar antes de entregar a TI. No usar `npm audit fix --force`.
- **exceljs 4.4.0** no tiene versiones nuevas desde dic. 2024; no abre libros con dibujos incrustados (se resuelve con una copia en memoria sin dibujos, `src/ingest/quitar-dibujos.ts`).
- **Autenticación y roles:** pendientes de definir con TI.
- **Proveedor duplicado en el catálogo:** «JASEC Internet» es el mismo proveedor que «JASEC». Falta unificarlo en la importación (alias de proveedor).
- **Aviso de n.º de servicio repetido al guardar:** hoy se detecta y se muestra en el resumen; falta advertirlo al crear o editar una obligación antes de guardar.
- **Diseño nuevo pendiente de aplicar:** las pantallas actuales todavía muestran textos internos («pronto», «Por confirmar con Tesorería») ; se reemplazan con el diseño aprobado en la maqueta (ver `CLAUDE.md`).
- **TanStack Table 8.21.3:** se eligió la línea 8 (madura) en vez de la 9, publicada en agosto de 2026 y aún con correcciones frecuentes. `npm run lint` muestra 2 advertencias del React Compiler («incompatible library») en las tablas: el compilador no optimiza esos componentes, pero funcionan bien.
- **Alertas al vuelo:** `GET /api/obligaciones` recalcula los identificadores repetidos sobre todo el catálogo en cada consulta; es trivial con ~65 obligaciones, revisar si el catálogo crece mucho.
