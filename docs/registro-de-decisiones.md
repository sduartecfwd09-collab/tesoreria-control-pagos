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
| 2026-10-27 | Integridad por saldo: un archivo que «no cuadra» no cuenta como cobertura (Sin información, nunca Vencido); «no verificable» no cambia la cobertura. Tolerancia de redondeo como parámetro (1 centavo). Estados de cuenta muestra Cuadra, No cuadra y No verificable con su motivo. | Un estado de cuenta con saldo inconsistente puede estar incompleto: no sirve para afirmar que no hubo pago. |
| 2026-10-27 | Cada archivo guarda su Del y Al reales (primera y última fecha con movimientos) y el período que declara el encabezado; ninguna regla de cobertura los usa todavía. | Preparar una cobertura por fechas reales sin cambiarla aún. |
| 2026-10-27 | «ICETEL» se reconoce como ICE en la descripción del banco (supuesto; solo desempate por nombre). No hay alias para CARTA, MUAL, CTAMUSA ni MUEZ. | Reconocer pagos del ICE sin unir proveedores en la importación. |
| 2026-10-27 | Días de espera antes de marcar Vencido (parámetro, inicial 3): pasado el día de pago, el pago sigue «Por vencer» durante la espera y luego pasa a Vencido, que se sigue buscando hasta F + días después. | Un pago puede aparecer en el banco unos días tarde: marcar Vencido el día siguiente alarmaba sin motivo. |
| 2026-10-27 | Configuración muestra solo dos parámetros; el resto sigue existiendo para una sección «Avanzado» de Jefatura. Margen técnico: días antes 10 y después 12, con suma menor que 30. | Lo técnico no debe editarlo Tesorería. |
| 2026-10-27 | Aviso propio por tesorero (opcional); el calendario llega hasta el mayor aviso. | Cada persona decide con cuántos días de anticipación quiere el aviso. |
| 2026-10-27 | Frecuencia editable por obligación (fila y masiva) con mes de arranque obligatorio y marca «frecuencia confirmada»; «Frecuencia por defecto» sale de Configuración. | La tabla de pagos no trae la frecuencia: Tesorería la confirma obligación por obligación. |
| 2026-10-27 | Regla «desde» por cuenta: el Del declarado por su primer archivo (o el día 1 de su mes); la sociedad, la mayor de sus cuentas. Reemplaza la primera fecha con movimientos. | Es el período que el banco dice cubrir, no el primer movimiento. |
| 2026-10-27 | Menú lateral contraído con apertura al pasar el cursor, por teclado o toque. | Más espacio para las tablas (diferencia con la maqueta aprobada por Saraí). |
| 2026-10-28 | «Mi configuración» personal (aviso y espera de cada persona, sin tabla de otros usuarios ni fila general); el valor general queda interno como respaldo. | Cada tesorero decide sus propios plazos; lo general no es asunto de Tesorería. |
| 2026-10-28 | Identidad temporal con selector de tesorero, solo con MODO_PRUEBAS=true y nunca en producción; un único módulo «usuario actual» que el Hito 4A reemplaza por la sesión de Microsoft. | Probar el comportamiento por persona sin inicio de sesión y sin riesgo de que quede abierto en producción. |
| 2026-10-28 | El rol «Usuario» pasa a llamarse «Tesorero» (interfaz, API, seed, Excel de usuarios, pruebas y documentos); el Excel acepta ambos nombres. | El nombre dice lo que la persona hace. |
| 2026-10-28 | Gestionar explica cuatro cosas en cada pago sin encontrar: qué se esperaba, qué se buscó, qué se encontró y qué hacer; si el pago con ese número está asignado a otra obligación, lo dice con fecha y monto. | Un «no se encontró» sin más sugería que el pago no existía. |
| 2026-10-28 | La frecuencia se edita solo dentro de «Editar» (y en masa con filas marcadas); la tabla ya no lleva el control ni las marcas de confirmación. | Menos ruido en la tabla; la frecuencia es un dato que se corrige pocas veces. |
| 2026-10-28 | Paso 3.1: pantallas de solo lectura «Avisos» (cinco grupos por estado, filtradas por el responsable efectivo; Jefatura ve todo) y «Movimientos sin obligación» (débitos «Pago:PROVEEDOR número» del banco 0107 cuyo número no está en el catálogo; nunca créditos). El menú agrega ambas y renombra «Configuración» a «Mi configuración». | Ver lo que requiere atención y detectar pagos de servicios que faltan en el catálogo, sin crear nada todavía. |
| 2026-10-28 | Una sola regla de alcance en el servidor para todas las pantallas (Jefatura ve todo; el Tesorero, lo suyo por responsable efectivo o por sociedades de su responsabilidad) y la línea «Viendo: …» en cada pantalla. El selector de pruebas lista a todas las personas con su rol y arranca en la primera Jefatura. | Que Pagos del mes, Avisos, Obligaciones y Estados de cuenta cuenten lo mismo para la misma persona. |
| 2026-10-28 | «Próximo pago» es el próximo vencimiento con fecha igual o posterior a hoy según la frecuencia (ya no «el siguiente al último generado»). | Con el calendario generado hasta el 1 de noviembre, las obligaciones del día 1 mostraban diciembre. |
| 2026-10-28 | Avisos sin el grupo Programados; frecuencia solo en «Editar» (sin cambio masivo ni casillas); Movimientos sin obligación con una sola línea descriptiva; la tarjeta Por vencer dice «Dentro de los días de aviso». | Menos ruido y textos que no fijan números que dependen de cada persona. |
| 2026-10-28 | `npm run cruzar:simular -- AAAA-MM-DD`: cifras por estado con un «hoy» elegido, solo lectura y sin pantalla. | Ver Por vencer y Programado en otras fechas sin tocar la base. |
| 2026-10-28 | Los mensajes de saldo se escriben en tres partes (qué pasó, qué significa, qué hacer), sin paréntesis técnicos. El lector guarda además el saldo inicial y el final detectados de cada archivo. La regla del saldo no cambia hasta ver el resultado de `archivos:inspeccionar-saldo` en dos archivos reales. | Entender por qué hay archivos «no verificables» antes de tocar la regla. |
| 2026-10-28 | «Ver información completa» en archivos con saldo no verificable y en Movimientos sin obligación, con «Abrir archivo» (copia del .xlsx en solo lectura, solo archivos registrados y dentro del alcance) y «Copiar ruta» (relativa a la carpeta de fuentes). «Abrir en OneDrive» queda para cuando exista el inicio de sesión y TI lo habilite. | Reconocer un archivo o un pago sin salir de la aplicación. |
| 2026-10-28 | Los grupos de Archivos que requieren atención y las tarjetas de Avisos reutilizan los colores de estado existentes, siempre con texto e ícono. | Coherencia con Pagos del mes, sin colores nuevos. |

## Pendientes con Tesorería

- Cuál es el número correcto en el identificador repetido de GGDI y en el de JASEC (ZFL) con formato de IBAN.
- Completar monto, cuenta de pago y responsable de las obligaciones.
