import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { construirUrlAutenticada, redactarUrl, pushRepo } from "./git.js";

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

it("no filtra el token cuando el push falla", () => {
  const dir = mkdtempSync(join(tmpdir(), "prd-git-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "commit", "--allow-empty", "-q", "-m", "x"], {
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
             GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    });
    let msg = "";
    try {
      // host:puerto no enrutable → falla rápido y offline
      pushRepo(dir, "https://127.0.0.1:1/o/r.git", "u", "SUPERSECRET123");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain("SUPERSECRET123");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
