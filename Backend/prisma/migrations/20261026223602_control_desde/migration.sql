-- Obligacion: «Control desde» (primer día del mes desde el cual se generan vencimientos). Null = aún sin definir:
-- no limita la generación hasta que se calcule (estados de cuenta cargados) o se indique a mano.
ALTER TABLE `Obligacion` ADD COLUMN `controlDesde` DATE NULL;
