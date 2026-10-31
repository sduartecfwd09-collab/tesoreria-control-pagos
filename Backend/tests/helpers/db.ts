import { prisma } from "../../src/db.js";
import { exigirBaseDePruebas } from "../../src/config/proteccion-pruebas.js";
import { sincronizarVencimientos } from "../../src/vencimientos/generar.js";

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

/**
 * Crea los vencimientos de todas las obligaciones entre dos meses (AAAA-MM) sin esperar al reloj: las que no tienen
 * «Control desde» lo reciben en `desde`, y el calendario se sincroniza con «hoy» = último día de `hasta`.
 */
export async function generarRango(desde: string, hasta: string) {
  await prisma.obligacion.updateMany({ where: { controlDesde: null }, data: { controlDesde: new Date(`${desde}-01T00:00:00Z`) } });
  const [y, m] = hasta.split("-").map(Number) as [number, number];
  return sincronizarVencimientos(() => new Date(y, m, 0, 10, 0));
}

/** Fija el parámetro «días después de la fecha de pago» (el valor inicial del sistema es 12; varias pruebas fijan 3 para probar el borde). */
export async function fijarDiasDespues(valor: number) {
  exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL");
  await prisma.parametro.updateMany({ where: { clave: "ventana_dias_despues" }, data: { valor: String(valor) } });
}

/** Fija el rango de búsqueda (días antes y días después). Los valores de fábrica son 10 y 12; varias pruebas fijan 3 y 3 para probar el borde. */
export async function fijarRango(antes: number, despues: number) {
  exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL");
  await prisma.parametro.updateMany({ where: { clave: "ventana_dias_antes" }, data: { valor: String(antes) } });
  await prisma.parametro.updateMany({ where: { clave: "ventana_dias_despues" }, data: { valor: String(despues) } });
}

/** Fija los meses de vencimientos que se generan por adelantado (el valor inicial del sistema es 12; las pruebas parten de 0 y las del calendario anticipado lo suben). */
export async function fijarMesesAdelante(valor: number) {
  exigirBaseDePruebas(process.env.DATABASE_URL, "DATABASE_URL");
  await prisma.parametro.updateMany({ where: { clave: "meses_vencimientos_adelante" }, data: { valor: String(valor) } });
}
