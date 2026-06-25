import type { PmTipo } from "@pm-ai/core";
import { languageForFile } from "./extract_code.js";

/**
 * Clasificación de archivos para el indexador (prompt.md §6, §8). Fuente ÚNICA de
 * verdad de "qué archivos se leen y a qué tipo van", para que el filtro de
 * descubrimiento (cli) y el enrutador de extracción (apply) nunca diverjan.
 *
 * Esencia del proyecto: NUNCA se leen archivos ignorados por git (el cli usa
 * `git ls-files --exclude-standard`). Aquí solo se decide, de los archivos
 * candidatos, cuáles son indexables y cómo se procesan.
 */

function ext(ruta: string): string {
  const base = basename(ruta).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

export function basename(ruta: string): string {
  const parts = ruta.split("/");
  return parts[parts.length - 1] ?? ruta;
}

// --- Configuración (tipos json / yaml / config) -----------------------------

/** Extensiones de configuración → tipo. `.yml` se trata como `.yaml`. */
const CONFIG_EXT_TIPO: Record<string, PmTipo> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  config: "config",
  toml: "config",
  ini: "config",
};

/** Archivos de configuración reconocidos por nombre completo (dotfiles, etc.). */
const CONFIG_NAMES: Record<string, PmTipo> = {
  ".gitignore": "config",
  ".npmrc": "config",
  ".editorconfig": "config",
  ".env.example": "config",
};

/**
 * Lockfiles y archivos ruidosos que NO indexamos aunque estén versionados:
 * son grandes, autogenerados y sin valor semántico (gastarían embeddings).
 */
const EXCLUDE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env", // secretos; además suele estar en .gitignore
]);

/** ¿Es un archivo de configuración indexable? Devuelve su tipo, o null. */
export function configTipo(ruta: string): PmTipo | null {
  const name = basename(ruta).toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return null;
  if (CONFIG_NAMES[name]) return CONFIG_NAMES[name]!;
  return CONFIG_EXT_TIPO[ext(ruta)] ?? null;
}

// --- Ejecutables (tipo ejecutable) ------------------------------------------

const EXEC_EXT = new Set(["sh", "bash", "cmd", "bat"]);

/** Shebang de un intérprete de shell (`#!/bin/bash`, `#!/usr/bin/env sh`, …). */
export const SHEBANG_SHELL_RE = /^#!.*\b(bash|sh|zsh|ksh|dash)\b/;

/**
 * ¿Es un ejecutable/script indexable? `.sh`/`.cmd`/`.bat` por extensión, o
 * cualquier archivo sin extensión reconocible cuyo contenido empiece con un
 * shebang de shell. `contenido` es opcional: sin él solo se decide por nombre.
 */
export function isExecutable(ruta: string, contenido?: string): boolean {
  const name = basename(ruta).toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return false;
  if (EXEC_EXT.has(ext(ruta))) return true;
  // Sin extensión soportada: solo cuenta si tiene shebang de shell.
  if (contenido !== undefined && !languageForFile(ruta) && configTipo(ruta) === null) {
    return SHEBANG_SHELL_RE.test(contenido.slice(0, 256));
  }
  return false;
}

// --- Queries SQL (tipo query) ------------------------------------------------

const SQL_EXT = new Set(["sql", "psql", "pgsql", "ddl", "dml"]);

/** ¿Es un archivo SQL/queries indexable? */
export function isQueryFile(ruta: string): boolean {
  const name = basename(ruta).toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return false;
  return SQL_EXT.has(ext(ruta));
}

// --- Hojas de estilo (tipo estilos) ------------------------------------------

const STYLE_EXT = new Set(["css", "scss", "sass", "less", "styl", "pcss"]);

/** ¿Es una hoja de estilos indexable? */
export function isStyleFile(ruta: string): boolean {
  const name = basename(ruta).toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return false;
  return STYLE_EXT.has(ext(ruta));
}

// --- Indexabilidad por nombre (pre-filtro del walk/ls-files) -----------------

const DOC_EXT = new Set(["md"]);
const HTML_EXT = new Set(["html", "htm"]);

/**
 * Pre-filtro barato por nombre (sin leer contenido): ¿este archivo es de un tipo
 * que sabemos indexar? Para ejecutables SIN extensión devuelve false aquí: esos
 * los detecta el cli leyendo el shebang (`needsShebangSniff`).
 */
export function isIndexableByName(ruta: string): boolean {
  const name = basename(ruta).toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return false;
  if (languageForFile(ruta)) return true;
  const e = ext(ruta);
  if (DOC_EXT.has(e) || HTML_EXT.has(e)) return true;
  if (configTipo(ruta) !== null) return true;
  if (isQueryFile(ruta)) return true;
  if (isStyleFile(ruta)) return true;
  if (isExecutable(ruta)) return true; // .sh/.cmd/.bat por extensión
  return false;
}

/**
 * ¿Es un candidato sin extensión que podría ser un ejecutable por shebang?
 * El cli usa esto para decidir si vale la pena leer el head del archivo.
 */
export function needsShebangSniff(ruta: string): boolean {
  const name = basename(ruta).toLowerCase();
  if (EXCLUDE_NAMES.has(name)) return false;
  if (isIndexableByName(ruta)) return false;
  return ext(ruta) === ""; // sin extensión
}
