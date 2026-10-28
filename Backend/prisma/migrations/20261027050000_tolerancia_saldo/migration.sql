-- Parámetro nuevo «Tolerancia de redondeo del saldo» (valor inicial 1 centavo = 0,01). Se usa al leer un estado de cuenta.
INSERT INTO `Parametro` (`clave`, `valor`, `tipo`, `ambito`, `categoriaId`, `descripcion`, `creadoEn`, `actualizado`)
SELECT 'tolerancia_saldo', '1', 'entero', 'global', 0, 'Diferencia máxima, en centavos, que se acepta por redondeo al comprobar que el saldo de un estado de cuenta cuadra (saldo anterior más créditos menos débitos). Se aplica al leer los archivos: después de cambiarla hay que volver a importar. Un estado de cuenta cuyo saldo no cuadra no cuenta como cobertura.', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Parametro` WHERE `clave` = 'tolerancia_saldo' AND `ambito` = 'global' AND `categoriaId` = 0);
