import { describe, expect, it } from "vitest";
import { calcularCobertura } from "../src/domain/cobertura.js";
import { coberturaSegura, enmascararCuenta, enmascararNumerosLargos, nombreDeArchivoSeguro, textoSeguro } from "../src/domain/enmascarar.js";

// Números inventados.
describe("enmascarado", () => {
  it("la cuenta deja solo los últimos 4 caracteres", () => {
    expect(enmascararCuenta("CR91010710102200000001")).toBe("****0001");
    expect(enmascararCuenta("1234567890")).toBe("****7890");
    expect(enmascararCuenta("1234")).toBe("1234");
  });

  it("toda secuencia de 8 o más dígitos queda enmascarada con sus últimos 4; las cortas no", () => {
    expect(enmascararNumerosLargos("CR91010710102200000001 0826 ZFL.xlsx")).toBe("CR****0001 0826 ZFL.xlsx");
    expect(enmascararNumerosLargos("12345678 y 1234567 y 123456789012")).toBe("****5678 y 1234567 y ****9012");
    expect(enmascararNumerosLargos("Mes 2026-08, 4 movimientos")).toBe("Mes 2026-08, 4 movimientos");
  });

  it("el archivo se muestra solo por su nombre, sin carpetas ni rutas (con / o \\)", () => {
    expect(nombreDeArchivoSeguro("ZFL/CR91010710102200000001 0826 ZFL.xlsx")).toBe("CR****0001 0826 ZFL.xlsx");
    expect(nombreDeArchivoSeguro("C:\\Datos\\Estados\\ZFL\\CR91010710102200000001 0826 ZFL.xlsx")).toBe("CR****0001 0826 ZFL.xlsx");
    expect(nombreDeArchivoSeguro("raro.xlsx")).toBe("raro.xlsx");
  });

  it("los mensajes nulos siguen nulos y los demás pierden los números largos", () => {
    expect(textoSeguro(null)).toBeNull();
    expect(textoSeguro("Fallo con CR98012300130000000008")).toBe("Fallo con CR****0008");
  });

  it("la cobertura segura no deja cuentas completas ni rutas, y conserva los conteos", () => {
    const c = calcularCobertura([
      {
        ruta: "ZFL/CR91010710102200000001 0826 ZFL.xlsx", sociedad: "ZFL", mes: "2026-08", estado: "leido", numMovimientos: 4, numDuplicados: 0, banco: "BCT",
        bancoPorConfirmar: true, moneda: "CRC", monedaPorConfirmar: true, cuentaId: 1, formato: "E1", detalle: null,
      },
      {
        ruta: "ZFL/raro 12345678901.xlsx", sociedad: "ZFL", mes: null, estado: "error", numMovimientos: 0, numDuplicados: 0, banco: null, bancoPorConfirmar: null,
        moneda: null, monedaPorConfirmar: null, cuentaId: null, formato: null, detalle: null, error: "Fallo con CR98012300130000000008",
      },
    ]);
    const s = coberturaSegura(c);
    expect(s.filas[0]).toMatchObject({ cuenta: "****0001", celdas: { "2026-08": { archivo: "CR****0001 0826 ZFL.xlsx", movimientos: 4 } } });
    expect(s.sinUbicar).toEqual([{ archivo: "raro ****8901.xlsx", error: "Fallo con CR****0008" }]);
    expect(JSON.stringify(s)).not.toMatch(/\d{8,}/);
    expect(c.filas[0]!.cuenta).toBe("CR91010710102200000001"); // el valor completo sigue disponible para el servidor
  });
});
