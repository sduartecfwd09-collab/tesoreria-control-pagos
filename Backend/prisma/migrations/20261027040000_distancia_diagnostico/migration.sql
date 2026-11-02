-- Parámetro nuevo «Distancia máxima para el diagnóstico de pagos» (valor inicial 45). Solo lo usa el diagnóstico; no cambia estados.
INSERT INTO `Parametro` (`clave`, `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`)
SELECT 'diagnostico_dias_lejos', '45', 'entero', 'global', 0, 'Solo para el diagnóstico: hasta cuántos días antes o después del rango de búsqueda se mira un pago con el mismo número para explicar por qué un vencimiento no quedó pagado. No cambia ningún estado.', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Parametro` WHERE `clave` = 'diagnostico_dias_lejos' AND `ambito` = 'global' AND `categoriaId` = 0);
