import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerConfig, escribirIdentidadPrd, dueñoDePrdDir } from "./config.js";

let raiz: string;
beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), "prd-config-")); });
afterEach(() => { rmSync(raiz, { recursive: true, force: true }); });

describe("escribirIdentidadPrd", () => {
  it("añade prd_id/prd_dir conservando las claves existentes", () => {
    const ruta = join(raiz, "config.json");
    writeFileSync(ruta, JSON.stringify({ project_id: "p", nombre: "N", unidad: "Invarat" }));
    escribirIdentidadPrd(ruta, "0042", "0042_invarat");
    const cfg = leerConfig(ruta);
    expect(cfg).toMatchObject({ project_id: "p", nombre: "N", unidad: "Invarat", prd_id: "0042", prd_dir: "0042_invarat" });
  });
});

describe("dueñoDePrdDir", () => {
  it("devuelve el project_id del config dentro del dir", () => {
    const dir = join(raiz, "0042_invarat");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), JSON.stringify({ project_id: "dueño", nombre: "x", unidad: "Invarat" }));
    expect(dueñoDePrdDir(raiz, "0042_invarat")).toBe("dueño");
  });

  it("devuelve null si el dir no existe", () => {
    expect(dueñoDePrdDir(raiz, "9999_invarat")).toBeNull();
  });

  it("devuelve null si el config.json está corrupto", () => {
    const dir = join(raiz, "bad_dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), "{ not json }");
    expect(dueñoDePrdDir(raiz, "bad_dir")).toBeNull();
  });
});
