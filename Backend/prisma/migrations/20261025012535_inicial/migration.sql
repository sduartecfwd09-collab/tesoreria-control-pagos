-- CreateTable
CREATE TABLE `Sociedad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NULL,
    `nombreLargo` VARCHAR(200) NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Sociedad_codigo_key`(`codigo`),
    UNIQUE INDEX `Sociedad_nombreLargo_key`(`nombreLargo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Cuenta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sociedadId` INTEGER NOT NULL,
    `numero` VARCHAR(50) NOT NULL,
    `banco` VARCHAR(100) NULL,
    `bancoPorConfirmar` BOOLEAN NOT NULL DEFAULT true,
    `codigoBanco` VARCHAR(10) NULL,
    `formato` VARCHAR(10) NULL,
    `moneda` VARCHAR(10) NULL,
    `monedaPorConfirmar` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Cuenta_sociedadId_numero_key`(`sociedadId`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Categoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `nombreNormalizado` VARCHAR(100) NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Categoria_nombreNormalizado_key`(`nombreNormalizado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Obligacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sociedadId` INTEGER NOT NULL,
    `categoriaId` INTEGER NOT NULL,
    `proveedor` VARCHAR(150) NOT NULL,
    `identificador` VARCHAR(100) NOT NULL,
    `diaEsperadoPago` INTEGER NULL,
    `diaEditado` BOOLEAN NOT NULL DEFAULT false,
    `frecuencia` VARCHAR(20) NOT NULL DEFAULT 'mensual',
    `frecuenciaPorConfirmar` BOOLEAN NOT NULL DEFAULT true,
    `mesArranque` INTEGER NULL,
    `montoEsperado` BIGINT NULL,
    `moneda` VARCHAR(10) NOT NULL DEFAULT 'CRC',
    `monedaPorConfirmar` BOOLEAN NOT NULL DEFAULT true,
    `cuentaEsperadaId` INTEGER NULL,
    `responsable` VARCHAR(150) NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `origen` VARCHAR(20) NOT NULL DEFAULT 'catalogo',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Obligacion_sociedadId_proveedor_identificador_key`(`sociedadId`, `proveedor`, `identificador`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Vencimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `obligacionId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `periodo` VARCHAR(7) NOT NULL,
    `montoEsperado` BIGINT NULL,
    `estado` VARCHAR(40) NOT NULL DEFAULT 'proyectado',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vencimiento_obligacionId_periodo_key`(`obligacionId`, `periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `ArchivoImportado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ruta` VARCHAR(500) NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `formato` VARCHAR(10) NULL,
    `sociedadId` INTEGER NULL,
    `cuentaId` INTEGER NULL,
    `mes` VARCHAR(7) NULL,
    `leidoEn` DATETIME(3) NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    `numMovimientos` INTEGER NOT NULL DEFAULT 0,
    `numDuplicados` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(1000) NULL,
    `detalle` TEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ArchivoImportado_ruta_key`(`ruta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Movimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cuentaId` INTEGER NOT NULL,
    `archivoId` INTEGER NOT NULL,
    `hoja` VARCHAR(100) NOT NULL,
    `fila` INTEGER NOT NULL,
    `periodo` VARCHAR(7) NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `referencia` VARCHAR(150) NULL,
    `codigo` VARCHAR(50) NULL,
    `descripcion` TEXT NULL,
    `debito` BIGINT NOT NULL,
    `credito` BIGINT NOT NULL,
    `saldo` BIGINT NULL,
    `moneda` VARCHAR(10) NULL,
    `idExtraido` VARCHAR(100) NULL,
    `claveDedup` CHAR(40) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Movimiento_claveDedup_key`(`claveDedup`),
    INDEX `Movimiento_cuentaId_fecha_idx`(`cuentaId`, `fecha`),
    INDEX `Movimiento_periodo_idx`(`periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Conciliacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vencimientoId` INTEGER NOT NULL,
    `movimientoId` INTEGER NOT NULL,
    `tipoCruce` VARCHAR(20) NOT NULL,
    `diferenciaMonto` BIGINT NULL,
    `diferenciaDias` INTEGER NULL,
    `estado` VARCHAR(20) NOT NULL,
    `revisadoPor` VARCHAR(150) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Conciliacion_movimientoId_key`(`movimientoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Alerta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(50) NOT NULL,
    `vencimientoId` INTEGER NULL,
    `movimientoId` INTEGER NULL,
    `destinatarios` TEXT NULL,
    `canal` VARCHAR(20) NOT NULL DEFAULT 'borrador',
    `estado` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    `texto` TEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Parametro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(100) NOT NULL,
    `valor` VARCHAR(500) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `ambito` VARCHAR(20) NOT NULL DEFAULT 'global',
    `categoriaId` INTEGER NOT NULL DEFAULT 0,
    `descripcion` TEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Parametro_clave_ambito_categoriaId_key`(`clave`, `ambito`, `categoriaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Rol` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `Rol_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `correo` VARCHAR(254) NOT NULL,
    `nombre` VARCHAR(150) NULL,
    `rolId` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Usuario_correo_key`(`correo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `Cuenta` ADD CONSTRAINT `Cuenta_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Obligacion` ADD CONSTRAINT `Obligacion_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Obligacion` ADD CONSTRAINT `Obligacion_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `Categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Obligacion` ADD CONSTRAINT `Obligacion_cuentaEsperadaId_fkey` FOREIGN KEY (`cuentaEsperadaId`) REFERENCES `Cuenta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vencimiento` ADD CONSTRAINT `Vencimiento_obligacionId_fkey` FOREIGN KEY (`obligacionId`) REFERENCES `Obligacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArchivoImportado` ADD CONSTRAINT `ArchivoImportado_sociedadId_fkey` FOREIGN KEY (`sociedadId`) REFERENCES `Sociedad`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArchivoImportado` ADD CONSTRAINT `ArchivoImportado_cuentaId_fkey` FOREIGN KEY (`cuentaId`) REFERENCES `Cuenta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movimiento` ADD CONSTRAINT `Movimiento_cuentaId_fkey` FOREIGN KEY (`cuentaId`) REFERENCES `Cuenta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Movimiento` ADD CONSTRAINT `Movimiento_archivoId_fkey` FOREIGN KEY (`archivoId`) REFERENCES `ArchivoImportado`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conciliacion` ADD CONSTRAINT `Conciliacion_vencimientoId_fkey` FOREIGN KEY (`vencimientoId`) REFERENCES `Vencimiento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conciliacion` ADD CONSTRAINT `Conciliacion_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `Movimiento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alerta` ADD CONSTRAINT `Alerta_vencimientoId_fkey` FOREIGN KEY (`vencimientoId`) REFERENCES `Vencimiento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alerta` ADD CONSTRAINT `Alerta_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `Movimiento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_rolId_fkey` FOREIGN KEY (`rolId`) REFERENCES `Rol`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
