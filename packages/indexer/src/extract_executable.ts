import type { IndexEntry } from "@pm-ai/core";
import { basename, isExecutable } from "./classify.js";

/**
 * Script ejecutable (`.sh`, `.cmd`, `.bat` o archivo con shebang de shell) →
 * una entrada `ejecutable` (prompt.md §6). El archivo entero es la unidad:
 * `contenido` = texto crudo (base del content_hash) y `descripcion` = qué ejecuta.
 *
 * Con LLM, `apply`/`describe` reemplaza la `descripcion` por un resumen de qué hace
 * el script; aquí dejamos un fallback determinista (shebang + primer comentario).
 */
export function extractExecutable(ruta: string, contenido: string): IndexEntry[] {
  if (!isExecutable(ruta, contenido)) return [];
  const archivo = basename(ruta);
  if (!contenido.trim()) return [];

  return [
    {
      tipo: "ejecutable",
      nombre: archivo,
      descripcion: descripcionFallback(archivo, contenido),
      contenido,
      librerias: [],
      dependencias: [],
      archivo,
      ruta,
    },
  ];
}

/** Resumen determinista (sin LLM): shebang + primeras líneas de comentario. */
function descripcionFallback(archivo: string, contenido: string): string {
  const lineas = contenido.split("\n");
  const shebang = lineas[0]?.startsWith("#!") ? lineas[0]!.trim() : null;
  const comentarios = lineas
    .slice(shebang ? 1 : 0)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("#") || l.startsWith("::") || l.startsWith("REM "))
    .map((l) => l.replace(/^#+\s?|^::\s?|^REM\s+/i, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ");
  const intérprete = shebang ? ` (${shebang})` : "";
  return `Script ejecutable ${archivo}${intérprete}. ${comentarios}`.trim();
}
