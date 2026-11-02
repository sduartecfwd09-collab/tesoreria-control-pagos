# Inventario 3B2a (Paso 1, solo lectura)

Sin datos reales: solo estructura de código y nombres de campos. Clasificación: **Reutiliza** / **Reemplaza** / **Retira**.

## 1. Modelo de datos actual y brechas

| Entidad | Campos hoy | Faltan para el 3B2a |
|---|---|---|
| Categoria | nombre, nombreNormalizado (único), activa | Nada de esquema. Falta la lógica (normalización con tolerancia a errores, «¿quisiste decir…?», borrado solo sin uso). |
| Proveedor | **No existe como entidad**: es texto libre en Obligacion.proveedor (150) | Tabla Proveedor (canónico) + tabla/config de alias; Obligacion.proveedorId. Hoy la unicidad usa el texto normalizado. |
| Obligacion | sociedadId, categoriaId, proveedor (texto), identificador (texto), diaEsperadoPago, diaEditado, frecuencia, mesArranque, montoEsperado BigInt?, moneda, cuentaEsperadaId, responsable (texto libre), activa, origen; único (sociedadId, proveedor, identificador) | «Control desde» (fecha); marca «identificador duplicado» (revisión); motivo de revisión; ESTADO del Excel no se lee. El único actual **bloquea** repetidos con distinto proveedor/mismo proveedor: hay que reconsiderarlo (duplicado = aviso, no bloqueo). |
| Vencimiento | obligacionId, fecha, periodo, montoEsperado, estado; único (obligacionId, periodo) | Copia de datos de la obligación (día, sociedad, categoría, proveedor, cuenta esperada, monto estimado, moneda); fecha original vs vigente. |
| Historial de cambios de día | **No existe** | Tabla de solo inserción: obligación o vencimiento, tipo (permanente / una sola vez), día/fecha anterior y nueva, motivo, autor, fecha. |
| Autor de cambios | Usuario existe (rol Jefatura/Usuario); Sociedad.tesoreroId. No hay identidad en sesión | El servicio recibe el usuario que actúa (sin login hasta 4A). |

Notas: Obligacion.montoEsperado ya es BigInt, pero el esquema de zod aún limita `MONTO_MAXIMO` a 2 147 483 647 (`domain/obligaciones.ts`): es una discrepancia con la decisión vigente, fuera del alcance de este hito salvo que lo indique.

## 2. Importador del catálogo (`catalogo/lector.ts`, `catalogo/importar.ts`, `repositories/obligaciones.ts`)

- **Columnas que lee** (por nombre, en las primeras 20 filas): Sociedad, Categoría, Proveedor, NISE/Cuenta/Identificador, «Última fecha de pago»/«día de pago». **No lee ESTADO ni fecha de inicio.**
- **Sociedades inexistentes:** `sincronizarCatalogo` hace `upsert` por `codigo` con `nombreLargo = codigo`: **crea sociedades**. Contradice la regla nueva. Se reemplaza (solo asigna a existentes; el resto a revisión con motivo, usando `alias-sociedades.ts` / `normalizarNombreSociedad` ya existentes). Además el catálogo trae la sociedad como abreviatura en mayúsculas, no como nombre oficial.
- **ESTADO:** ignorado. Toda obligación nueva nace `activa = true`; nunca se desactiva por el archivo.
- **Identificadores:** se leen como texto (`valorPlano` + `limpiarIdentificador`: sin espacios y en mayúsculas), se guardan como VarChar. Si Excel lo entrega como número se avisa («verifique ceros a la izquierda») pero ya perdió ceros. **No se comparan sin ceros a la izquierda** en ningún lugar (la clave de obligación usa el identificador tal cual).
- **Repetidos:** una fila con misma sociedad+proveedor+identificador se descarta («Repite la fila N»). Mismo identificador con otro proveedor se carga y solo se avisa después (`identificadoresRepetidos`, solo entre activas y solo con proveedor distinto). Falta: marca en la fila y lista de revisión; comparación sin ceros.
- **Proveedores:** se unifica solo por forma (tildes/mayúsculas/espacios). No hay alias.
- **Privacidad:** `POST /api/catalogo/importar` y `npm run catalogo` devuelven conteos, número de fila, nombres de proveedor; no identificadores. Correcto. Pero `/api/obligaciones/resumen` y `GET /api/obligaciones` sí devuelven identificadores (ver sección 5).

