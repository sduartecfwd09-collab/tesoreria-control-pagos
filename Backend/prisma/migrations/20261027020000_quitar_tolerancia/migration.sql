-- Se elimina la tolerancia de monto por categoria: el monto esperado es opcional y no se valida contra el pago.
DELETE FROM `Parametro` WHERE `clave` = 'tolerancia_pct';
