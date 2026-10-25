import { DEFINICIONES } from "../src/domain/parametros.js";
import { asegurarCategoria, asegurarParametro, contarParametros } from "../src/repositories/parametros.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { asegurarRoles } from "../src/repositories/usuarios.js";
import { prisma } from "../src/db.js";

// Categorías conocidas de la tabla de pagos frecuentes (la importación del catálogo agrega las que falten).
const CATEGORIAS = ["Electricidad", "CCSS", "Teléfono", "Cable", "Internet"];
// Sociedades del piloto con su abreviatura interna y el nombre largo que muestra el aplicativo.
// DM salió del piloto: no se siembra. Las demás sociedades del grupo llegan con el catálogo.
const SOCIEDADES = [
  { codigo: "BONAVISTA", nombreLargo: "INVERSIONES INMOBILIARIAS BONAVISTA IIBV" },
  { codigo: "GGDI", nombreLargo: "GARNIER Y GARNIER DESARROLLOS INMOBILIARIOS S.A." },
  { codigo: "MEMEMC", nombreLargo: "INVERSIONES MEMEMC, S.A" },
  { codigo: "WW", nombreLargo: "WW Costa Rica" },
  { codigo: "ZFL", nombreLargo: "ZONA FRANCA LA LIMA, S.R.L." },
];

// Roles: Jefatura (ve todo y administra) y Usuario (ve solo sus sociedades). Los usuarios se cargan con npm run usuarios:cargar.
await asegurarRoles();

for (const { codigo, nombreLargo } of SOCIEDADES) await sembrarSociedad(codigo, nombreLargo);
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
