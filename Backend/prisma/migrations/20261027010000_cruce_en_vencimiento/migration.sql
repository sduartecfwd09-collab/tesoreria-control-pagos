-- Vencimiento: resultado del motor de cruce. Guarda el movimiento que respalda el estado, el motivo (texto fijo del
-- sistema), la diferencia en días entre el pago y la fecha vigente, y la fecha hasta la que hay datos cuando el estado
-- es «sin información». Todas las columnas admiten nulo: un vencimiento sin cruzar sigue siendo válido.
ALTER TABLE `Vencimiento`
  ADD COLUMN `movimientoId` INTEGER NULL,
  ADD COLUMN `motivo` VARCHAR(200) NULL,
  ADD COLUMN `diferenciaDias` INTEGER NULL,
  ADD COLUMN `sinInfoHasta` DATE NULL;

CREATE INDEX `Vencimiento_movimientoId_idx` ON `Vencimiento`(`movimientoId`);

ALTER TABLE `Vencimiento` ADD CONSTRAINT `Vencimiento_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `Movimiento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
