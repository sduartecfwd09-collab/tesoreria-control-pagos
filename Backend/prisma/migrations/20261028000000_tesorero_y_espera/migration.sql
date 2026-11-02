-- 1. Días de espera propios por usuario (opcional): vacío = se usa el parámetro general «dias_espera_vencido».
ALTER TABLE `Usuario` ADD COLUMN `diasEspera` INTEGER NULL;

-- 2. El rol «Usuario» pasa a llamarse «Tesorero». Si ya existía un «Tesorero», los usuarios se pasan a ese y se quita «Usuario».
UPDATE `Usuario` SET `rolId` = (SELECT `id` FROM (SELECT `id` FROM `Rol` WHERE `nombre` = 'Tesorero') AS t)
  WHERE `rolId` = (SELECT `id` FROM (SELECT `id` FROM `Rol` WHERE `nombre` = 'Usuario') AS u)
  AND EXISTS (SELECT 1 FROM (SELECT `id` FROM `Rol` WHERE `nombre` = 'Tesorero') AS x);
DELETE FROM `Rol` WHERE `nombre` = 'Usuario' AND EXISTS (SELECT 1 FROM (SELECT `id` FROM `Rol` WHERE `nombre` = 'Tesorero') AS y);
UPDATE `Rol` SET `nombre` = 'Tesorero' WHERE `nombre` = 'Usuario';
