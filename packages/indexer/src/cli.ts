#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig, PmRepo, OpenAICompatibleEmbedder } from "@pm-ai/core";
import { applyCommit, type FileChange, type ApplyDeps } from "./apply.js";
import { isIndexableByName, needsShebangSniff, SHEBANG_SHELL_RE } from "./classify.js";
import { loadHtmlOverrides } from "./extract_html.js";
import { LlmDescriber, SignatureDescriber, type Describer } from "./describe.js";

/**
 * Indexador de un proyecto (CU-1 / CU-2, prompt.md §3): recorre un directorio,
 * extrae todo lo indexable y lo aplica a la DB. Para el mapeo inicial de un repo
 * existente o para re-indexar.
 *
 * Uso: pm-index <project_id> <ruta-del-repo> [--commit <sha>]
 *                [--nombre "..."] [--unidad "Engine|Go Virtual|..."] [--repo <url>]
 */
function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
const IGNORE = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo"]);
const MAX_BYTES = 1_000_000;

/** Lee el primer renglón de un archivo (para detectar shebang sin leerlo entero). */
function readShebang(full: string): string {
  const fd = openSync(full, "r");
  try {
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, 256, 0);
    return buf.toString("utf8", 0, n).split("\n")[0] ?? "";
  } catch {
    return "";
  } finally {
    closeSync(fd);
  }
}

/**
 * ¿Indexamos esta ruta? Pre-filtro por nombre + caso de ejecutable sin extensión
 * (shebang de shell). `full` es la ruta absoluta para poder leer el shebang.
 */
function esIndexable(full: string, rel: string): boolean {
  if (isIndexableByName(rel)) return true;
  if (needsShebangSniff(rel)) return SHEBANG_SHELL_RE.test(readShebang(full));
  return false;
}

/** Fallback (no-git): recorre el árbol respetando el IGNORE mínimo hardcodeado. */
function walk(repoRoot: string, dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(repoRoot, full, acc);
    else if (st.isFile() && st.size <= MAX_BYTES && esIndexable(full, relative(repoRoot, full))) {
      acc.push(full);
    }
  }
}

/**
 * Lista los archivos a indexar respetando `.gitignore` (esencia del proyecto:
 * NUNCA leemos archivos ignorados). Usa `git ls-files --cached --others
 * --exclude-standard` = versionados + no-versionados-no-ignorados. Si no es un
 * repo git, cae al walk con el IGNORE mínimo.
 */
function discoverFiles(repoPath: string): string[] {
  let rels: string[];
  try {
    const out = execSync("git ls-files --cached --others --exclude-standard -z", {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    }).toString("utf8");
    rels = out.split("\0").filter(Boolean);
  } catch {
    const acc: string[] = [];
    walk(repoPath, repoPath, acc);
    return acc;
  }
  const files: string[] = [];
  for (const rel of rels) {
    const full = join(repoPath, rel);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // listado por git pero ausente en disco (borrado sin commitear)
    }
    if (st.isFile() && st.size <= MAX_BYTES && esIndexable(full, rel)) files.push(full);
  }
  return files;
}

function gitMeta(repo: string): { sha: string; date: string } {
  const opts: Parameters<typeof execSync>[1] = {
    cwd: repo,
    stdio: ["ignore", "pipe", "ignore"],
  };
  try {
    const sha = execSync("git rev-parse HEAD", opts).toString().trim();
    const date = execSync("git show -s --format=%cI HEAD", opts).toString().trim();
    return { sha, date };
  } catch {
    return { sha: "initial", date: new Date(0).toISOString() };
  }
}

async function main(): Promise<void> {
  const [, , projectId, repoPath, ...rest] = process.argv;
  if (!projectId || !repoPath) {
    console.error("Uso: pm-index <project_id> <ruta-del-repo> [--commit <sha>]");
    process.exit(2);
  }
  const cfg = loadConfig();
  const repo = new PmRepo(cfg);
  const embedder = new OpenAICompatibleEmbedder(cfg.embeddings);
  const describer: Describer = process.env.PM_LLM_URL
    ? new LlmDescriber({
        url: process.env.PM_LLM_URL,
        apiKey: process.env.PM_LLM_KEY ?? cfg.embeddings.apiKey,
        model: process.env.PM_LLM_MODEL ?? "gpt-4o-mini",
      })
    : new SignatureDescriber();
  const htmlOverrides = loadHtmlOverrides(repoPath);
  const deps: ApplyDeps = { repo, embedder, describer, htmlOverrides };

  const meta = gitMeta(repoPath);
  const sha = flag(rest, "--commit") ?? meta.sha;

  // Registro del proyecto en el catálogo (no se crea una tabla por proyecto).
  await repo.registrarProyecto({
    projectId,
    nombre: flag(rest, "--nombre") ?? projectId,
    unidad: flag(rest, "--unidad"),
    repoUrl: flag(rest, "--repo"),
  });

  const files = discoverFiles(repoPath);
  const changes: FileChange[] = files.map((f) => ({
    ruta: relative(repoPath, f),
    contenido: readFileSync(f, "utf8"),
  }));

  console.error(`[pm-index] proyecto=${projectId} archivos=${changes.length} commit=${sha.slice(0, 8)}`);
  const stats = await applyCommit(projectId, sha, meta.date, changes, deps);

  const total = stats.reduce(
    (a, s) => ({
      created: a.created + s.created,
      versioned: a.versioned + s.versioned,
      unchanged: a.unchanged + s.unchanged,
      tombstoned: a.tombstoned + s.tombstoned,
    }),
    { created: 0, versioned: 0, unchanged: 0, tombstoned: 0 },
  );
  console.error(
    `[pm-index] listo. altas=${total.created} versiones=${total.versioned} ` +
      `sin-cambio=${total.unchanged} tombstones=${total.tombstoned}`,
  );

  // HTMLs que el indexador NO clasificó por ser ambiguos (página vs reporte).
  const pendientes = stats.filter((s) => s.pendiente);
  if (pendientes.length > 0) {
    console.error(
      `\n[pm-index] ${pendientes.length} HTML SIN INDEXAR por ser ambiguos (¿página o reporte?).\n` +
        `  Defínelos en pm-ai.overrides.json en la raíz del repo y reindexa:\n` +
        `  { "html": { ${pendientes.map((s) => `"${s.ruta}": "pagina"`).join(", ")} } }`,
    );
    for (const s of pendientes) console.error(`   - ${s.ruta}`);
  }
}

await main();
