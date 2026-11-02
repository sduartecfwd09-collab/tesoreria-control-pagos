-- ArchivoImportado: «retiradoEn» marca el archivo que estaba registrado y ya no está en la carpeta de estados de cuenta.
-- No se borra nada (se conservan el archivo registrado, sus movimientos y su historial): un archivo retirado deja de contar
-- en totales, cobertura y cruce, y se reactiva (retiradoEn = null) si vuelve a aparecer en la carpeta.
ALTER TABLE `ArchivoImportado` ADD COLUMN `retiradoEn` DATETIME(3) NULL;
