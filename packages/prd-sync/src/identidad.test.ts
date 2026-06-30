import { describe, it, expect } from "vitest";
import { calcularPrdId, mapearEmpresa, construirPrdDir } from "./identidad.js";

describe("calcularPrdId", () => {
  it("es determinista: mismo project_id → mismo id en 4 dígitos", () => {
    const a = calcularPrdId("mi-proyecto");
    const b = calcularPrdId("mi-proyecto");
    expect(a).toBe(b);
    expect(a).toMatch(/^\d{4}$/);
  });

  it("distingue project_ids distintos (en general)", () => {
    expect(calcularPrdId("alpha")).not.toBe(calcularPrdId("beta"));
  });
});

describe("mapearEmpresa", () => {
  it("mapea las seis unidades a las cinco empresas", () => {
    expect(mapearEmpresa("Go Virtual")).toBe("govirtual");
    expect(mapearEmpresa("Gplus Seguros")).toBe("gplusseguros");
    expect(mapearEmpresa("Invarat")).toBe("invarat");
    expect(mapearEmpresa("EngineCX")).toBe("enginecx");
    expect(mapearEmpresa("Garantiplus México")).toBe("garantiplus");
    expect(mapearEmpresa("Garantiplus Colombia")).toBe("garantiplus");
  });

  it("lanza ante una unidad desconocida", () => {
    expect(() => mapearEmpresa("Acme")).toThrow();
  });
});

describe("construirPrdDir", () => {
  it("une id y empresa con guion bajo", () => {
    expect(construirPrdDir("0042", "garantiplus")).toBe("0042_garantiplus");
  });
});
