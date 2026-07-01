import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerConfig, escribirIdentidadPrd } from "./config.js";

let raiz: string;
beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), "prd-config-")); });
afterEach(() => { rmSync(raiz, { recursive: true, force: true }); });

describe("escribirIdentidadPrd", () => {
  it("añade prd_id/prd_dir conservando las claves existentes", () => {
    const ruta = join(raiz, "config.json");
    writeFileSync(ruta, JSON.stringify({ project_id: "nuevos-endpoints", unidad: "EngineCX", sistema: "SIGA" }));
    escribirIdentidadPrd(ruta, { prdId: "2203", prdDir: "SIGA/PJ2203-nuevos-endpoints" });
    const cfg = leerConfig(ruta);
    expect(cfg).toMatchObject({
      project_id: "nuevos-endpoints",
      unidad: "EngineCX",
      sistema: "SIGA",
      prd_id: "2203",
      prd_dir: "SIGA/PJ2203-nuevos-endpoints",
    });
  });
});
