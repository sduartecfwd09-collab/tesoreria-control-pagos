-- CreateTable
CREATE TABLE `CatalogoRevision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fila` INTEGER NOT NULL,
    `tipo` VARCHAR(40) NOT NULL,
    `motivo` VARCHAR(200) NOT NULL,
    `sociedadTexto` VARCHAR(200) NOT NULL,
    `categoria` VARCHAR(100) NOT NULL,
    `proveedor` VARCHAR(150) NOT NULL,
    `identificador` VARCHAR(100) NOT NULL,
    `dia` INTEGER NULL,
    `obligacionId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CatalogoRevision_tipo_idx`(`tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
