# CLAUDE.md · Control de pagos de Tesorería (piloto)

Reglas fijas del proyecto. Detalle técnico, arranque y contrato de API: `README.md`. Lo que aún no está aprobado va solo en la última sección, «Por aprobar»; todo lo demás está vigente.

## Confidencialidad (no negociable)
- La carpeta PASANTES (estados de cuenta y tabla de pagos frecuentes) es **solo lectura**: nunca se escribe, mueve ni copia al repositorio.
- Nunca se versionan datos financieros (`.xlsx`, `.csv`, `.eml`, resultados), `.env` ni bases de datos (`*.db`). El `.gitignore` ya los excluye; revisar `git status` antes de cada commit.
- Consola, logs y errores muestran solo conteos y estados, nunca descripciones, montos, identificadores ni filas reales.
- Las pruebas usan archivos sintéticos generados por código. Las de integración con datos reales se omiten solas si la ruta no existe.
- Rutas a datos reales solo en variables de entorno (`.env`), con su ejemplo vacío en `.env.example`.
- Los archivos originales de las fuentes nunca se modifican ni se mueven.

## Git
- Se trabaja en la rama `sarai`. Se integra a `main` por PR con **merge commit**.
- Commits pequeños, uno por tarea, con prefijo convencional en español (`feat(backend):`, `feat(frontend):`, `chore:`, `docs:`, `test:`).
- `git status` antes de cada commit. **Push solo cuando se pida.**
- **Sin atribución a Claude:** los commits no llevan `Co-Authored-By` y los PR no llevan «Generated with Claude Code».
- Cada hito termina con reporte y espera aprobación antes del siguiente.

## Arquitectura
- `Backend/` (Node + TypeScript, Fastify, Prisma + SQLite, zod, vitest; puerto 3001) y `Frontend/` (Next.js App Router + Tailwind; puerto 3000) son aplicaciones separadas que hablan solo por HTTP. El Frontend nunca toca la base.
- Los **repositorios** (`Backend/src/repositories`) son la única capa que usa Prisma; rutas y dominio no importan Prisma directamente.
- Los **parámetros de negocio viven en la base** (tabla Parametro, editables en Configuración), no en el código; los umbrales son siempre parámetros. Los que son supuesto se marcan `supuesto: true`.
- Montos en centavos (enteros); fechas ISO 8601; errores `{ "error": "texto" }` en español claro.
- Cambios al esquema de Prisma: explicar qué cambia y por qué **antes** de aplicarlos.
- Dependencias nuevas: solo las que el hito necesite, y avisar cuáles se instalaron.
- Modelo de datos: el responsable es un campo de la obligación; cada vencimiento guarda una copia de los datos de la obligación, su fecha original y su fecha vigente; las obligaciones se desactivan, no se borran; hay usuarios, roles y preferencias de aviso.