| Pieza | Decisión | Motivo |
|---|---|---|
| `leerCatalogo` (lectura por cabecera, filas, problemas) | Reutiliza, ampliar (ESTADO, fecha de inicio si aparece) | Estructura sólida; función pura. |
| `limpiarIdentificador`, `parsearDia`, `formaCategoria` | Reutiliza | Se agrega comparación sin ceros a la izquierda. |
| `sincronizarCatalogo` (upsert de sociedades) | Reemplaza | Crea sociedades; no cubre ESTADO, duplicados, Control desde. |
| `importarCatalogo` / `cli/catalogo.ts` | Reutiliza | Solo pasan el resumen. |
| `config/alias-sociedades.ts` | Reutiliza; modelo para el alias de proveedores | Igualdad exacta de clave, sin parecido. |

## 3. Proveedores: variantes y propuesta de unión

El «catálogo de muestra» no está en el repositorio (los tests generan filas sintéticas; la carpeta de la maqueta solo tiene HTML/CSS/JS). El catálogo real y la base son datos reales: según CLAUDE.md no los abro. **Lo ejecuta usted.** Comando de solo lectura (guárdelo como `Backend/scripts/_tmp-proveedores.ts`, córralo con `npx tsx scripts/_tmp-proveedores.ts` y bórrelo; no se versiona nada):

```ts
import { prisma } from "../src/db.js";
const g = await prisma.obligacion.groupBy({ by: ["proveedor"], _count: { _all: true }, orderBy: { proveedor: "asc" } });
for (const x of g) console.log(`${x.proveedor}: ${x._count._all}`);
console.log(`Proveedores distintos: ${g.length}`);
await prisma.$disconnect();
```

Pegue solo la salida (nombres de proveedor y conteos). Con ella le entrego la tabla «variante, conteo, proveedor canónico propuesto». Lo único confirmado hoy (registro de decisiones del 2026-10-21 y su ejemplo): «JASEC Internet» -> JASEC; «ICE Teléfono» -> ICE, con el servicio definido por la categoría. No se aplica ninguna unión.

Ayuda de código: el lector ya registra en `variantes` los nombres que difieren solo en forma; las uniones por palabra distinta («… Internet», «… Teléfono») requieren alias explícitos.

## 4. ¿Fecha de inicio en el catálogo?

El lector solo reconoce 5 columnas: Sociedad, Categoría, Proveedor, Identificador (NISE/Cuenta) y «Última fecha de pago» (el día). Las demás columnas del archivo real no se leen hoy. Supuesto «no trae fecha de inicio»: **no verificable desde el código**. Para comprobarlo, ejecute usted (solo encabezados, sin filas) un listado de los encabezados de la fila de cabecera de cada pestaña y péguelos. No abrí el archivo.

## 5. Rutas de la API: uso del Frontend y campos sensibles

| Ruta | ¿Frontend? | Sensibles que devuelve | Decisión (Paso 4) |
|---|---|---|---|
| GET /api/importaciones | Sí (Estados de cuenta) | **ruta** de archivo (relativa a STATEMENTS_ROOT), cuenta (número/IBAN), advertencias, discrepancias, motivo/error | Reutiliza, quitar ruta y cuenta completa (enmascarar); el Frontend muestra ruta hoy: cambiaría lo visual (ver nota) |
| POST /api/importaciones | No (solo un texto de ayuda) | Resumen de importación; errores 422 nombran STATEMENTS_ROOT (variable, no ruta) | Retira (la reimportación es por `npm run reimportar`) |
| GET /api/cobertura | Sí | **ruta** por celda, cuenta (número) por fila, banco, `sinUbicar` con rutas | Reutiliza, quitar ruta, enmascarar cuenta |
| GET /api/movimientos | **No** | **Todo**: cuenta, referencia, descripción, montos, saldos, ruta del archivo, hoja, fila | Retira (volverá con Estados de cuenta del Hito 5, con permisos del 4A) |
| GET /api/cuentas | Sí (formulario de obligación) | Número de cuenta/IBAN completo, banco | Reutiliza, enmascarar número (últimos dígitos) |
| PATCH /api/cuentas/:id | **No** | banco, moneda (no sensibles) | Retira (sin uso; vuelve cuando haya pantalla y permiso) |
| GET /api/obligaciones, /:id, /resumen | Sí (y /:id no) | identificador completo; `cuentaEsperada.numero` completo; resumen con identificadores de IBAN y repetidos | Reutiliza; /:id sin uso: retira o conserva para la ficha; quitar numero de cuenta; identificador: ver abajo |
| POST/PATCH /api/obligaciones | Sí | Misma obligación | Reutiliza (se amplía en Paso 2/3) |
| POST /api/catalogo/importar | Sí (botón) | Conteos, filas, nombres de proveedor | Reutiliza |
| GET /api/vencimientos, /periodos | Sí | Identificador de la obligación | Reutiliza |
| POST /api/vencimientos/generar | Sí (botón «Generar vencimientos») | Sociedad, proveedor, identificador de omitidas | Se mantiene en 3B2a; el botón se quita en 3B2b |
| /api/parametros GET, PUT | Sí | No | Reutiliza |
| GET /api/sociedades, /api/categorias | Sí | No | Reutiliza (categorías: ahora `sociedadId`, sin abreviatura) |
| GET /api/salud | No | Hora | Reutiliza (ruta pública permitida) |

