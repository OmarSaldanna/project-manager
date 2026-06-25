import { describe, it, expect } from "vitest";
import { extractConfig } from "./extract_config.js";

describe("extractConfig", () => {
  it("JSON: una entrada tipo json con claves de primer nivel en la descripción", () => {
    const [e] = extractConfig("package.json", '{"name":"pm-ai","version":"0.1.0"}');
    expect(e!.tipo).toBe("json");
    expect(e!.nombre).toBe("package.json");
    expect(e!.descripcion).toContain("name");
    expect(e!.descripcion).toContain("version");
    expect(e!.contenido).toContain('"name"'); // contenido = crudo (base del hash)
  });

  it("YAML (.yml) se trata como yaml y lista claves de primer nivel", () => {
    const [e] = extractConfig("ci.yml", "name: CI\non: push\n  jobs: x");
    expect(e!.tipo).toBe("yaml");
    expect(e!.descripcion).toContain("name");
    expect(e!.descripcion).toContain("on");
  });

  it(".gitignore, .npmrc, .editorconfig → tipo config", () => {
    expect(extractConfig(".gitignore", "node_modules/\ndist/")[0]!.tipo).toBe("config");
    expect(extractConfig(".npmrc", "engine-strict=true")[0]!.tipo).toBe("config");
    expect(extractConfig(".editorconfig", "root = true")[0]!.tipo).toBe("config");
  });

  it("lockfiles y .env quedan excluidos (no se indexan)", () => {
    expect(extractConfig("pnpm-lock.yaml", "lockfileVersion: 9")).toEqual([]);
    expect(extractConfig("package-lock.json", "{}")).toEqual([]);
    expect(extractConfig(".env", "SECRET=123")).toEqual([]);
  });

  it("archivo vacío no produce entradas", () => {
    expect(extractConfig("vacio.json", "   ")).toEqual([]);
  });

  it("detalles.pares incluye primitivos de primer nivel y mapas de dependencias (versiones)", () => {
    const [e] = extractConfig(
      "package.json",
      '{"name":"pm-ai","version":"0.1.0","private":true,"dependencies":{"next":"^16.2.4"}}',
    );
    const pares = (e!.detalles as { pares: Record<string, unknown> }).pares;
    expect(pares.name).toBe("pm-ai");
    expect(pares.private).toBe(true);
    expect(pares.dependencies).toEqual({ next: "^16.2.4" });
  });

  it("YAML: detalles.pares con valores escalares de primer nivel", () => {
    const [e] = extractConfig("ci.yml", "name: CI\nversion: 2\n");
    const pares = (e!.detalles as { pares: Record<string, unknown> }).pares;
    expect(pares.name).toBe("CI");
    expect(pares.version).toBe("2");
  });
});
