import type { IndexEntry } from "@pm-ai/core";
import { basename, isQueryFile } from "./classify.js";

/**
 * Archivo SQL (`.sql`, `.psql`, `.pgsql`, `.ddl`, `.dml`) → una entrada `query`
 * (prompt.md §6). El archivo entero es la unidad: `contenido` = texto crudo (base del
 * content_hash) y `descripcion` = un resumen muy breve (≤1 párrafo) de qué hacen las
 * queries. Esa descripción es lo que se embebe.
 *
 * Con LLM, `apply`/`describe` redacta el resumen; aquí dejamos un fallback determinista
 * (tipos de sentencia presentes + primer comentario).
 */
export function extractSql(ruta: string, contenido: string): IndexEntry[] {
  if (!isQueryFile(ruta)) return [];
  const archivo = basename(ruta);
  if (!contenido.trim()) return [];

  return [
    {
      tipo: "query",
      nombre: archivo,
      descripcion: resumenFallback(archivo, contenido),
      contenido,
      librerias: [],
      dependencias: [],
      archivo,
      ruta,
    },
  ];
}

const SENTENCIAS = [
  "select",
  "insert",
  "update",
  "delete",
  "create",
  "alter",
  "drop",
  "with",
  "merge",
  "grant",
] as const;

/** Resumen determinista (sin LLM): primer comentario + sentencias SQL detectadas. */
function resumenFallback(archivo: string, contenido: string): string {
  const comentario = primerComentario(contenido);
  const presentes = SENTENCIAS.filter((s) =>
    new RegExp(`(^|[\\s;(])${s}\\b`, "i").test(contenido),
  ).map((s) => s.toUpperCase());
  const sent = presentes.length ? `Sentencias: ${presentes.join(", ")}.` : "";
  const cab = comentario ? `${comentario} ` : "";
  return `Archivo SQL ${archivo}. ${cab}${sent}`.trim();
}

function primerComentario(contenido: string): string {
  for (const linea of contenido.split("\n")) {
    const t = linea.trim();
    const m = /^--\s?(.*)$/.exec(t);
    if (m && m[1]) return m[1].trim();
    if (t && !t.startsWith("--")) break; // primera línea de código sin comentario previo
  }
  return "";
}
