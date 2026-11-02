-- Solo relaja una restricción: la sociedad pasa a ser opcional en DecisionManual y HistorialCambio. No toca datos ni otras columnas.
-- Una decisión (y su línea del historial) sobre algo sin sociedad, como un archivo cuya carpeta no tiene sociedad asignada, queda con sociedadId = NULL:
-- el filtro de alcance (sociedadId IN (...)) la excluye, así que solo la ve y la hace Jefatura.
ALTER TABLE `DecisionManual` MODIFY `sociedadId` INTEGER NULL;

ALTER TABLE `HistorialCambio` MODIFY `sociedadId` INTEGER NULL;
