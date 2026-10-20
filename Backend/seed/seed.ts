import { DEFINICIONES } from "../src/domain/parametros.js";
import { asegurarCategoria, asegurarParametro, contarParametros } from "../src/repositories/parametros.js";
import { asegurarSociedad } from "../src/repositories/importaciones.js";
import { prisma } from "../src/db.js";

// Categorías conocidas de la tabla de pagos frecuentes (la importación del catálogo agrega las que falten).
const CATEGORIAS = ["Electricidad", "Telecom", "CCSS"];
// Sociedades del piloto. Se crean aunque no tengan obligaciones (DM no tiene filas en la tabla de pagos).
const SOCIEDADES = ["ZFL", "GGDI", "BONAVISTA", "WW", "MEMEMC", "DM"];

for (const codigo of SOCIEDADES) await asegurarSociedad(codigo);
const cats = [];
for (const nombre of CATEGORIAS) cats.push(await asegurarCategoria(nombre));

for (const d of DEFINICIONES) {
  const ids = d.ambito === "categoria" ? cats.map((c) => c.id) : [0];
  for (const categoriaId of ids) {
    await asegurarParametro({
      clave: d.clave, valor: d.valorInicial, tipo: d.tipo, ambito: d.ambito, categoriaId,
      descripcion: d.ayuda,
    });
  }
}
console.log(`Sociedades: ${SOCIEDADES.length} · parámetros listos: ${await contarParametros()}`);
await prisma.$disconnect();
