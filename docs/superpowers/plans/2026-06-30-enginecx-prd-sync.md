# enginecx_prd Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar el `manager/` de cada proyecto PM·AI en el repo central de PRDs de la empresa (`enginecx_prd`), bajo una carpeta canónica `{id4}_{empresa}/`, vía un helper Node/TS y ganchos en los comandos del plugin.

**Architecture:** Paquete nuevo y aislado `packages/prd-sync` (bin `pm-prd-sync`) con lógica pura (hash de identidad, mapeo de empresa, anti-colisión), un espejo unidireccional `manager/ → enginecx_prd/{prd_dir}/` (copia + borrado de sobrantes) y operaciones git autenticadas en memoria. Los comandos `.md` (`/pm-init`, `/pm-prd`, `/pm-commit`) encadenan los subcomandos.

**Tech Stack:** TypeScript ESM (NodeNext), Node ≥22 (built-ins `node:crypto`, `node:fs`, `node:child_process`, `node:url`, `process.loadEnvFile`), vitest. Sin dependencias externas nuevas.

## Global Constraints

- **Runtime:** Node ≥22, ESM. Todo import local lleva sufijo `.js`; usa `import type` (el repo tiene `verbatimModuleSyntax: true`). `strict` + `noUncheckedIndexedAccess`.
- **Sin dependencias externas nuevas:** solo built-ins de Node. El monorepo ya trae `vitest`, `typescript`, `@types/node`.
- **Tests:** vitest, archivos `*.test.ts` colocados junto al fuente; se corren con `pnpm -r test` o `pnpm --filter @pm-ai/prd-sync test`.
- **id de 4 dígitos:** `int(sha256(project_id), 16) % 10000`, `padStart(4, "0")`.
- **Mapeo unidad → empresa (cerrado):** Go Virtual→`govirtual`, Gplus Seguros→`gplusseguros`, Invarat→`invarat`, EngineCX→`enginecx`, Garantiplus México→`garantiplus`, Garantiplus Colombia→`garantiplus`. Cualquier otra unidad → error.
- **Carpeta destino:** `{prd_id}_{empresa}` (p. ej. `0042_garantiplus`).
- **Ruta del repo central:** `${CLAUDE_PLUGIN_ROOT}/enginecx_prd` (fallback: tres niveles arriba de `dist/cli.js`).
- **Token nunca persistido:** clone/push usan URL `https://USER:TOKEN@github.com/…` en memoria; el `remote origin` guardado queda con la URL limpia. Identidad de committer vía `git -c user.name -c user.email`.
- **Push solo bajo confirmación** (lo dispara el humano desde el comando, nunca automático).
- **`.env` (raíz del plugin, ya gitignored):** `ENGINECX_PRD_REPO`, `ENGINECX_PRD_GIT_USER`, `ENGINECX_PRD_GIT_EMAIL`, `ENGINECX_PRD_GIT_TOKEN`.
- **Protocolo de commits del proyecto:** durante el desarrollo se permiten `git commit` locales por tarea (abajo), pero el índice `pm_index` se sincroniza al cierre con **`/pm-commit`** — ningún avango se considera entregado sin pasar por `/pm-commit`. (Ver `CLAUDE.md`.)

## File Structure

Nuevo paquete `packages/prd-sync/`:
- `package.json` — `@pm-ai/prd-sync`, bin `pm-prd-sync` → `./dist/cli.js`.
- `tsconfig.json` — extiende `../../tsconfig.base.json` (igual que `packages/indexer`).
- `src/identidad.ts` — puro: `calcularPrdId`, `mapearEmpresa`, `construirPrdDir`, `resolverPrdDir` (anti-colisión).
- `src/identidad.test.ts`
- `src/mirror.ts` — `espejar(src, dest)` (copia + borra sobrantes).
- `src/mirror.test.ts`
- `src/git.ts` — `construirUrlAutenticada`, `redactarUrl` (puros) + `ensureRepo`, `commitDir`, `pushRepo` (side-effects, thin).
- `src/git.test.ts` — cubre los puros.
- `src/config.ts` — `leerConfig`, `escribirIdentidadPrd`, `dueñoDePrdDir`.
- `src/config.test.ts`
- `src/env.ts` — `pluginRoot`, `cargarEnv`.
- `src/cli.ts` — dispatch de subcomandos (`#!/usr/bin/env node`).
- `src/index.ts` — re-exports.

