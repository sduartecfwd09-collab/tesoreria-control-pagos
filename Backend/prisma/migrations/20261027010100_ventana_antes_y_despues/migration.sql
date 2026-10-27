-- Parámetros: la ventana de cruce única («ventana_dias», ±N) se separa en «días antes» y «días después».
-- Si ya existía, se conserva su valor en ambos (así no se pierde lo que Tesorería haya editado).
UPDATE `Parametro` SET `clave` = 'ventana_dias_antes' WHERE `clave` = 'ventana_dias';

INSERT INTO `Parametro` (`clave`, `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`)
SELECT 'ventana_dias_despues', `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`
FROM `Parametro` WHERE `clave` = 'ventana_dias_antes';
