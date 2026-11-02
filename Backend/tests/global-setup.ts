import { prepararBaseDePruebas } from "./helpers/preparar-base.js";

// En cada corrida la base de pruebas se reinicia sola (ver helpers/preparar-base.ts).
export default async function setup() {
  await prepararBaseDePruebas();
}