Ediciones fuera del paquete:
- `commands/pm-init.md`, `commands/pm-prd.md`, `commands/pm-commit.md` — encadenan subcomandos.
- `.gitignore` — añade `enginecx_prd/`.
- `.env` — anexa las 4 entradas.

---

### Task 1: Scaffold del paquete + identidad pura (hash + mapeo)

**Files:**
- Create: `packages/prd-sync/package.json`
- Create: `packages/prd-sync/tsconfig.json`
- Create: `packages/prd-sync/src/identidad.ts`
- Create: `packages/prd-sync/src/index.ts`
- Test: `packages/prd-sync/src/identidad.test.ts`

**Interfaces:**
- Produces:
  - `calcularPrdId(projectId: string): string` — 4 dígitos.
  - `mapearEmpresa(unidad: string): string` — lanza si no mapea.
  - `construirPrdDir(prdId: string, empresa: string): string`.

- [ ] **Step 1: Crear `package.json` del paquete**

```json
{
  "name": "@pm-ai/prd-sync",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "pm-prd-sync": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Crear `tsconfig.json` del paquete**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: Escribir el test que falla (`src/identidad.test.ts`)**

```ts
import { describe, it, expect } from "vitest";
import { calcularPrdId, mapearEmpresa, construirPrdDir } from "./identidad.js";

describe("calcularPrdId", () => {
  it("es determinista: mismo project_id → mismo id en 4 dígitos", () => {
    const a = calcularPrdId("mi-proyecto");
    const b = calcularPrdId("mi-proyecto");
    expect(a).toBe(b);
    expect(a).toMatch(/^\d{4}$/);
  });

  it("distingue project_ids distintos (en general)", () => {
    expect(calcularPrdId("alpha")).not.toBe(calcularPrdId("beta"));
  });
});

describe("mapearEmpresa", () => {
  it("mapea las seis unidades a las cinco empresas", () => {
    expect(mapearEmpresa("Go Virtual")).toBe("govirtual");
    expect(mapearEmpresa("Gplus Seguros")).toBe("gplusseguros");
    expect(mapearEmpresa("Invarat")).toBe("invarat");
    expect(mapearEmpresa("EngineCX")).toBe("enginecx");
    expect(mapearEmpresa("Garantiplus México")).toBe("garantiplus");
    expect(mapearEmpresa("Garantiplus Colombia")).toBe("garantiplus");
  });

  it("lanza ante una unidad desconocida", () => {
    expect(() => mapearEmpresa("Acme")).toThrow();
  });
});

describe("construirPrdDir", () => {
  it("une id y empresa con guion bajo", () => {
    expect(construirPrdDir("0042", "garantiplus")).toBe("0042_garantiplus");
  });
});
```

- [ ] **Step 4: Correr el test y verlo fallar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: FAIL — no existe `./identidad.js`.

- [ ] **Step 5: Implementar `src/identidad.ts`**

```ts
import { createHash } from "node:crypto";

/** Mapa cerrado unidad (config.json) → empresa (sufijo de carpeta). */
const EMPRESA_POR_UNIDAD: Record<string, string> = {
  "Go Virtual": "govirtual",
  "Gplus Seguros": "gplusseguros",
  "Invarat": "invarat",
  "EngineCX": "enginecx",
  "Garantiplus México": "garantiplus",
  "Garantiplus Colombia": "garantiplus",
};

