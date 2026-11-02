-- Vencimiento: copia de los datos de la obligación (día, sociedad, categoría, proveedor, cuenta esperada, moneda; el
-- monto estimado ya estaba). Los vencimientos que ya existen reciben la copia de su obligación actual.
ALTER TABLE `Vencimiento`
    ADD COLUMN `dia` INTEGER NULL,
    ADD COLUMN `sociedadId` INTEGER NULL,
    ADD COLUMN `categoriaId` INTEGER NULL,
    ADD COLUMN `proveedor` VARCHAR(150) NULL,
    ADD COLUMN `cuentaEsperadaId` INTEGER NULL,
    ADD COLUMN `moneda` VARCHAR(10) NULL;

UPDATE `Vencimiento` v
    JOIN `Obligacion` o ON o.`id` = v.`obligacionId`
SET v.`dia` = o.`diaEsperadoPago`,
    v.`sociedadId` = o.`sociedadId`,
    v.`categoriaId` = o.`categoriaId`,
    v.`proveedor` = o.`proveedor`,
    v.`cuentaEsperadaId` = o.`cuentaEsperadaId`,
    v.`moneda` = o.`moneda`;

ALTER TABLE `Vencimiento`
    MODIFY `sociedadId` INTEGER NOT NULL,
    MODIFY `categoriaId` INTEGER NOT NULL,
    MODIFY `proveedor` VARCHAR(150) NOT NULL,
    MODIFY `moneda` VARCHAR(10) NOT NULL;

CREATE INDEX `Vencimiento_sociedadId_idx` ON `Vencimiento`(`sociedadId`);

CREATE INDEX `Vencimiento_categoriaId_idx` ON `Vencimiento`(`categoriaId`);

ALTER TABLE `Vencimiento` ADD CONSTRAINT `Vencimiento_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Vencimiento` ADD CONSTRAINT `Vencimiento_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `Categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