**Nota sobre identificadores:** el Frontend los muestra completos (tabla de Obligaciones, aviso de repetidos, Pagos del mes). La regla del Paso 4 pide «quitar identificadores» de las rutas que sí se usan, pero la maqueta aprobada muestra el identificador en esas tablas. Si se quita, cambia lo visual y se contradice la fidelidad a la maqueta. **Necesito su decisión** (opciones: mantenerlo completo en Obligaciones/Pagos del mes por ser el dato de trabajo de Tesorería y quitarlo/enmascararlo solo en Estados de cuenta, cobertura y cuentas).

Además `PanelArchivos` muestra la ruta del archivo (lista de errores, revisión, nombre): si se quita la ruta, hay que mostrar solo el nombre de archivo. Es un cambio visual menor a declarar.

## 6. Generación de vencimientos y «sin información»

- `vencimientos/generar.ts` + `domain/vencimientos.ts`: `planificar` crea, para obligaciones **activas**, un vencimiento por periodo con `fechaVencimiento(periodo, día)` (último día del mes si no existe). Omite por falta de día, mes de arranque o frecuencia desconocida. Estado inicial «proyectado». Idempotente por (obligación, periodo). Manual vía `POST /api/vencimientos/generar` (hasta 24 meses); `regenerarObligacion` ajusta futuros al editar (borra los futuros sin conciliación que dejan de corresponder).
- No hay «Control desde» ni copia de datos: el vencimiento se lee de la obligación viva, así que editar o desactivar la obligación cambia el histórico. Una obligación inactiva no genera nuevos, pero `regenerarObligacion` **elimina** sus vencimientos futuros sin conciliación (los pasados quedan).
- «Sin información»: existe como valor de `estado`, pero **no se asigna en ningún lugar**. `domain/cobertura.ts` solo calcula «leído/error/falta» de archivos por sociedad-cuenta-mes; la celda «falta» no se conecta con el vencimiento. El cruce y los estados llegan en el Hito 4.

| Pieza | Decisión | Motivo |
|---|---|---|
| `planificar`, `fechaVencimiento`, `periodosEntre`, `tocaEnPeriodo` | Reutiliza | Se añade Control desde y copia de datos |
| `crearFaltantes`, `aplicarCambios` | Reutiliza con ajuste | Deben escribir la copia y no borrar si hay historial |
| `regenerarObligacion` | Reutiliza con ajuste | Cambio permanente debe afectar solo futuros no pagados |
| `generarVencimientos` + ruta | Mantener en 3B2a; retirar el botón en 3B2b | El calendario será automático |
| `domain/cobertura.ts` | Reutiliza | Base para marcar «sin información» |
| `identificadoresRepetidos`, etiqueta `id_repetido` | Reemplaza | Hoy exige proveedor distinto y activas; la regla nueva compara sin ceros y no bloquea |
| `esquemaAlta` (sociedad por abreviatura) | Reemplaza | Debe enviar `sociedadId`; 61 sociedades sin abreviatura |
| `CAMPOS_EDITABLES` incluye `activa` y `diaEsperadoPago` | Reemplaza en parte | Día editable solo con motivo e historial |
| No existe ruta de borrado de obligaciones | Reutiliza | Ya cumple «sin endpoint de borrado» |

## 7. Decisiones que necesito antes de pasar al Paso 2

1. Provisión de las variantes de proveedor y de los encabezados del catálogo (comandos de las secciones 3 y 4, que corre usted).
2. Identificador en las rutas que usa el Frontend (sección 5).
3. Mostrar solo el nombre del archivo en lugar de la ruta en Estados de cuenta (cambio visual menor).