## Decisiones vigentes
- **Monto:** el monto esperado lo digita Tesorería y es opcional, así que el campo admite nulo. En el piloto no se valida contra el pago: `tolerancia_pct` existe como parámetro pero no se aplica. Si falta, se muestra «Sin monto». **Hay montos mayores a ₡21,4 millones:** los campos de monto pasan de `Int` a `BigInt` antes del cruce automático.
- **Cruce:** por identificador, sociedad, cuenta y fecha. Ventana de ±3 días calendario alrededor de la fecha esperada, que puede cruzar de un mes a otro (parámetro `ventana_dias`). Es automático solo si el resultado es claro; lo dudoso va a revisión humana. El extractor de identificador reconoce varios patrones (p. ej. `Pago:JASEC <8 dígitos>`, SINPE con «CONTRATO <9 dígitos>»).
- **Frecuencias:** mensual, bimestral, trimestral, semestral y anual, con los meses de pago marcados. La proyección es el próximo mes marcado.
- **«Control desde» (mes) por obligación:** antes de ese mes no se generan vencimientos. No hay mes de inicio global.
- **Fecha del catálogo:** el día del catálogo («15 DIA») es la fecha normal de pago aproximada, no el vencimiento.
- **Calendario automático:** el sistema mantiene solo los vencimientos (mes actual y siguientes); no hay botón «Generar vencimientos».
- **Pago repetido:** un solo pago concilia el vencimiento. Dos pagos de la misma obligación en el mismo periodo son una inconsistencia: el vencimiento queda en «Revisar» y se resuelve en su ficha eligiendo el pago correcto.
- **Sin información:** el estado «Sin información» no significa «pago no aparece» ni «vencido». Se muestra como un problema de cobertura de datos, no como alerta de pago. Existe además el estado «Pagado con atraso».
- **Proveedores:** «JASEC Internet» es el mismo proveedor que «JASEC»; se unifican en la importación.
- **N.º de servicio repetido:** Tesorería a veces repite un número sin notarlo; el aviso debe ser visible (Obligaciones e Inicio) y advertir al crear o editar una obligación antes de guardar.
- **Responsable y permisos:** el responsable es un campo de la obligación y se elige de la lista de usuarios (no es texto libre); cada cambio queda en un historial. «Ver todo» es un permiso, no una persona; el encargado principal es quien lo tiene. Quien no lo tiene ve y trabaja solo lo asignado («Mis pagos»). El filtro se aplica en el servidor. El inicio de sesión con las cuentas de la empresa se coordina con TI.
- **Avisos:** cada usuario elige sus días de anticipación; `aviso_dias` queda solo como valor por defecto para quien no configure el suyo. Llegan por tablero (campana) y por correo, al responsable asignado y a quien tiene «Ver todo»; sin responsable, solo a esta última. El correo semanal sale los viernes a las 9:00 (hora de Costa Rica). Tesorería usa Outlook: HTML con tablas, estilos en línea, ~600 px de ancho y logo incrustado. En el piloto el correo es solo un borrador (`.eml` o HTML), no se envía.
- **Fuentes:** por ahora solo Excel y CSV (sin PDF). Se configuran una o varias carpetas con la sociedad asignada por carpeta, sin estructura fija; se lee por contenido y se recorren las subcarpetas, con vista previa y exclusión de archivos antes de confirmar. Las carpetas de OneDrive llegan después, con TI. La carpeta de muestra es pequeña a propósito: el catálogo real tiene otra forma (una pestaña por sociedad, columnas por mes), así que el importador no asume la estructura de la muestra.
- **Banco y moneda de la cuenta:** editables a mano por Tesorería; la importación ya no los pisa.
- **Cambios manuales:** toda modificación hecha a mano pide confirmación mostrando el valor de antes y el de después.
- **Catálogo:** sociedad y categoría admiten «Otra…» para crear una nueva desde el alta. Lo que se activa o desactiva es el servicio (no la factura), en tres niveles: por servicio, por proveedor (en todas las sociedades o solo en una) y por sociedad; los dos últimos los hace quien tiene «Ver todo».
- **Estados y colores (diseño B):** Vencido, Por vencer, Pagado, Revisar y Programado, siempre con ícono y texto. Valores de trabajo, por confirmar: Vencido rojo `#B3261E`, Por vencer ámbar `#F2A900`, Pagado verde, Revisar verde con borde negro, Programado borde punteado. Programado = faltan más de 7 días.
- **Menú:** Inicio · Pagos del mes · Obligaciones · Estados de cuenta · Configuración, y avisos en una campana. No hay sección de Conciliación: el cruce corre por detrás y su resultado se ve y corrige en la ficha del pago (pago encontrado, unir a mano, quitar). Los movimientos del banco sin obligación se revisan en Estados de cuenta. Tocar una fila abre su ficha flotante; el menú se puede plegar.
- **Estilo:** paleta Garnier, contraste verificado (`npm run contraste`), todo estado con etiqueta de texto además del color. El aplicativo debe ser muy intuitivo: alguien nuevo lo usa sin explicación.

## Cómo trabajar
- Responder en español y de forma concisa.
- «SUPUESTO» se usa solo en documentos, respuestas y comentarios de código, **nunca en la interfaz**: la pantalla usa lenguaje de producto (sin hitos, «pronto», «por confirmar» ni mensajes técnicos).
- Inspeccionar un archivo antes de suponer su estructura.
- Antes de rediseñar o crear una pantalla, proponer una maqueta para aprobación.
- Si hay dudas, preguntar antes de suponer.
- No empezar un hito sin aprobación.

## Hitos
| Hito | Alcance | Estado |
|---|---|---|
| 1 | Esqueleto, modelo, parámetros y Configuración | Integrado en `main` |
| 2 | Importación de estados de cuenta y cobertura | Integrado en `main` (PR #1) |
| 3 | Catálogo y generación de vencimientos | Aprobado; PR a `main` |
| 4 | Diseño aprobado en Pagos del mes y Obligaciones; montos a `BigInt`; cruce automático y estados, con ficha del pago | Siguiente |
| 5 | Avisos (campana) y borradores de correo; Estados de cuenta con movimientos sin obligación | Pendiente |
| 6 | Inicio (tablero), proyección y Configuración con el diseño nuevo | Pendiente |

Diseño de referencia: maqueta local en `Escritorio\Maqueta Control de pagos` (fuera del repositorio, datos de ejemplo). El porqué de cada decisión, con fecha: `docs/registro-de-decisiones.md`.

Después de los hitos, con TI: autenticación y roles, Docker, base de datos de producción y despliegue.

## Por aprobar
Nada de esta sección es una decisión vigente.
- **Modelo de permisos:** «Ver todo» como permiso (siempre al menos una persona lo tiene) y filtro en el servidor. En el piloto, usuarios simulados con «Ver como».
- **«Vencido»:** definición por decidir. Posible estado «Atrasado», con el margen como parámetro (supuesto).
- **Colores de Vencido y Por vencer:** confirmar los valores de trabajo `#B3261E` y `#F2A900`.
- **Cobertura de estados:** si la fecha esperada más la ventana cae después del último movimiento cargado de esa cuenta y mes, queda «sin información hasta <fecha>», no «pago no aparece».
- **Subcarpetas:** profundidad máxima de lectura (supuesto: 5 niveles).
- **Parámetro `tolerancia_pct`:** decidir si se oculta o se elimina de Configuración.
