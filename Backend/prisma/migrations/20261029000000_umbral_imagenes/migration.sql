-- Parámetros del diagnóstico de imágenes embebidas (solo diagnóstico; no cambian ningún estado).
INSERT INTO `Parametro` (`clave`, `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`)
SELECT 'diagnostico_imagen_grande_pct', '15', 'entero', 'global', 0, 'Solo para el diagnóstico: porcentaje del área de la hoja desde el que una imagen pegada se considera grande (posible captura). No cambia ningún estado.', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Parametro` WHERE `clave` = 'diagnostico_imagen_grande_pct' AND `ambito` = 'global' AND `categoriaId` = 0);
INSERT INTO `Parametro` (`clave`, `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`)
SELECT 'diagnostico_imagen_esquina_pct', '25', 'entero', 'global', 0, 'Solo para el diagnóstico: ancho, en porcentaje de la hoja, de la franja exterior que se considera esquina (una imagen pequeña en la esquina es probablemente un logo). No cambia ningún estado.', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Parametro` WHERE `clave` = 'diagnostico_imagen_esquina_pct' AND `ambito` = 'global' AND `categoriaId` = 0);
