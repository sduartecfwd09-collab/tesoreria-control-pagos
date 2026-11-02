-- Limpieza del esquema: se retiran la columna Obligacion.responsable (el responsable es el tesorero de la sociedad) y la tabla Conciliacion
-- (el pago de un vencimiento vive en Vencimiento.movimientoId). Nada más cambia: decisiones, historial, vencimientos y movimientos quedan igual.

-- DropForeignKey
ALTER TABLE `Conciliacion` DROP FOREIGN KEY `Conciliacion_vencimientoId_fkey`;

-- DropForeignKey
ALTER TABLE `Conciliacion` DROP FOREIGN KEY `Conciliacion_movimientoId_fkey`;

-- AlterTable
ALTER TABLE `Obligacion` DROP COLUMN `responsable`;

-- DropTable
DROP TABLE `Conciliacion`;
