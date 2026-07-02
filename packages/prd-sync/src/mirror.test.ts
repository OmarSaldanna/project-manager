import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { espejar, esBasura } from "./mirror.js";

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

  it("espeja transcripts/ y transcripts-resumidos/ (no se ignoran)", () => {
    const src = join(raiz, "src");
    mkdirSync(join(src, "transcripts"), { recursive: true });
    mkdirSync(join(src, "transcripts-resumidos"), { recursive: true });
    writeFileSync(join(src, "transcripts", "reunion.md"), "original");
    writeFileSync(join(src, "transcripts-resumidos", "reunion.md"), "condensado");
    const dest = join(raiz, "dest");
    espejar(src, dest);
    expect(readFileSync(join(dest, "transcripts", "reunion.md"), "utf8")).toBe("original");
    expect(readFileSync(join(dest, "transcripts-resumidos", "reunion.md"), "utf8")).toBe("condensado");
  });

  it("NO copia archivos de relleno (.DS_Store, ._*, Thumbs.db, *~) aunque estén en origen", () => {
    const src = join(raiz, "src");
    mkdirSync(join(src, "transcripts"), { recursive: true });
    writeFileSync(join(src, "PRD.md"), "x");
    writeFileSync(join(src, ".DS_Store"), "junk");
    writeFileSync(join(src, "._PRD.md"), "junk");
    writeFileSync(join(src, "Thumbs.db"), "junk");
    writeFileSync(join(src, "notas.md~"), "junk");
    writeFileSync(join(src, "transcripts", ".DS_Store"), "junk");
    const dest = join(raiz, "dest");
    espejar(src, dest);
    expect(existsSync(join(dest, "PRD.md"))).toBe(true);
    expect(existsSync(join(dest, ".DS_Store"))).toBe(false);
    expect(existsSync(join(dest, "._PRD.md"))).toBe(false);
    expect(existsSync(join(dest, "Thumbs.db"))).toBe(false);
    expect(existsSync(join(dest, "notas.md~"))).toBe(false);
    expect(existsSync(join(dest, "transcripts", ".DS_Store"))).toBe(false);
  });
});

describe("esBasura", () => {
  it("marca relleno del SO/editor", () => {
    for (const n of [".DS_Store", "._recurso", "Thumbs.db", "desktop.ini", "notas~", "x.swp"]) {
      expect(esBasura(n)).toBe(true);
    }
  });
  it("NO marca archivos reales (incluidos nombres de carpetas de PRD)", () => {
    for (const n of ["PRD.md", "config.json", "transcripts", "transcripts-resumidos", "reunion.md"]) {
      expect(esBasura(n)).toBe(false);
    }
  });
});
