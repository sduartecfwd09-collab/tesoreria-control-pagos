import { prisma } from "../../src/db.js";
import { asegurarRoles, mapaDeRoles } from "../../src/repositories/usuarios.js";

/** Una persona de Jefatura inventada, y el encabezado con el que «actúa» (la app debe crearse con modoPruebas: true). */
export async function jefaDePruebas(): Promise<Record<string, string>> {
  await asegurarRoles();
  const rolId = (await mapaDeRoles()).get("Jefatura")!;
  const u = await prisma.usuario.upsert({
    where: { correo: "jefa-pruebas@x.cr" },
    create: { correo: "jefa-pruebas@x.cr", nombre: "Jefa de Pruebas", nombreNormalizado: "jefa de pruebas", rolId },
    update: { activo: true },
  });
  return { "x-usuario-actual": String(u.id) };
}
