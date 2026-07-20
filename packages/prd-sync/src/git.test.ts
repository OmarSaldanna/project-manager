import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureRepo, commitDir } from "./git.js";

function tmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "prd-git-"));
  execFileSync("git", ["-C", dir, "init", "-q"]);
  return dir;
}

const REPO = "https://github.com/garantiplusmexico/enginecx_prd.git";

describe("ensureRepo", () => {
  it("lanza si el repo ya existe con otro remote", () => {
    const dir = tmpRepo();
    try {
      execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/otro/repo.git"]);
      expect(() => ensureRepo(dir, REPO)).toThrow(/otro remote/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("es no-op si el remote ya coincide (no re-clona)", () => {
    const dir = tmpRepo();
    try {
      execFileSync("git", ["-C", dir, "remote", "add", "origin", REPO]);
      expect(() => ensureRepo(dir, REPO)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("commitDir", () => {
  it("commitea con la identidad git del equipo (no fuerza autor)", () => {
    const dir = tmpRepo();
    try {
      execFileSync("git", ["-C", dir, "config", "user.name", "Dev Equipo"]);
      execFileSync("git", ["-C", dir, "config", "user.email", "dev@equipo.test"]);
      writeFileSync(join(dir, "a.txt"), "hola");
      expect(commitDir(dir, ".", "feat: x")).toBe(true);
      const autor = execFileSync("git", ["-C", dir, "log", "-1", "--format=%an <%ae>"], {
        encoding: "utf8",
      }).trim();
      expect(autor).toBe("Dev Equipo <dev@equipo.test>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("devuelve false si no hay nada que commitear", () => {
    const dir = tmpRepo();
    try {
      execFileSync("git", ["-C", dir, "config", "user.name", "Dev"]);
      execFileSync("git", ["-C", dir, "config", "user.email", "d@d.test"]);
      expect(commitDir(dir, ".", "vacío")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lanza un mensaje claro si el equipo no tiene identidad git configurada", () => {
    const dir = tmpRepo();
    const empty = join(dir, "empty-gitconfig");
    writeFileSync(empty, "");
    const prevG = process.env.GIT_CONFIG_GLOBAL;
    const prevS = process.env.GIT_CONFIG_SYSTEM;
    // Aísla la config: sin global/system y el repo temporal no tiene user.name/email local.
    process.env.GIT_CONFIG_GLOBAL = empty;
    process.env.GIT_CONFIG_SYSTEM = empty;
    try {
      writeFileSync(join(dir, "a.txt"), "hola");
      expect(() => commitDir(dir, ".", "x")).toThrow(/identidad configurada/);
    } finally {
      if (prevG === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = prevG;
      if (prevS === undefined) delete process.env.GIT_CONFIG_SYSTEM;
      else process.env.GIT_CONFIG_SYSTEM = prevS;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
