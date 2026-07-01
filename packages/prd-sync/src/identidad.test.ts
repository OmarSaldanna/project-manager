import { describe, it, expect } from "vitest";
import { calcularPrdId, esSlug, resolverPrdDir } from "./identidad.js";

describe("calcularPrdId", () => {
  it("es determinista y de 4 dígitos", () => {
    expect(calcularPrdId("nuevos-endpoints")).toBe(calcularPrdId("nuevos-endpoints"));
    expect(calcularPrdId("nuevos-endpoints")).toMatch(/^\d{4}$/);
  });

  it("distingue textos distintos (en general)", () => {
    expect(calcularPrdId("nuevos-endpoints")).not.toBe(calcularPrdId("cambios-landing"));
  });
});

describe("esSlug", () => {
  it("acepta minúsculas, dígitos y guiones", () => {
    expect(esSlug("nuevos-endpoints")).toBe(true);
    expect(esSlug("landing")).toBe(true);
    expect(esSlug("v2-endpoints")).toBe(true);
  });

  it("rechaza mayúsculas, espacios, guiones bajos y bordes", () => {
    expect(esSlug("Nuevos Endpoints")).toBe(false);
    expect(esSlug("nuevos_endpoints")).toBe(false);
    expect(esSlug("-x")).toBe(false);
    expect(esSlug("x-")).toBe(false);
    expect(esSlug("")).toBe(false);
  });
});

describe("resolverPrdDir", () => {
  it("construye {sistema}/PJ{id4}-{projectId}", () => {
    const { prdId, prdDir } = resolverPrdDir("SIGA", "nuevos-endpoints");
    expect(prdId).toBe(calcularPrdId("nuevos-endpoints"));
    expect(prdDir).toBe(`SIGA/PJ${prdId}-nuevos-endpoints`);
  });

  it("el id sale del projectId, no del sistema", () => {
    const a = resolverPrdDir("SIGA", "nuevos-endpoints");
    const b = resolverPrdDir("Alfa", "nuevos-endpoints");
    expect(a.prdId).toBe(b.prdId); // mismo desarrollo → mismo id
    expect(a.prdDir).not.toBe(b.prdDir); // distinto sistema → distinto path
  });

  it("lanza si sistema está vacío o contiene '/'", () => {
    expect(() => resolverPrdDir("", "nuevos-endpoints")).toThrow();
    expect(() => resolverPrdDir("a/b", "nuevos-endpoints")).toThrow();
  });

  it("lanza si project_id no es slug", () => {
    expect(() => resolverPrdDir("SIGA", "Nuevos Endpoints")).toThrow();
  });
});
