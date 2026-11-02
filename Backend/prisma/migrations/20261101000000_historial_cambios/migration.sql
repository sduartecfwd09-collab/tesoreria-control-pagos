-- Solo agrega: una tabla nueva y dos columnas nuevas. No modifica ni borra filas ni columnas existentes.

-- CambioDia: desde qué mes aplica un cambio permanente (AAAA-MM, opcional) y marca de modo de pruebas.
-- Las filas existentes quedan con aplicaDesde = NULL y modoPruebas = false.
ALTER TABLE `CambioDia` ADD COLUMN `aplicaDesde` VARCHAR(7) NULL,
    ADD COLUMN `modoPruebas` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: historial de decisiones humanas sobre una obligación (solo se inserta).
CREATE TABLE `HistorialCambio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entidad` VARCHAR(30) NOT NULL,
    `entidadId` INTEGER NOT NULL,
    `obligacionId` INTEGER NULL,
    `sociedadId` INTEGER NOT NULL,
    `accion` VARCHAR(30) NOT NULL,
    `campo` VARCHAR(50) NOT NULL,
    `antes` VARCHAR(100) NULL,
    `despues` VARCHAR(100) NULL,
    `motivo` VARCHAR(300) NULL,
    `usuarioId` INTEGER NOT NULL,
    `nombreUsuario` VARCHAR(150) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `modoPruebas` BOOLEAN NOT NULL,

    INDEX `HistorialCambio_sociedadId_creadoEn_idx`(`sociedadId`, `creadoEn`),
    INDEX `HistorialCambio_obligacionId_creadoEn_idx`(`obligacionId`, `creadoEn`),
    INDEX `HistorialCambio_usuarioId_creadoEn_idx`(`usuarioId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `HistorialCambio` ADD CONSTRAINT `HistorialCambio_obligacionId_fkey` FOREIGN KEY (`obligacionId`) REFERENCES `Obligacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialCambio` ADD CONSTRAINT `HistorialCambio_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialCambio` ADD CONSTRAINT `HistorialCambio_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
