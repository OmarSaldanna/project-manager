import { describe, it, expect } from "vitest";
import { construirUrlAutenticada, redactarUrl } from "./git.js";

describe("construirUrlAutenticada", () => {
  it("inserta user:token en una URL https de GitHub", () => {
    const url = construirUrlAutenticada(
      "https://github.com/garantiplusmexico/enginecx_prd.git",
      "omarlaraenignecx",
      "ghp_secreto",
    );
    expect(url).toBe(
      "https://omarlaraenignecx:ghp_secreto@github.com/garantiplusmexico/enginecx_prd.git",
    );
  });

  it("escapa caracteres especiales del token", () => {
    const url = construirUrlAutenticada("https://github.com/o/r.git", "u", "a/b@c");
    expect(url).toContain("a%2Fb%40c");
  });
});

describe("redactarUrl", () => {
  it("oculta credenciales al loguear", () => {
    expect(redactarUrl("https://u:tok@github.com/o/r.git")).toBe("https://***@github.com/o/r.git");
  });
});
