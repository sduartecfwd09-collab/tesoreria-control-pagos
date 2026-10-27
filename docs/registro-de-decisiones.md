# Registro de decisiones · Control de pagos de Tesorería

Qué se decidió, cuándo y por qué. Las reglas vigentes, en resumen, están en `CLAUDE.md`.
Sin datos reales: no se anotan identificadores, montos ni descripciones de movimientos.

## Hito 3 · Catálogo y vencimientos (cerrado el 2026-10-21)

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-20 | El catálogo se importa desde la tabla de pagos frecuentes; reimportar no duplica ni pisa lo editado por Tesorería. | Tesorería completa a mano frecuencia, monto, cuenta y responsable. |
| 2026-10-20 | Un día de pago inválido no descarta la fila: se importa sin día y se reporta. | No perder obligaciones en silencio. |
| 2026-10-20 | Frecuencia no mensual sin mes de arranque: no genera vencimientos y se avisa; el mes se puede cambiar a mano. | Evitar fechas inventadas. |
| 2026-10-20 | Resultado del catálogo real: 65 obligaciones, 6 sociedades, 3 categorías; agosto y septiembre 2026 = 130 vencimientos, igual que la Fase 1. | Verificación contra el conteo manual. |
| 2026-10-20 | La interfaz no muestra referencias internas (hitos, «pronto», «por confirmar», mensajes técnicos). | Se presenta al equipo de Tesorería; es una herramienta, no un archivo de información. |
| 2026-10-20 | Rediseño con maqueta aprobada antes de tocar el código. | Que el equipo quiera usarla; validar antes de construir. |
| 2026-10-20 | Colores del diseño B: Vencido rojo, Por vencer ámbar, Pagado verde, Revisar con borde negro, Programado punteado; siempre con ícono y texto. | Lo urgente debe llamar la atención; accesibilidad. |
| 2026-10-20 | Calendario de vencimientos automático, sin botón «Generar». | Era un paso técnico que Tesorería no debería hacer. |
| 2026-10-20 | El monto a pagar lo digita Tesorería. | Ningún archivo trae el monto de la factura. |
| 2026-10-20 | Pagos del mes muestra primero lo urgente; al detectarse el pago en el estado de cuenta pasa solo a «Pagado». | Automatizar el seguimiento. |
| 2026-10-20 | Toda modificación manual pide confirmación con el valor de antes y el de después. | Evitar cambios por error. |
| 2026-10-20 | Roles: encargado principal (ve todo y asigna) y responsable (solo lo suyo, «Mis pagos»); responsable elegido de una lista, con historial. Inicio de sesión con TI. | Que lo asignado le llegue a la persona correcta y evitar conflictos. |
| 2026-10-20 | Avisos al responsable y al encargado principal, no a todo el equipo. | Mismo motivo que los roles. |
| 2026-10-20 | Sociedad y categoría admiten «Otra…» al crear una obligación. | Pueden aparecer servicios o empresas nuevas. |
| 2026-10-21 | Se desactiva el servicio (no la factura), en tres niveles: por servicio, por proveedor (en todas las sociedades o en una) y por sociedad. | Un proveedor como el ICE da varios servicios y se puede quitar uno sin quitar los demás. |
| 2026-10-21 | El estado del pago se calcula con la fecha real y se puede cambiar a mano con motivo obligatorio; queda marcado «Manual» y se puede volver a automático. | El sistema puede equivocarse (pago no detectado o rechazado por el banco). |
| 2026-10-21 | Tocar una fila abre su ficha flotante, con una sola opción «Cambiar estado»; el menú se puede plegar. | Una sola forma de trabajar en toda la plataforma y más espacio para las tablas. |
| 2026-10-21 | Menú: Inicio · Pagos del mes · Obligaciones · Estados de cuenta · Configuración, con avisos en una campana. Sin sección de Conciliación. | La conciliación repetía lo de Pagos del mes; el cruce corre por detrás y se corrige en la ficha del pago. |
| 2026-10-21 | Hay montos mayores a ₡21,4 millones: los montos pasan a `BigInt` antes del cruce automático. | Confirmado por Tesorería. |
| 2026-10-21 | «JASEC Internet» es el mismo proveedor que «JASEC». | Confirmado por Tesorería. |
| 2026-10-21 | El aviso de n.º de servicio repetido debe ser visible y advertir al guardar. | Tesorería a veces repite un número sin notarlo. |
| 2026-10-23 | CLAUDE.md unificado con las decisiones del 21 y 22 de octubre. | Un solo documento coherente, con lo pendiente de aprobar en una sección aparte. |
| 2026-10-27 | Cruce por identificador dentro de la descripción, ventana con «días antes» y «días después» separados, y «Vencido» solo con cobertura confirmada. | Evita marcar como vencido un pago que simplemente no está cargado; el cruce no inventa. |
| 2026-10-27 | El calendario de vencimientos llega hasta hoy + días de aviso (sin meses futuros). | Tesorería solo necesita ver lo que está por vencer o ya venció. |
| 2026-10-27 | «Sin información» requiere atención (junto con Vencido) y nunca se muestra como Vencido, salvo el parámetro «Marcar Vencido aunque falte el estado de cuenta». Aviso de datos por sociedad. | Un estado de cuenta sin cargar no prueba que no se pagó (decide Saraí). |
| 2026-10-27 | «Vencimientos» pasa a «Pagos del mes» (solo el mes elegido, cuatro tarjetas, pestañas y detalle de solo lectura) y se agrega «Vencidos» (todos los meses). Toda cifra se calcula con la base y el reloj; la maqueta manda en el diseño. | La maqueta es lo que vio Tesorería; sus textos y números de ejemplo no se copian. |
| 2026-10-27 | Se elimina la tolerancia de monto por categoría (parámetro, siembra y pantalla). | Decisión del 2026-10-22 que nunca se cerró: el monto esperado es opcional y no se valida contra el pago. |
| 2026-10-27 | Las obligaciones de una sociedad con el mismo número de servicio se evalúan como grupo: sin certeza por nombre y fecha, todo el grupo del mes queda Por revisar. «MOVIS» se reconoce como Movistar. | Evita leer distinto el mismo pago en cada fila. |
| 2026-10-27 | El calendario genera todo el mes en curso; Programado = fuera de los días de aviso, Por vencer = dentro. | Así «Programados» tiene contenido y la maqueta se cumple. |
| 2026-10-27 | Menú lateral negro de la maqueta, solo con pantallas que existen; el inicio es «Pagos del mes»; «Archivos importados» pasa a «Estados de cuenta». | La maqueta es lo que vio Tesorería. |
| 2026-10-27 | Si el rango de búsqueda de un vencimiento empieza antes de la primera fecha con movimientos cargados y no hay pago, el estado es Sin información, no Vencido. | El pago pudo hacerse antes de que empezaran los estados de cuenta. |
| 2026-10-27 | El detalle de Vencido dice si hay un pago con el mismo número fuera del margen (el más cercano que no respalda otro vencimiento). | Un «no se encontró» sin más sugería que el pago no existía en ningún estado. |
| 2026-10-27 | Los días después de la fecha de pago pasan de 3 a 12 (sigue siendo parámetro editable); los días antes se quedan en 3. | Los pagos de servicios llegan al banco varios días después de la fecha del catálogo; el diagnóstico con datos reales mostrará si 12 es suficiente. |
| 2026-10-27 | La distancia máxima del diagnóstico (45 días) pasa a parámetro; el diagnóstico agrega la categoría (h) «el número aparece en un crédito», créditos con número del catálogo por formato, cobertura de saldo por formato y separa toda cifra en sociedades con cobertura completa y parcial. | Entender por qué un pago no cruza sin cambiar ningún estado. |

## Pendientes con Tesorería

- Cuál es el número correcto en el identificador repetido de GGDI y en el de JASEC (ZFL) con formato de IBAN.
- Completar monto, cuenta de pago y responsable de las obligaciones.
