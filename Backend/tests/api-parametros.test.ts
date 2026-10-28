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
    expect(d.find((p) => p.clave === "ventana_dias_antes")?.valor).toBe("10");
    expect(d.find((p) => p.clave === "dias_espera_vencido")?.valor).toBe("3");
    expect(d.find((p) => p.clave === "ventana_dias_despues")?.valor).toBe("12");
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
    await app.inject({ method: "PUT", url: `/api/parametros/${id}`, payload: { valor: 10 } });
  });

  it("en Configuración solo se ven dos parámetros; los demás siguen existiendo", async () => {
    const d = (await app.inject("/api/parametros")).json().datos as { clave: string; visible: boolean; ejemplo: string | null }[];
    expect(d.filter((p) => p.visible).map((p) => p.clave).sort()).toEqual(["aviso_dias", "dias_espera_vencido"]);
    for (const clave of ["aviso_datos_dias", "marcar_vencido_sin_estado", "diagnostico_dias_lejos", "tolerancia_saldo", "ventana_dias_antes", "ventana_dias_despues", "frecuencia_defecto"]) {
      expect(d.find((p) => p.clave === clave)?.visible).toBe(false);
    }
    for (const p of d.filter((x) => x.visible)) expect(p.ejemplo).toMatch(/Ejemplo: .*octubre/);
  });

  it("días de espera: rango de 0 a 15", async () => {
    const id = (await lista()).find((p) => p.clave === "dias_espera_vencido")!.id;
    expect((await app.inject({ method: "PUT", url: `/api/parametros/${id}`, payload: { valor: 16 } })).statusCode).toBe(422);
    expect((await app.inject({ method: "PUT", url: `/api/parametros/${id}`, payload: { valor: 0 } })).statusCode).toBe(200);
    await app.inject({ method: "PUT", url: `/api/parametros/${id}`, payload: { valor: 3 } });
  });

  it("días antes más días después debe ser menor que 30 (el período mensual): se rechaza al guardar", async () => {
    const todos = await lista();
    const antes = todos.find((p) => p.clave === "ventana_dias_antes")!.id;
    const despues = todos.find((p) => p.clave === "ventana_dias_despues")!.id;
    expect((await app.inject({ method: "PUT", url: `/api/parametros/${despues}`, payload: { valor: 15 } })).statusCode).toBe(200); // 10 + 15 = 25
    const r = await app.inject({ method: "PUT", url: `/api/parametros/${antes}`, payload: { valor: 15 } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain("deben sumar menos de 30");
    expect((await lista()).find((p) => p.id === antes)?.valor).toBe("10");
    await app.inject({ method: "PUT", url: `/api/parametros/${despues}`, payload: { valor: 12 } });
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