/** Empresa (sufijo) para una unidad. Lanza si la unidad no está en el catálogo. */
export function mapearEmpresa(unidad: string): string {
  const empresa = EMPRESA_POR_UNIDAD[unidad];
  if (empresa === undefined) {
    throw new Error(
      `Unidad no reconocida: "${unidad}". Válidas: ${Object.keys(EMPRESA_POR_UNIDAD).join(", ")}`,
    );
  }
  return empresa;
}

/** id determinista de 4 dígitos derivado del project_id (sha256 % 10000). */
export function calcularPrdId(projectId: string): string {
  const hex = createHash("sha256").update(projectId).digest("hex");
  return (BigInt("0x" + hex) % 10000n).toString().padStart(4, "0");
}

/** Nombre de carpeta destino: `{prd_id}_{empresa}`. */
export function construirPrdDir(prdId: string, empresa: string): string {
  return `${prdId}_${empresa}`;
}
```

- [ ] **Step 6: Crear `src/index.ts`**

```ts
export * from "./identidad.js";
```

- [ ] **Step 7: Correr el test y verlo pasar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: PASS (3 describe, todos verdes).

- [ ] **Step 8: Verificar typecheck/build del workspace**

Run: `pnpm -r build`
Expected: `@pm-ai/prd-sync build: Done` sin errores.

- [ ] **Step 9: Commit local**

```bash
git add packages/prd-sync/package.json packages/prd-sync/tsconfig.json packages/prd-sync/src/identidad.ts packages/prd-sync/src/identidad.test.ts packages/prd-sync/src/index.ts
git commit -m "feat(prd-sync): identidad pura (hash 4 díg + mapeo empresa)"
```

---

### Task 2: Anti-colisión (`resolverPrdDir`)

**Files:**
- Modify: `packages/prd-sync/src/identidad.ts`
- Test: `packages/prd-sync/src/identidad.test.ts`

**Interfaces:**
- Consumes: `calcularPrdId`, `mapearEmpresa`, `construirPrdDir` (Task 1).
- Produces:
  - `resolverPrdDir(projectId: string, unidad: string, dueñoDe: (prdDir: string) => string | null): { prdId: string; prdDir: string }`
    — `dueñoDe(prdDir)` devuelve el `project_id` que ya ocupa ese dir o `null` si está libre.

- [ ] **Step 1: Añadir el test que falla (al final de `identidad.test.ts`)**

```ts
import { resolverPrdDir } from "./identidad.js";

