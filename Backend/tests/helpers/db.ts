import { prisma } from "../../src/db.js";
import { exigirBaseDePruebas } from "../../src/config/proteccion-pruebas.js";

/** Deja vacías las tablas de importación para que cada archivo de pruebas parta de cero. */
export async function vaciarImportaciones() {
  exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL"); // borra datos: solo en la base _test
  await prisma.catalogoRevision.deleteMany();
  await prisma.cambioDia.deleteMany();
  await prisma.conciliacion.deleteMany();
  await prisma.alerta.deleteMany();
  await prisma.movimiento.deleteMany();
  await prisma.archivoImportado.deleteMany();
  await prisma.vencimiento.deleteMany();
  await prisma.obligacion.deleteMany();
  await prisma.cuenta.deleteMany();
  await prisma.sociedadTesoreroHistorial.deleteMany();
  await prisma.sociedad.deleteMany();
}

/** Deja sin usuarios la base de pruebas (quita antes el vínculo con las sociedades). Los roles se conservan. */
export async function vaciarUsuarios() {
  exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL");
  await prisma.sociedadTesoreroHistorial.deleteMany();
  await prisma.sociedad.updateMany({ data: { tesoreroId: null } });
  await prisma.usuario.deleteMany();
}

/** La copia de los datos de la obligación que lleva cada vencimiento (para crear vencimientos a mano en las pruebas). */
export const copiaDeObligacion = (o: { sociedadId: number; categoriaId: number; proveedor: string; cuentaEsperadaId: number | null; moneda: string; diaEsperadoPago: number | null }) => ({
  dia: o.diaEsperadoPago, sociedadId: o.sociedadId, categoriaId: o.categoriaId, proveedor: o.proveedor, cuentaEsperadaId: o.cuentaEsperadaId, moneda: o.moneda,
});
