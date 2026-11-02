-- Usuario: el nombre pasa a ser obligatorio y se agrega el nombre normalizado (único) para reconocer
-- al tesorero sin tildes ni mayúsculas. El correo ya era obligatorio y único. Las tablas Usuario y Rol
-- no tienen filas en ninguna base (nada las usaba antes de este cambio).
ALTER TABLE `Usuario`
    MODIFY `nombre` VARCHAR(150) NOT NULL,
    ADD COLUMN `nombreNormalizado` VARCHAR(150) NOT NULL;

CREATE UNIQUE INDEX `Usuario_nombreNormalizado_key` ON `Usuario`(`nombreNormalizado`);

-- Sociedad: tesorero vigente (opcional).
ALTER TABLE `Sociedad` ADD COLUMN `tesoreroId` INTEGER NULL;

ALTER TABLE `Sociedad` ADD CONSTRAINT `Sociedad_tesoreroId_fkey` FOREIGN KEY (`tesoreroId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Historial de tesoreros por sociedad (hasta = NULL: vigente).
CREATE TABLE `SociedadTesoreroHistorial` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sociedadId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `desde` DATETIME(3) NOT NULL,
    `hasta` DATETIME(3) NULL,
    `motivo` VARCHAR(200) NULL,

    INDEX `SociedadTesoreroHistorial_sociedadId_idx`(`sociedadId`),
    INDEX `SociedadTesoreroHistorial_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE `SociedadTesoreroHistorial` ADD CONSTRAINT `SociedadTesoreroHistorial_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SociedadTesoreroHistorial` ADD CONSTRAINT `SociedadTesoreroHistorial_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ArchivoImportado: motivo por el que un archivo quedó "en_revision".
ALTER TABLE `ArchivoImportado` ADD COLUMN `motivo` VARCHAR(200) NULL;
