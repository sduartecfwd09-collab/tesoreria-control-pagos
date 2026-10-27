import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearApp } from "../src/app.js";

let app: Awaited<ReturnType<typeof crearApp>>;
beforeAll(async () => { app = await crearApp(); });
afterAll(async () => { await app.close(); });

interface P { id: number; clave: string; valor: string; categoria: string | null }
const lista = async () => (await app.inject("/api/parametros")).json().datos as P[];

describe("API de parámetros", () => {
  it("expone los parámetros iniciales", async () => {
    const d = await lista();
    expect(d.find((p) => p.clave === "ventana_dias_antes")?.valor).toBe("3");
    expect(d.find((p) => p.clave === "ventana_dias_despues")?.valor).toBe("3");
    expect(d.some((p) => p.clave === "ventana_dias")).toBe(false);
    expect(d.find((p) => p.clave === "aviso_dias")?.valor).toBe("3");
    expect(d.find((p) => p.clave === "frecuencia_defecto")?.valor).toBe("mensual");
    expect(d.some((p) => p.clave === "tolerancia_pct")).toBe(false); // se eliminó: el monto no se valida
  });

  it("edita un parámetro válido y lo persiste", async () => {
    const id = (await lista()).find((p) => p.clave === "ventana_dias_antes")!.id;
    const r = await app.inject({ method: "PUT", url: `/api/parametros/${id}`, payload: { valor: 5 } });
    expect(r.statusCode).toBe(200);
    expect((await lista()).find((p) => p.id === id)?.valor).toBe("5");
  });

  it("rechaza valores inválidos con 422 y no los guarda", async () => {
    const id = (await lista()).find((p) => p.clave === "aviso_dias")!.id;
    const r = await app.inject({ method: "PUT", url: `/api/parametros/${id}`, payload: { valor: "-4" } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toMatch(/al menos/);
    expect((await lista()).find((p) => p.id === id)?.valor).toBe("3");
  });

  it("devuelve 404 si no existe y 400 si el cuerpo es inválido", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/parametros/99999", payload: { valor: 1 } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/api/parametros/1", payload: {} })).statusCode).toBe(400);
  });

  it("CORS permite el origen del Frontend y no otros", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/salud", headers: { origin: "http://localhost:3000" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const no = await app.inject({ method: "GET", url: "/api/salud", headers: { origin: "http://malo.example" } });
    expect(no.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
