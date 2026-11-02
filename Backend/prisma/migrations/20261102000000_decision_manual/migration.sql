-- Solo agrega una tabla nueva (con sus índices y claves foráneas). No modifica ni borra filas ni columnas existentes.

-- CreateTable: decisiones humanas (asociar un pago, justificar, notas de revisión). Nada se borra: revertir marca vigente = false.
-- Las dos columnas «unica…» llevan valor solo mientras una asociación de pago está vigente y quedan nulas al revertir:
-- así la base impone una asociación vigente por (obligación, periodo) y una por pago.
CREATE TABLE `DecisionManual` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(40) NOT NULL,
    `sociedadId` INTEGER NOT NULL,
    `obligacionId` INTEGER NULL,
    `periodo` VARCHAR(7) NULL,
    `movimientoId` INTEGER NULL,
    `claveMovimiento` CHAR(40) NULL,
    `archivoId` INTEGER NULL,
    `rutaArchivo` VARCHAR(500) NULL,
    `motivo` VARCHAR(300) NOT NULL,
    `datos` VARCHAR(500) NULL,
    `huella` VARCHAR(64) NULL,
    `usuarioId` INTEGER NOT NULL,
    `nombreUsuario` VARCHAR(150) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `modoPruebas` BOOLEAN NOT NULL,
    `vigente` BOOLEAN NOT NULL DEFAULT true,
    `revertidaPorId` INTEGER NULL,
    `nombreRevierte` VARCHAR(150) NULL,
    `revertidaEn` DATETIME(3) NULL,
    `motivoReversion` VARCHAR(300) NULL,
    `unicaObligacionPeriodo` VARCHAR(60) NULL,
    `unicaMovimiento` CHAR(40) NULL,

    UNIQUE INDEX `DecisionManual_unicaObligacionPeriodo_key`(`unicaObligacionPeriodo`),
    UNIQUE INDEX `DecisionManual_unicaMovimiento_key`(`unicaMovimiento`),
    INDEX `DecisionManual_sociedadId_creadoEn_idx`(`sociedadId`, `creadoEn`),
    INDEX `DecisionManual_obligacionId_periodo_idx`(`obligacionId`, `periodo`),
    INDEX `DecisionManual_claveMovimiento_idx`(`claveMovimiento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `DecisionManual` ADD CONSTRAINT `DecisionManual_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DecisionManual` ADD CONSTRAINT `DecisionManual_obligacionId_fkey` FOREIGN KEY (`obligacionId`) REFERENCES `Obligacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: si se vuelve a leer un archivo y sus movimientos se recrean, la decisión conserva la huella y pierde solo el id
ALTER TABLE `DecisionManual` ADD CONSTRAINT `DecisionManual_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `Movimiento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DecisionManual` ADD CONSTRAINT `DecisionManual_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `ArchivoImportado`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DecisionManual` ADD CONSTRAINT `DecisionManual_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DecisionManual` ADD CONSTRAINT `DecisionManual_revertidaPorId_fkey` FOREIGN KEY (`revertidaPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
