-- 1. Aviso propio por tesorero (opcional): vacío = se usa el parámetro general «aviso_dias».
ALTER TABLE `Usuario` ADD COLUMN `diasAviso` INTEGER NULL;

-- 2. Parámetro nuevo «Días de espera antes de marcar Vencido» (valor inicial 3).
INSERT INTO `Parametro` (`clave`, `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`)
SELECT 'dias_espera_vencido', '3', 'entero', 'global', 0, 'Cuántos días después de la fecha de pago se espera el pago antes de marcarlo como «Vencido». Durante la espera el pago sigue como «Por vencer».', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Parametro` WHERE `clave` = 'dias_espera_vencido' AND `ambito` = 'global' AND `categoriaId` = 0);

-- 3. Margen técnico del rango de búsqueda: días antes = 10 (si estaba en 3) y días después = 12 (si estaba en 3 o 15).
-- Cualquier otro valor se conserva.
UPDATE `Parametro` SET `valor` = '10' WHERE `clave` = 'ventana_dias_antes' AND `valor` = '3';
UPDATE `Parametro` SET `valor` = '12' WHERE `clave` = 'ventana_dias_despues' AND `valor` IN ('3', '15');
