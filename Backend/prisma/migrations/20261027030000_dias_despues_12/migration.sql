-- Parámetro «días después de la fecha de pago»: el valor inicial pasa de 3 a 12. Solo se actualiza si todavía tiene el
-- valor inicial anterior (3): un valor que Tesorería haya editado a otro número se conserva.
UPDATE `Parametro` SET `valor` = '12' WHERE `clave` = 'ventana_dias_despues' AND `valor` = '3';
