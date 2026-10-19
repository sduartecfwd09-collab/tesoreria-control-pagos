import { prisma } from "../../src/db.js";

/** Deja vacías las tablas de importación para que cada archivo de pruebas parta de cero. */
export async function vaciarImportaciones() {
  await prisma.conciliacion.deleteMany();
  await prisma.alerta.deleteMany();
  await prisma.movimiento.deleteMany();
  await prisma.archivoImportado.deleteMany();
  await prisma.vencimiento.deleteMany();
  await prisma.obligacion.deleteMany();
  await prisma.cuenta.deleteMany();
  await prisma.sociedad.deleteMany();
}
