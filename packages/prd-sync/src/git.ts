import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** git en un repoDir; devuelve stdout. */
function git(repoDir: string, args: string[]): string {
  return execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8" });
}

/** Lee una clave de `git config` (vacío si no está configurada). */
function gitConfig(repoDir: string, key: string): string {
  try {
    return execFileSync("git", ["-C", repoDir, "config", "--get", key], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** git para operaciones de red (clone/pull/push): captura stderr y lo surfacea si falla. */
function gitNet(args: string[]): void {
  try {
    execFileSync("git", args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    const raw = err.stderr != null ? err.stderr.toString() : (err.message ?? "");
    throw new Error(`git falló: ${raw.trim()}`);
  }
}

/**
 * Garantiza que `repoDir` sea un clon válido de `repoUrl`. Si falta, clona con la URL LIMPIA:
 * la autenticación la resuelve el git del equipo (credential helper / SSH), NO un token del .env.
 * Si ya existe con otro remote, lanza.
 */
export function ensureRepo(repoDir: string, repoUrl: string): void {
  if (existsSync(join(repoDir, ".git"))) {
    const actual = git(repoDir, ["remote", "get-url", "origin"]).trim();
    if (actual !== repoUrl) {
      throw new Error(`enginecx_prd ya existe con otro remote: ${actual} (esperado ${repoUrl}).`);
    }
    return;
  }
  gitNet(["clone", repoUrl, repoDir]);
}

/**
 * add + commit del prd_dir con la identidad git del equipo (user.name/user.email globales; no se
 * fuerza autor). Devuelve false si no había nada que commitear.
 */
export function commitDir(repoDir: string, prdDir: string, message: string): boolean {
  git(repoDir, ["add", prdDir]);
  const pendiente = git(repoDir, ["status", "--porcelain"]).trim();
  if (!pendiente) return false;
  const name = gitConfig(repoDir, "user.name");
  const email = gitConfig(repoDir, "user.email");
  if (!name || !email) {
    throw new Error(
      "git no tiene identidad configurada (user.name/user.email). Configúrala con:\n" +
        '  git config --global user.name "Tu Nombre"\n' +
        '  git config --global user.email "tu-correo@ejemplo.com"',
    );
  }
  execFileSync("git", ["-C", repoDir, "commit", "-m", message], { stdio: "inherit" });
  return true;
}

/** pull --rebase + push contra el remote 'origin' (URL limpia); auth vía git del equipo. */
export function pushRepo(repoDir: string, branch = "main"): void {
  gitNet(["-C", repoDir, "pull", "--rebase", "origin", branch]);
  gitNet(["-C", repoDir, "push", "origin", `HEAD:${branch}`]);
}
