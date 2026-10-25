import { describe, expect, it } from "vitest";
import { leerEnv } from "../src/config/env.js";

describe("leerEnv", () => {
  it("acepta SMTP_* vacío y aplica valores por defecto", () => {
    const e = leerEnv({ DATABASE_URL: "mysql://u:c@127.0.0.1:3306/x", SMTP_HOST: "", SMTP_PORT: "", STATEMENTS_ROOT: "", CATALOGO_FILE: "" });
    expect(e.SMTP_HOST).toBeUndefined();
    expect(e.SMTP_PORT).toBeUndefined();
    expect(e.STATEMENTS_ROOT).toBeUndefined();
    expect(e.CATALOGO_FILE).toBeUndefined();
    expect(e.PORT).toBe(3001);
    expect(e.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
  });
  it("falla si falta DATABASE_URL", () => {
    expect(() => leerEnv({})).toThrow(/DATABASE_URL/);
  });
  it("rechaza un puerto SMTP inválido", () => {
    expect(() => leerEnv({ DATABASE_URL: "mysql://u:c@127.0.0.1:3306/x", SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
  });
});