describe("resolverPrdDir", () => {
  it("dir libre: usa el id base (igual a calcularPrdId)", () => {
    const { prdId, prdDir } = resolverPrdDir("proj-a", "Invarat", () => null);
    expect(prdId).toBe(calcularPrdId("proj-a"));
    expect(prdDir).toBe(`${prdId}_invarat`);
  });

  it("dir ocupado por el MISMO proyecto: lo reutiliza", () => {
    const base = calcularPrdId("proj-a");
    const dueñoDe = (dir: string) => (dir === `${base}_invarat` ? "proj-a" : null);
    expect(resolverPrdDir("proj-a", "Invarat", dueñoDe).prdId).toBe(base);
  });

  it("dir ocupado por OTRO proyecto: sondea el siguiente id libre", () => {
    const base = calcularPrdId("proj-a");
    const ocupado = `${base}_invarat`;
    const dueñoDe = (dir: string) => (dir === ocupado ? "otro-proj" : null);
    const { prdId } = resolverPrdDir("proj-a", "Invarat", dueñoDe);
    const esperado = ((BigInt(base) + 1n) % 10000n).toString().padStart(4, "0");
    expect(prdId).toBe(esperado);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: FAIL — `resolverPrdDir` no exportado.

- [ ] **Step 3: Implementar `resolverPrdDir` (append a `identidad.ts`)**

```ts
/**
 * Resuelve el `prd_dir` libre para un proyecto. Empieza en el id base (sha256 % 10000)
 * y sondea linealmente hasta hallar un dir libre o ya propio. `dueñoDe(dir)` informa qué
 * project_id ocupa cada dir candidato (o null si está libre).
 */
export function resolverPrdDir(
  projectId: string,
  unidad: string,
  dueñoDe: (prdDir: string) => string | null,
): { prdId: string; prdDir: string } {
  const empresa = mapearEmpresa(unidad);
  const base = BigInt("0x" + createHash("sha256").update(projectId).digest("hex"));
  for (let i = 0n; i < 10000n; i++) {
    const prdId = ((base + i) % 10000n).toString().padStart(4, "0");
    const prdDir = construirPrdDir(prdId, empresa);
    const dueño = dueñoDe(prdDir);
    if (dueño === null || dueño === projectId) {
      return { prdId, prdDir };
    }
  }
  throw new Error("Sin ids de 4 dígitos disponibles para esta empresa (10000 ocupados).");
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: PASS.

- [ ] **Step 5: Commit local**

```bash
git add packages/prd-sync/src/identidad.ts packages/prd-sync/src/identidad.test.ts
git commit -m "feat(prd-sync): anti-colisión de prd_dir (sondeo lineal)"
```

---

### Task 3: Espejo `manager/ → enginecx_prd/{prd_dir}/`

**Files:**
- Create: `packages/prd-sync/src/mirror.ts`
- Test: `packages/prd-sync/src/mirror.test.ts`
- Modify: `packages/prd-sync/src/index.ts`

**Interfaces:**
- Produces: `espejar(src: string, dest: string): void` — deja `dest` idéntico a `src`; lanza si `src` no existe.

- [ ] **Step 1: Escribir el test que falla (`src/mirror.test.ts`)**

```ts
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
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: FAIL — no existe `./mirror.js`.

- [ ] **Step 3: Implementar `src/mirror.ts`**

```ts
import { rmSync, cpSync, existsSync } from "node:fs";

/**
 * Espejo unidireccional: deja `dest` idéntico a `src` (copia recursiva + borrado de
 * sobrantes, vía rm+cp). Nunca escribe de vuelta al origen. Lanza si `src` no existe.
 */
export function espejar(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`No existe el origen a espejar: ${src}`);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}
```

- [ ] **Step 4: Añadir el re-export en `src/index.ts`**

```ts
export * from "./identidad.js";
export * from "./mirror.js";
```

- [ ] **Step 5: Correr y ver pasar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: PASS.

- [ ] **Step 6: Commit local**

```bash
git add packages/prd-sync/src/mirror.ts packages/prd-sync/src/mirror.test.ts packages/prd-sync/src/index.ts
git commit -m "feat(prd-sync): espejo manager/ → enginecx_prd/ (copia + borra sobrantes)"
```

---

### Task 4: Git — URL autenticada en memoria + operaciones

**Files:**
- Create: `packages/prd-sync/src/git.ts`
- Test: `packages/prd-sync/src/git.test.ts`
- Modify: `packages/prd-sync/src/index.ts`

**Interfaces:**
- Produces:
  - `construirUrlAutenticada(repoUrl: string, user: string, token: string): string`
  - `redactarUrl(url: string): string`
  - `ensureRepo(repoDir: string, repoUrl: string, user: string, token: string): void`
  - `commitDir(repoDir: string, prdDir: string, message: string, user: string, email: string): boolean` — `false` si no había cambios.
  - `pushRepo(repoDir: string, repoUrl: string, user: string, token: string, branch?: string): void`

- [ ] **Step 1: Escribir el test que falla (`src/git.test.ts`)**

```ts
import { describe, it, expect } from "vitest";
import { construirUrlAutenticada, redactarUrl } from "./git.js";

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
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: FAIL — no existe `./git.js`.

- [ ] **Step 3: Implementar `src/git.ts`**

```ts
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
      throw new Error(`enginecx_prd ya existe con otro remote: ${actual} (esperado ${repoUrl}).`);
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
```

- [ ] **Step 4: Añadir el re-export en `src/index.ts`**

```ts
export * from "./identidad.js";
export * from "./mirror.js";
export * from "./git.js";
```

- [ ] **Step 5: Correr y ver pasar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: PASS.

- [ ] **Step 6: Commit local**

```bash
git add packages/prd-sync/src/git.ts packages/prd-sync/src/git.test.ts packages/prd-sync/src/index.ts
git commit -m "feat(prd-sync): git autenticado en memoria (clone/commit/push sin persistir token)"
```

---

### Task 5: Config del proyecto (`config.json`) + dueño de dir

**Files:**
- Create: `packages/prd-sync/src/config.ts`
- Test: `packages/prd-sync/src/config.test.ts`
- Modify: `packages/prd-sync/src/index.ts`

**Interfaces:**
- Produces:
  - `interface ProjectConfig { project_id: string; nombre: string; unidad: string; repo_url?: string; prd_id?: string; prd_dir?: string }`
  - `leerConfig(ruta: string): ProjectConfig`
  - `escribirIdentidadPrd(ruta: string, prdId: string, prdDir: string): void` — conserva las claves existentes.
  - `dueñoDePrdDir(enginecxPrdDir: string, prdDir: string): string | null` — lee `enginecx_prd/<prdDir>/config.json`.

- [ ] **Step 1: Escribir el test que falla (`src/config.test.ts`)**

```ts
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
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: FAIL — no existe `./config.js`.

- [ ] **Step 3: Implementar `src/config.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ProjectConfig {
  project_id: string;
  nombre: string;
  unidad: string;
  repo_url?: string;
  prd_id?: string;
  prd_dir?: string;
}

export function leerConfig(ruta: string): ProjectConfig {
  return JSON.parse(readFileSync(ruta, "utf8")) as ProjectConfig;
}

/** Persiste prd_id/prd_dir en el config, conservando el resto y el formato (2 espacios). */
export function escribirIdentidadPrd(ruta: string, prdId: string, prdDir: string): void {
  const cfg = leerConfig(ruta);
  cfg.prd_id = prdId;
  cfg.prd_dir = prdDir;
  writeFileSync(ruta, JSON.stringify(cfg, null, 2) + "\n");
}

/** project_id que ocupa `enginecx_prd/<prdDir>/config.json`, o null si no existe/ilegible. */
export function dueñoDePrdDir(enginecxPrdDir: string, prdDir: string): string | null {
  const cfg = join(enginecxPrdDir, prdDir, "config.json");
  if (!existsSync(cfg)) return null;
  try {
    return (JSON.parse(readFileSync(cfg, "utf8")) as ProjectConfig).project_id ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Añadir el re-export en `src/index.ts`**

```ts
export * from "./identidad.js";
export * from "./mirror.js";
export * from "./git.js";
export * from "./config.js";
```

- [ ] **Step 5: Correr y ver pasar**

Run: `pnpm --filter @pm-ai/prd-sync test`
Expected: PASS.

- [ ] **Step 6: Commit local**

```bash
git add packages/prd-sync/src/config.ts packages/prd-sync/src/config.test.ts packages/prd-sync/src/index.ts
git commit -m "feat(prd-sync): identidad persistida en config.json + dueño de prd_dir"
```

---

### Task 6: Entorno (`env.ts`) + CLI (`cli.ts`)

**Files:**
- Create: `packages/prd-sync/src/env.ts`
- Create: `packages/prd-sync/src/cli.ts`

**Interfaces:**
- Consumes: todo lo de Tasks 1-5.
- Produces (env):
  - `pluginRoot(): string`
  - `cargarEnv(): { repo: string; user: string; email: string; token: string }`
- Produces (cli): subcomandos `ensure-repo | resolve-id | mirror | commit | push` sobre `pm-prd-sync`.

- [ ] **Step 1: Implementar `src/env.ts`**

```ts
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

/** Raíz del plugin: CLAUDE_PLUGIN_ROOT si está, o tres niveles arriba de dist/cli.js. */
export function pluginRoot(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export interface EnginecxEnv {
  repo: string;
  user: string;
  email: string;
  token: string;
}

/** Carga las ENGINECX_PRD_* desde el .env del plugin (o de process.env si ya están). */
export function cargarEnv(): EnginecxEnv {
  try {
    process.loadEnvFile(join(pluginRoot(), ".env"));
  } catch {
    // sin .env: se usa lo que haya en process.env
  }
  return {
    repo: process.env.ENGINECX_PRD_REPO ?? "",
    user: process.env.ENGINECX_PRD_GIT_USER ?? "",
    email: process.env.ENGINECX_PRD_GIT_EMAIL ?? "",
    token: process.env.ENGINECX_PRD_GIT_TOKEN ?? "",
  };
}
```

- [ ] **Step 2: Implementar `src/cli.ts`**

```ts
#!/usr/bin/env node
import { join } from "node:path";
import { resolverPrdDir } from "./identidad.js";
import { espejar } from "./mirror.js";
import { ensureRepo, commitDir, pushRepo, redactarUrl, construirUrlAutenticada } from "./git.js";
import { escribirIdentidadPrd, dueñoDePrdDir } from "./config.js";
import { cargarEnv, pluginRoot } from "./env.js";

/** Lee el valor de una bandera `--nombre valor` de los args restantes. */
function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function requerido(rest: string[], name: string): string {
  const v = flag(rest, name);
  if (v === undefined) throw new Error(`Falta la bandera ${name}`);
  return v;
}

function enginecxPrdDir(): string {
  return join(pluginRoot(), "enginecx_prd");
}

function main(): void {
  const [, , sub, ...rest] = process.argv;
  const env = cargarEnv();
  const repoDir = enginecxPrdDir();

  switch (sub) {
    case "ensure-repo": {
      if (!env.repo) throw new Error("Falta ENGINECX_PRD_REPO en .env");
      ensureRepo(repoDir, env.repo, env.user, env.token);
      console.log(`enginecx_prd listo (${redactarUrl(construirUrlAutenticada(env.repo, env.user, "•"))}).`);
      break;
    }
    case "resolve-id": {
      const projectId = requerido(rest, "--project-id");
      const unidad = requerido(rest, "--unidad");
      const config = requerido(rest, "--config");
      const { prdId, prdDir } = resolverPrdDir(projectId, unidad, (d) => dueñoDePrdDir(repoDir, d));
      escribirIdentidadPrd(config, prdId, prdDir);
      console.log(prdDir);
      break;
    }
    case "mirror": {
      const manager = requerido(rest, "--manager");
      const dir = requerido(rest, "--dir");
      espejar(manager, join(repoDir, dir));
      console.log(`Espejado manager/ → enginecx_prd/${dir}/`);
      break;
    }
    case "commit": {
      const dir = requerido(rest, "--dir");
      const message = requerido(rest, "--message");
      const hubo = commitDir(repoDir, dir, message, env.user, env.email);
      console.log(hubo ? `Commit en enginecx_prd: ${message}` : "Sin cambios; nada que commitear.");
      break;
    }
    case "push": {
      if (!env.repo) throw new Error("Falta ENGINECX_PRD_REPO en .env");
      pushRepo(repoDir, env.repo, env.user, env.token);
      console.log("Push a enginecx_prd hecho.");
      break;
    }
    default:
      console.error("Uso: pm-prd-sync <ensure-repo|resolve-id|mirror|commit|push> [opciones]");
      process.exit(1);
  }
}

main();
```

- [ ] **Step 3: Build del paquete**

Run: `pnpm -r build`
Expected: `@pm-ai/prd-sync build: Done`, genera `packages/prd-sync/dist/cli.js`.

- [ ] **Step 4: Verificación manual del wiring (sin red): `resolve-id`**

```bash
# Config de prueba en un temporal
TMP="$(mktemp -d)"; echo '{"project_id":"demo-proj","nombre":"Demo","unidad":"Invarat"}' > "$TMP/config.json"
node packages/prd-sync/dist/cli.js resolve-id --project-id "demo-proj" --unidad "Invarat" --config "$TMP/config.json"
cat "$TMP/config.json"
```
Expected: imprime un `NNNN_invarat`; el config queda con `prd_id` y `prd_dir` añadidos. (No toca red ni `enginecx_prd/`.)

- [ ] **Step 5: Verificación manual del wiring (sin red): `mirror`**

```bash
SRC="$(mktemp -d)/manager"; mkdir -p "$SRC"; echo "# PRD demo" > "$SRC/PRD.md"
CLAUDE_PLUGIN_ROOT="$(pwd)" node packages/prd-sync/dist/cli.js mirror --manager "$SRC" --dir "0000_demo"
ls enginecx_prd/0000_demo
rm -rf enginecx_prd/0000_demo
```
Expected: lista `PRD.md` dentro de `enginecx_prd/0000_demo/`. (Limpia el dir de prueba al final.)

- [ ] **Step 6: Commit local**

```bash
git add packages/prd-sync/src/env.ts packages/prd-sync/src/cli.ts
git commit -m "feat(prd-sync): env loader + CLI (ensure-repo/resolve-id/mirror/commit/push)"
```

---

### Task 7: Integración — comandos, `.gitignore` y `.env`

**Files:**
- Modify: `.gitignore`
- Modify: `.env`
- Modify: `commands/pm-init.md`
- Modify: `commands/pm-prd.md`
- Modify: `commands/pm-commit.md`

**Interfaces:**
- Consumes: bin `pm-prd-sync` (Task 6), invocado como `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" <sub>`.

- [ ] **Step 1: Ignorar el clon anidado en `.gitignore`**

Añade al final de `.gitignore`:
```gitignore

# Clon local del repo central de PRDs (vive solo donde está instalado el plugin):
enginecx_prd/
```

- [ ] **Step 2: Anexar las entradas al `.env`**

```bash
{
  echo ""
  echo "# enginecx_prd — repo central de PRDs (garantiplusmexico/enginecx_prd)"
  echo "ENGINECX_PRD_REPO=https://github.com/garantiplusmexico/enginecx_prd.git"
  echo "ENGINECX_PRD_GIT_USER=omarlaraenignecx"
  echo "ENGINECX_PRD_GIT_EMAIL=omar.lara@enginecx.com"
  echo "ENGINECX_PRD_GIT_TOKEN="
} >> .env
```
Expected: las 4 líneas quedan en `.env` (token vacío para que Omar lo complete).

- [ ] **Step 3: `commands/pm-init.md` — Paso 3 (identidad ampliada)**

En el Paso 3 (`manager/config.json`), tras escribir `{ project_id, nombre, unidad, repo_url }`, añade el subpaso que resuelve y persiste la identidad PRD:
```markdown
4. Asegura el repo central y resuelve la identidad PRD (id de 4 dígitos + carpeta por empresa):
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" ensure-repo`
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" resolve-id --project-id "<project_id>" --unidad "<unidad>" --config "manager/config.json"`
     (esto agrega `prd_id` y `prd_dir` a `manager/config.json`).
```

- [ ] **Step 4: `commands/pm-init.md` — nuevo paso de publicación (tras el indexado, Paso 6)**

Añade un paso al final que espeja y commitea, y **propone** el push:
```markdown
## Paso 7 — Publicar en el repo central de PRDs (enginecx_prd)

1. Espeja `manager/` y commitea en el repo central (lee `prd_dir` de `manager/config.json`):
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" mirror --manager "manager" --dir "<prd_dir>"`
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" commit --dir "<prd_dir>" --message "feat(prd): <nombre> (<prd_dir>) — init"`
2. **Propón** el push (no automático): muestra qué se subirá y, **solo tras confirmación**, corre
   `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" push`.
```

- [ ] **Step 5: `commands/pm-prd.md` — publicar tras actualizar el PRD**

Al cierre del comando (después de escribir/actualizar `manager/PRD.md`), añade:
```markdown
## Publicación al repo central (enginecx_prd)

Tras actualizar el PRD, refleja el estado y commitea en el repo central (usa `prd_dir` de
`manager/config.json`):
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" mirror --manager "manager" --dir "<prd_dir>"`
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" commit --dir "<prd_dir>" --message "feat(prd): <nombre> (<prd_dir>) — update PRD"`
Luego **propón** el push y córrelo solo tras confirmación:
`node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" push`.
```

- [ ] **Step 6: `commands/pm-commit.md` — reflejar al cerrar un avance**

En el paso final de reporte/handoff de `/pm-commit`, añade el reflejo del estado al repo central:
```markdown
## Reflejo al repo central de PRDs (enginecx_prd)

Tras indexar y commitear el código, refleja `manager/` y commitea en el repo central (usa
`prd_dir` de `manager/config.json`):
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" mirror --manager "manager" --dir "<prd_dir>"`
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" commit --dir "<prd_dir>" --message "chore(prd): <nombre> (<prd_dir>) — sync estado"`
**Propón** el push y córrelo solo tras confirmación: `... push`.
```

- [ ] **Step 7: Verificación de integración (extremo a extremo, con red — requiere token)**

Solo si `.env` tiene `ENGINECX_PRD_GIT_TOKEN`:
```bash
node packages/prd-sync/dist/cli.js ensure-repo
# en un proyecto inicializado con manager/config.json que tenga prd_dir:
node packages/prd-sync/dist/cli.js mirror --manager "manager" --dir "$(node -e "console.log(require('./manager/config.json').prd_dir)")"
node packages/prd-sync/dist/cli.js commit --dir "<prd_dir>" --message "test: sync inicial"
git -C enginecx_prd log --oneline -1
# push solo tras revisar:
# node packages/prd-sync/dist/cli.js push
```
Expected: `enginecx_prd/` clonado; carpeta `<prd_dir>/` con copia de `manager/`; un commit local en `enginecx_prd`. Verifica que `git -C enginecx_prd remote get-url origin` **no** contiene el token.

- [ ] **Step 8: Commit local**

```bash
git add .gitignore commands/pm-init.md commands/pm-prd.md commands/pm-commit.md
git commit -m "feat(prd-sync): integrar publicación a enginecx_prd en pm-init/pm-prd/pm-commit"
```
(El `.env` no se versiona; queda solo local.)

---

## Cierre (protocolo del proyecto)

- [ ] **Sincronizar índice con `/pm-commit`.** Los commits locales de arriba dejan git al día pero el índice `pm_index` no. Cierra el avance completo (este paquete + ediciones de comandos + spec + la eliminación de guías previa) con **`/pm-commit`**, proponiendo la lista de archivos y mensajes para confirmación. No dejes el avance sin pasar por `/pm-commit`.

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** identidad/hash (T1), anti-colisión (T2), espejo (T3), git sin token persistido + push bajo confirmación (T4), config.json ampliado + dueño de dir (T5), env+CLI con los 5 subcomandos (T6), `.gitignore`/`.env`/comandos y bootstrap-clone + disparadores init/PRD/commit (T7). Todo el spec tiene tarea.
- **Sin placeholders:** cada step de código trae el código completo y comandos con salida esperada.
- **Consistencia de tipos:** `resolverPrdDir`, `espejar`, `ensureRepo/commitDir/pushRepo`, `leerConfig/escribirIdentidadPrd/dueñoDePrdDir`, `cargarEnv/pluginRoot` se usan en `cli.ts` con las firmas declaradas en sus tasks.
