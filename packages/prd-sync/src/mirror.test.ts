import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { espejar } from "./mirror.js";

let raiz: string;
beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), "prd-mirror-")); });
afterEach(() => { rmSync(raiz, { recursive: true, force: true }); });

describe("espejar", () => {
  it("copia archivos del origen al destino", () => {
    const src = join(raiz, "src");
    const dest = join(raiz, "dest");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "PRD.md"), "contenido");
    espejar(src, dest);
    expect(readFileSync(join(dest, "PRD.md"), "utf8")).toBe("contenido");
  });

  it("borra en destino lo que ya no existe en origen", () => {
    const src = join(raiz, "src");
    const dest = join(raiz, "dest");
    mkdirSync(src, { recursive: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(src, "vigente.md"), "x");
    writeFileSync(join(dest, "viejo.md"), "y");
    espejar(src, dest);
    expect(existsSync(join(dest, "vigente.md"))).toBe(true);
    expect(existsSync(join(dest, "viejo.md"))).toBe(false);
  });

  it("lanza si el origen no existe", () => {
    expect(() => espejar(join(raiz, "noexiste"), join(raiz, "dest"))).toThrow();
  });

  it("crea el folder superior si el destino es anidado ({sistema}/PJ...)", () => {
    const src = join(raiz, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "PRD.md"), "x");
    const dest = join(raiz, "SIGA", "PJ0042-nuevo-endpoint"); // el padre SIGA/ no existe aún
    espejar(src, dest);
    expect(readFileSync(join(dest, "PRD.md"), "utf8")).toBe("x");
  });
});
