import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Inserta user:token en una URL https. Úsala solo en memoria (no la persistas). */
export function construirUrlAutenticada(repoUrl: string, user: string, token: string): string {
  const u = new URL(repoUrl);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(token);
  return u.toString();
}

/** Oculta credenciales embebidas para loguear sin filtrar el token. */
export function redactarUrl(url: string): string {
  return url.replace(/\/\/[^@/]+@/, "//***@");
}

function git(repoDir: string, args: string[]): string {
  return execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8" });
}

/**
 * Garantiza que `repoDir` sea un clon válido de `repoUrl`. Si falta el repo, clona con la
 * URL autenticada y luego resetea el remote a la URL LIMPIA (sin token). Si ya existe con
 * otro remote, lanza.
 */
export function ensureRepo(repoDir: string, repoUrl: string, user: string, token: string): void {
  if (existsSync(join(repoDir, ".git"))) {
    const actual = git(repoDir, ["remote", "get-url", "origin"]).trim();
    if (actual !== repoUrl) {
      throw new Error(`enginecx_prd ya existe con otro remote: ${redactarUrl(actual)} (esperado ${repoUrl}).`);
    }
    return;
  }
  if (!token) throw new Error("Falta ENGINECX_PRD_GIT_TOKEN en .env para clonar el repo central.");
  const authUrl = construirUrlAutenticada(repoUrl, user, token);
  execFileSync("git", ["clone", authUrl, repoDir], { stdio: "inherit" });
  // No dejar el token en .git/config:
  git(repoDir, ["remote", "set-url", "origin", repoUrl]);
}

/** add + commit del prd_dir. Devuelve false si no había nada que commitear. */
export function commitDir(
  repoDir: string,
  prdDir: string,
  message: string,
  user: string,
  email: string,
): boolean {
  if (user.includes("=") || email.includes("=")) {
    throw new Error(`user.name/user.email no pueden contener "=": user="${user}", email="${email}"`);
  }
  git(repoDir, ["add", prdDir]);
  const pendiente = git(repoDir, ["status", "--porcelain"]).trim();
  if (!pendiente) return false;
  execFileSync(
    "git",
    ["-C", repoDir, "-c", `user.name=${user}`, "-c", `user.email=${email}`, "commit", "-m", message],
    { stdio: "inherit" },
  );
  return true;
}

/** pull --rebase + push usando la URL autenticada como argumento (no el remote guardado). */
export function pushRepo(
  repoDir: string,
  repoUrl: string,
  user: string,
  token: string,
  branch = "main",
): void {
  if (!token) throw new Error("Falta ENGINECX_PRD_GIT_TOKEN en .env para pushear.");
  const authUrl = construirUrlAutenticada(repoUrl, user, token);
  git(repoDir, ["pull", "--rebase", authUrl, branch]);
  git(repoDir, ["push", authUrl, `HEAD:${branch}`]);
}
