import { describe, expect, it } from "vitest";
import { hoyDe } from "../src/domain/reloj.js";

describe("hoyDe usa la zona America/Costa_Rica", () => {
  it("a las 20:00 de Costa Rica (02:00 UTC del día siguiente) sigue siendo el mismo día", () => {
    const f = hoyDe(() => new Date("2026-10-30T02:00:00.000Z"));
    expect(f.toISOString().slice(0, 10)).toBe("2026-10-29");
  });
  it("a las 00:30 de Costa Rica ya es el día nuevo", () => {
    expect(hoyDe(() => new Date("2026-10-30T06:30:00.000Z")).toISOString().slice(0, 10)).toBe("2026-10-30");
  });
  it("cambio de año: 31 dic 20:00 de Costa Rica sigue en el año viejo", () => {
    expect(hoyDe(() => new Date("2027-01-01T02:00:00.000Z")).toISOString().slice(0, 10)).toBe("2026-12-31");
  });
  it("devuelve medianoche UTC", () => {
    expect(hoyDe(() => new Date("2026-10-29T15:45:00.000Z")).toISOString()).toBe("2026-10-29T00:00:00.000Z");
  });
});
