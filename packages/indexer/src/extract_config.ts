import type { IndexEntry } from "@pm-ai/core";
import { basename, configTipo } from "./classify.js";

/**
 * Archivo de configuración → una entrada `json` | `yaml` | `config` (prompt.md §6).
 * El archivo entero es la unidad: `contenido` = texto crudo (base del content_hash)
 * y `descripcion` = un mini-manifiesto. Esa descripción es lo que se embebe.
 *
 * Cuando hay LLM, `apply`/`describe` reemplaza la `descripcion` por un manifiesto
 * propiamente redactado; aquí solo dejamos un fallback determinista (útil sin API key).
 */
export function extractConfig(ruta: string, contenido: string): IndexEntry[] {
  const tipo = configTipo(ruta);
  if (!tipo) return [];
  const archivo = basename(ruta);
  if (!contenido.trim()) return [];

  const pares = contenido.length <= 16_000 ? extraerPares(tipo, contenido) : null;
  // Vocabulario y valores notables (claves anidadas, nombres, URLs, ids) para que la búsqueda
  // alcance "qué hay dentro" del config sin depender de que el manifiesto LLM los liste.
  const resumen = contenido.length <= 64_000 ? resumenConfig(tipo, contenido) : [];

  const detalles: Record<string, unknown> = {};
  if (pares && Object.keys(pares).length) detalles.pares = pares;
  if (resumen.length) detalles.resumen = resumen;

  return [
    {
      tipo,
      nombre: archivo,
      descripcion: manifiestoFallback(archivo, tipo, contenido),
      contenido,
      librerias: [],
      dependencias: [],
      archivo,
      ruta,
      detalles: Object.keys(detalles).length ? detalles : null,
    },
  ];
}

/**
 * Pares clave→valor de primer nivel (y un nivel de objetos de valores primitivos, p. ej.
 * `dependencies` de package.json) para configs pequeños. Resuelve consultas de valores
 * concretos (versiones, URLs) sin abrir el archivo. Va en `detalles`, NO en `descripcion`.
 */
function extraerPares(tipo: string, contenido: string): Record<string, unknown> | null {
  if (tipo === "json") {
    try {
      const obj = JSON.parse(contenido) as unknown;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      const out: Record<string, unknown> = {};
      let n = 0;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (n++ >= 60) break;
        if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
          out[k] = typeof v === "string" ? v.slice(0, 200) : v;
        } else if (v && typeof v === "object" && !Array.isArray(v) && esMapaPrimitivo(v)) {
          out[k] = v; // p. ej. dependencies: { next: "^16.2.4", ... }
        }
      }
      return out;
    } catch {
      return null;
    }
  }
  if (tipo === "yaml") {
    const out: Record<string, unknown> = {};
    for (const l of contenido.split("\n")) {
      const m = /^([A-Za-z0-9_.-]+):\s*(\S.*)$/.exec(l); // clave de primer nivel con valor escalar
      if (m) out[m[1]!] = m[2]!.trim().slice(0, 200);
      if (Object.keys(out).length >= 60) break;
    }
    return out;
  }
  return null;
}

/**
 * Tokens notables del config para el texto embebido: claves estructurales (a cualquier nivel,
 * p. ej. nombres de tablas o de aseguradoras) y valores escalares significativos (URLs, bases de
 * datos, ids, nombres). Recorre JSON; para YAML/otros usa pares `clave: valor` por línea.
 * Deduplica y acota para no inflar el vector.
 */
function resumenConfig(tipo: string, contenido: string): string[] {
  const out: string[] = [];
  if (tipo === "json") {
    try {
      recolectar(JSON.parse(contenido) as unknown, 0, out);
    } catch {
      return [];
    }
  } else {
    for (const l of contenido.split("\n")) {
      const m = /^\s*([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/.exec(l);
      if (!m) continue;
      out.push(m[1]!);
      const v = m[2]!.trim().replace(/^["']|["']$/g, "");
      if (esTokenValor(v)) out.push(v);
      if (out.length > 240) break;
    }
  }
  return uniqCap(out, 90);
}

function recolectar(v: unknown, depth: number, out: string[]): void {
  if (depth > 5 || out.length > 320) return;
  if (typeof v === "string") {
    if (esTokenValor(v)) out.push(v.length > 120 ? v.slice(0, 120) : v);
  } else if (typeof v === "number" || typeof v === "boolean") {
    out.push(String(v));
  } else if (Array.isArray(v)) {
    for (const x of v.slice(0, 80)) recolectar(x, depth + 1, out);
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (out.length > 320) break;
      out.push(k); // clave estructural: host, tables, endpoints, services, api…
      recolectar(val, depth + 1, out);
    }
  }
}

/** Acepta valores con contenido semántico; descarta vacíos y ruido demasiado largo. */
function esTokenValor(v: string): boolean {
  return v.length >= 2 && v.length <= 120;
}

function uniqCap(xs: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function esMapaPrimitivo(v: object): boolean {
  const vals = Object.values(v);
  return vals.length > 0 && vals.every((x) => ["string", "number", "boolean"].includes(typeof x));
}

/** Resumen determinista del archivo de config (sin LLM): claves/secciones de primer nivel. */
function manifiestoFallback(archivo: string, tipo: string, contenido: string): string {
  const claves = topLevelKeys(tipo, contenido);
  const cabeza = claves.length
    ? `Claves de primer nivel: ${claves.slice(0, 20).join(", ")}.`
    : primerasLineas(contenido);
  return `Archivo de configuración ${archivo} (${tipo}). ${cabeza}`.trim();
}

function topLevelKeys(tipo: string, contenido: string): string[] {
  if (tipo === "json") {
    try {
      const obj = JSON.parse(contenido) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        return Object.keys(obj as Record<string, unknown>);
      }
    } catch {
      /* JSON inválido: cae al resumen por líneas */
    }
    return [];
  }
  if (tipo === "yaml") {
    // Claves de primer nivel = líneas `clave:` sin indentación, ignorando comentarios.
    return contenido
      .split("\n")
      .map((l) => /^([A-Za-z0-9_.-]+):/.exec(l)?.[1])
      .filter((k): k is string => Boolean(k));
  }
  return [];
}

function primerasLineas(contenido: string): string {
  const lineas = contenido
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith(";"))
    .slice(0, 5);
  return lineas.join(" · ").slice(0, 300);
}
