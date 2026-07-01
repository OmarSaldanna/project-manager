import { describe, it, expect } from "vitest";
import { calcularPrdId, mapearEmpresa, construirPrdDir, resolverPrdDir } from "./identidad.js";

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
  it("mapea las unidades a las empresas (las tres Garantiplus colapsan a garantiplus)", () => {
    expect(mapearEmpresa("Go Virtual")).toBe("govirtual");
    expect(mapearEmpresa("Gplus Seguros")).toBe("gplusseguros");
    expect(mapearEmpresa("Invarat")).toBe("invarat");
    expect(mapearEmpresa("EngineCX")).toBe("enginecx");
    expect(mapearEmpresa("Garantiplus México")).toBe("garantiplus");
    expect(mapearEmpresa("Garantiplus Colombia")).toBe("garantiplus");
    expect(mapearEmpresa("Garantiplus Chile")).toBe("garantiplus");
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

describe("resolverPrdDir", () => {
  it("dir libre: usa el id base (igual a calcularPrdId)", () => {
    const { prdId, prdDir } = resolverPrdDir("proj-a", "Invarat", () => null);
    expect(prdId).toBe(calcularPrdId("proj-a"));
    expect(prdDir).toBe(`${prdId}_invarat`);
  });

  it("dir ocupado por el MISMO proyecto: lo reutiliza", () => {
    const base = calcularPrdId("proj-a");
    const dueñoDe = (dir: string) => (dir === `${base}_invarat` ? "proj-a" : null);
    expect(resolverPrdDir("proj-a", "Invarat", dueñoDe).prdId).toBe(base);
  });

  it("dir ocupado por OTRO proyecto: sondea el siguiente id libre", () => {
    const base = calcularPrdId("proj-a");
    const ocupado = `${base}_invarat`;
    const dueñoDe = (dir: string) => (dir === ocupado ? "otro-proj" : null);
    const { prdId } = resolverPrdDir("proj-a", "Invarat", dueñoDe);
    const esperado = ((BigInt(base) + 1n) % 10000n).toString().padStart(4, "0");
    expect(prdId).toBe(esperado);
  });
});
