import type { IndexEntry } from "@pm-ai/core";
import { basename, isStyleFile } from "./classify.js";

/**
 * Hoja de estilos (`.css`/`.scss`/`.sass`/`.less`/`.styl`/`.pcss`) → una entrada
 * `estilos` (prompt.md §6). El archivo entero es la unidad: `contenido` = texto crudo
 * (base del content_hash) y `descripcion` = un resumen breve de qué estilos define.
 * Esa descripción es lo que se embebe.
 *
 * Con LLM, `apply`/`describe` redacta el resumen; aquí dejamos un fallback determinista
 * (primer comentario + nº de reglas + presencia de variables).
 */
export function extractStyles(ruta: string, contenido: string): IndexEntry[] {
  if (!isStyleFile(ruta)) return [];
  const archivo = basename(ruta);
  if (!contenido.trim()) return [];

  return [
    {
      tipo: "estilos",
      nombre: archivo,
      descripcion: resumenFallback(archivo, contenido),
      contenido,
      librerias: [],
      dependencias: [],
      archivo,
      ruta,
      detalles: simbolosCss(contenido),
    },
  ];
}

/**
 * Símbolos CSS deterministas (sin LLM): selectores de clase, custom properties y @keyframes.
 * Van en `detalles` (no se embeben) y responden "¿qué clase uso?", "¿color del tema?".
 */
function simbolosCss(contenido: string): Record<string, unknown> | null {
  const tomar = (re: RegExp, n = 200): string[] =>
    [...new Set([...contenido.matchAll(re)].map((m) => m[1]!))].slice(0, n);
  const clases = tomar(/\.([A-Za-z_][\w-]*)/g);
  const variables = tomar(/(--[A-Za-z_][\w-]*)\s*:/g);
  const keyframes = tomar(/@keyframes\s+([A-Za-z_][\w-]*)/g);
  const out: Record<string, unknown> = {};
  if (clases.length) out.clases = clases;
  if (variables.length) out.variables = variables;
  if (keyframes.length) out.keyframes = keyframes;
  return Object.keys(out).length ? out : null;
}

/** Resumen determinista (sin LLM): primer comentario + nº de reglas + variables. */
function resumenFallback(archivo: string, contenido: string): string {
  const comentario = primerComentario(contenido);
  const reglas = (contenido.match(/\{/g) ?? []).length;
  // Variables: SCSS ($x), CSS custom props (--x), Less (@x).
  const tieneVars = /(^|[\s;{])(\$[\w-]+|--[\w-]+|@[\w-]+)\s*:/.test(contenido);
  const partes = [
    comentario,
    reglas ? `${reglas} regla(s)` : "",
    tieneVars ? "define variables" : "",
  ].filter(Boolean);
  return `Hoja de estilos ${archivo}. ${partes.join(". ")}`.trim();
}

function primerComentario(contenido: string): string {
  // Comentario de bloque /* ... */ o de línea // (SCSS/Less).
  const bloque = /\/\*([\s\S]*?)\*\//.exec(contenido);
  if (bloque?.[1]) return bloque[1].replace(/\s+/g, " ").trim().slice(0, 200);
  for (const linea of contenido.split("\n")) {
    const t = linea.trim();
    const m = /^\/\/\s?(.*)$/.exec(t);
    if (m?.[1]) return m[1].trim().slice(0, 200);
    if (t && !t.startsWith("//")) break;
  }
  return "";
}
