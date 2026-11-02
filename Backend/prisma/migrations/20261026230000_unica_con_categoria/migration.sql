-- Obligacion: la categoría pasa a ser parte de la identidad única (sociedad, proveedor, identificador, categoría).
-- Un mismo proveedor puede cobrar con el mismo identificador paquetes de categorías distintas. Se crea el índice nuevo
-- antes de quitar el anterior porque la clave foránea de la sociedad necesita un índice que empiece por sociedadId.
CREATE UNIQUE INDEX `Obligacion_sociedadId_proveedor_identificador_categoriaId_key` ON `Obligacion`(`sociedadId`, `proveedor`, `identificador`, `categoriaId`);

DROP INDEX `Obligacion_sociedadId_proveedor_identificador_key` ON `Obligacion`;
