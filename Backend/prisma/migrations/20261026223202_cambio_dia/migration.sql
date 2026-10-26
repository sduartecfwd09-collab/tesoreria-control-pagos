-- Vencimiento: fecha original (solo si el vencimiento se movió «de una sola vez»; null = la fecha vigente es la del
-- día de pago). CambioDia: historial de solo inserción de los cambios del día de pago.
ALTER TABLE `Vencimiento` ADD COLUMN `fechaOriginal` DATE NULL;

-- CreateTable
CREATE TABLE `CambioDia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `obligacionId` INTEGER NOT NULL,
    `vencimientoId` INTEGER NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `diaAnterior` INTEGER NULL,
    `diaNuevo` INTEGER NULL,
    `fechaAnterior` DATE NULL,
    `fechaNueva` DATE NULL,
    `motivo` VARCHAR(300) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CambioDia_obligacionId_idx`(`obligacionId`),
    INDEX `CambioDia_vencimientoId_idx`(`vencimientoId`),
    INDEX `CambioDia_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `CambioDia` ADD CONSTRAINT `CambioDia_obligacionId_fkey` FOREIGN KEY (`obligacionId`) REFERENCES `Obligacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CambioDia` ADD CONSTRAINT `CambioDia_vencimientoId_fkey` FOREIGN KEY (`vencimientoId`) REFERENCES `Vencimiento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CambioDia` ADD CONSTRAINT `CambioDia_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
