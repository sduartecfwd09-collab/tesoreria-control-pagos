import "dotenv/config";
import { prepararBaseDePruebas } from "../tests/helpers/preparar-base.js";

// Reinicia la base de pruebas a mano (npm test ya lo hace solo). Se niega si el nombre no termina en _test.
await prepararBaseDePruebas();
console.log("Base de pruebas lista (vaciada, migrada y sembrada).");
