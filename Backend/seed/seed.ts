import { DEFINICIONES } from "../src/domain/parametros.js";
import { asegurarCategoria, asegurarParametro, contarParametros } from "../src/repositories/parametros.js";
import { prisma } from "../src/db.js";

// Categorías conocidas de la tabla de pagos frecuentes (el catálogo completo llega en el Hito 3).
const CATEGORIAS = ["Electricidad", "Telecom", "CCSS"];

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
console.log(`Parámetros listos: ${await contarParametros()}`);
await prisma.$disconnect();
