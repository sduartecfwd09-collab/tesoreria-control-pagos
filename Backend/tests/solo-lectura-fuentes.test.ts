import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importarCatalogo } from "../src/catalogo/importar.js";
import { importarCarpeta } from "../src/ingest/importar-carpeta.js";
import { sembrarSociedad } from "../src/repositories/importaciones.js";
import { catalogo, sembrarSociedadesDelCatalogo } from "./helpers/catalogo.js";
import { vaciarImportaciones } from "./helpers/db.js";
import * as M from "./helpers/muestras.js";

// Las carpetas de estados de cuenta y el catálogo son de solo lectura (la carpeta es compartida): ningún comando de
// importación ni la aplicación escribe, mueve ni borra nada en ellas.

const raizBackend = path.resolve(import.meta.dirname, "..");
const archivosDeCodigo = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === "generated" ? [] : archivosDeCodigo(p);
    return d.name.endsWith(".ts") && !d.name.startsWith("_tmp") ? [p] : [];
  });

describe("el código no usa operaciones de escritura sobre archivos", () => {
  const codigo = [...archivosDeCodigo(path.join(raizBackend, "src")), ...archivosDeCodigo(path.join(raizBackend, "scripts"))];
  // Escritura, movimiento, borrado, creación de carpetas, flujos de escritura y volcado de libros de Excel a archivo.
  const PROHIBIDO = /\b(writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rmSync|rmdir|rmdirSync|rename|renameSync|copyFile|copyFileSync|mkdir|mkdirSync|createWriteStream|truncate|truncateSync|chmod|utimes)\b|\.xlsx\.write(File)?\(|\bfs\.rm\(|\brm\(/;

  it("src y scripts no escriben, mueven ni borran archivos", () => {
    const infractores = codigo.filter((f) => PROHIBIDO.test(readFileSync(f, "utf8"))).map((f) => path.relative(raizBackend, f));
    expect(infractores).toEqual([]);
  });

  it("las únicas funciones de archivos que se importan del sistema son de lectura", () => {
    const permitidas = new Set(["readFile", "readdir", "stat", "realpath", "existsSync"]);
    const usadas = new Set<string>();
    for (const f of codigo) {
      for (const m of readFileSync(f, "utf8").matchAll(/import\s*\{([^}]*)\}\s*from\s*"node:fs(?:\/promises)?"/g)) {
        for (const n of m[1]!.split(",").map((x) => x.trim().split(/\s+as\s+/)[0]!).filter(Boolean)) usadas.add(n);
      }
    }
    expect([...usadas].filter((n) => !permitidas.has(n))).toEqual([]);
  });
});

describe("importar no cambia nada en las carpetas de origen", () => {
  let raiz: string;
  let dirCatalogo: string;

  // Huella de todo el árbol: nombres, tamaños, fechas de modificación y contenido.
  const huella = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return [`d ${path.relative(dir, p)}`, ...huella(p).map((x) => `${d.name}/${x}`)];
      const s = statSync(p);
      return [`f ${d.name} ${s.size} ${s.mtimeMs} ${createHash("sha256").update(readFileSync(p)).digest("hex")}`];
    });

  beforeAll(async () => {
    await vaciarImportaciones();
    await sembrarSociedad("ZFL", "Sociedad inventada ZFL");
    await sembrarSociedadesDelCatalogo();
    raiz = mkdtempSync(path.join(tmpdir(), "estados-solo-lectura-"));
    mkdirSync(path.join(raiz, "ZFL"), { recursive: true });
    mkdirSync(path.join(raiz, "SINSOC"), { recursive: true });
    writeFileSync(path.join(raiz, "ZFL/CR91010710102200000001 0826 ZFL.xlsx"), await M.e1());
    writeFileSync(path.join(raiz, "ZFL/CR96010710102100000006 0826 ZFL.xlsx"), "roto");
    writeFileSync(path.join(raiz, "SINSOC/CR91010710102200000009 0826 SINSOC.xlsx"), await M.e1({ iban: "CR91010710102200000009" }));
    dirCatalogo = mkdtempSync(path.join(tmpdir(), "catalogo-solo-lectura-"));
    writeFileSync(path.join(dirCatalogo, "catalogo.xlsx"), await catalogo());
  });
  afterAll(async () => {
    rmSync(raiz, { recursive: true, force: true });
    rmSync(dirCatalogo, { recursive: true, force: true });
    await vaciarImportaciones();
  });

  it("los estados de cuenta (también al reimportar y al retirarse archivos) quedan intactos", async () => {
    const antes = huella(raiz);
    await importarCarpeta(raiz);
    await importarCarpeta(raiz); // reimportar
    expect(huella(raiz)).toEqual(antes);
  });

  it("el catálogo queda intacto", async () => {
    const antes = huella(dirCatalogo);
    await importarCatalogo(path.join(dirCatalogo, "catalogo.xlsx"));
    await importarCatalogo(path.join(dirCatalogo, "catalogo.xlsx"));
    expect(huella(dirCatalogo)).toEqual(antes);
  });
});
