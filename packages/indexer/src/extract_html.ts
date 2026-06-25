import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { IndexEntry, PmTipo } from "@pm-ai/core";

/** Los dos tipos que puede tomar un HTML. */
export type HtmlTipo = "reporte" | "pagina";
/** Resultado de clasificar un HTML: un tipo concreto, o "ambiguo" (decide el dev). */
export type HtmlClasificacion = HtmlTipo | "ambiguo";

/**
 * Distingue entre `reporte` y `pagina` para un HTML (mismos archivos, distinta intención):
 *  - `pagina`: artefacto de UI navegable (404, landing, dashboard/tablero, login…).
 *  - `reporte`: HTML entregable, generado para distribuir (export, informe con fecha…).
 *
 * Es CONSERVADORA: solo decide cuando exactamente UNA de las dos señales aparece.
 * Si ambas o ninguna aplican → "ambiguo": el indexador NO adivina, lo reporta como
 * pendiente y el dev lo resuelve vía overrides (ver `resolveHtmlTipo`).
 */
export function classifyHtml(ruta: string, html: string): HtmlClasificacion {
  const esPagina = pageSignal(ruta, html);
  const esReporte = reportSignal(ruta, html);
  if (esPagina && !esReporte) return "pagina";
  if (esReporte && !esPagina) return "reporte";
  return "ambiguo";
}

/** Override del dev > heurística. Devuelve el tipo a usar, o "ambiguo" si nadie decide. */
export function resolveHtmlTipo(
  ruta: string,
  html: string,
  overrides?: Record<string, HtmlTipo>,
): HtmlClasificacion {
  const forzado = overrides?.[ruta];
  if (forzado === "pagina" || forzado === "reporte") return forzado;
  return classifyHtml(ruta, html);
}

/**
 * Carga los overrides del dev para HTMLs ambiguos desde `pm-ai.overrides.json` en la raíz del
 * repo: `{ "html": { "ruta/relativa.html": "pagina" | "reporte" } }`. Sin archivo → {} (todo por
 * heurística). Lo usan TANTO el CLI como la tool MCP `pm_indexar`, para que la resolución de HTML
 * ambiguo sea consistente entre `/pm-init` y `/pm-commit`.
 */
export function loadHtmlOverrides(repoRoot: string): Record<string, HtmlTipo> {
  try {
    const raw = readFileSync(join(repoRoot, "pm-ai.overrides.json"), "utf8");
    const parsed = JSON.parse(raw) as { html?: Record<string, string> };
    const out: Record<string, HtmlTipo> = {};
    for (const [ruta, tipo] of Object.entries(parsed.html ?? {})) {
      if (tipo === "pagina" || tipo === "reporte") out[ruta] = tipo;
    }
    return out;
  } catch {
    return {}; // sin archivo de overrides → todo se decide por heurística
  }
}

const PAGE_FILENAMES =
  /(^|\/)(404|500|403|401|index|home|landing|dashboard|tablero|login|signin|signup|register|registro|error|about|acerca|pricing|precios|contact|contacto|terms|terminos|privacy|privacidad)\.html?$/i;
const PAGE_DIRS = /(^|\/)(pages?|public|static|views?|templates?|plantillas?|www|site|web|frontend|ui|app)\//i;
const PAGE_CONTENT = /<(nav|header|form|aside)\b|name=["']viewport["']/i;

const REPORT_FILENAMES = /(^|\/|[-_])(report|reporte|informe|export|salida)s?([-_.]|\.html?$)/i;
const REPORT_DATE = /\d{4}[-_]?\d{2}[-_]?\d{2}/; // fecha en el nombre: reporte_2026-06-22.html
const REPORT_DIRS = /(^|\/)(reports?|reportes?|informes?|exports?|salidas?|out|dist)\//i;
const REPORT_CONTENT = /<meta[^>]+name=["']generator["']|generad[oa]\s+el|generated\s+(on|at|by)/i;

function pageSignal(ruta: string, html: string): boolean {
  return PAGE_FILENAMES.test(ruta) || PAGE_DIRS.test(ruta) || PAGE_CONTENT.test(html);
}

function reportSignal(ruta: string, html: string): boolean {
  const archivo = ruta.split("/").pop() ?? ruta;
  return (
    REPORT_FILENAMES.test(ruta) ||
    REPORT_DATE.test(archivo) ||
    REPORT_DIRS.test(ruta) ||
    REPORT_CONTENT.test(html)
  );
}

/**
 * Un archivo HTML → una entidad del `tipo` indicado (prompt.md §6). Se guarda el HTML
 * crudo como `contenido` (base del content_hash) y el texto visible como `descripcion`
 * (lo que se embebe). El `tipo` lo decide el llamador (override o `classifyHtml`).
 */
export function extractHtml(ruta: string, html: string, tipo: HtmlTipo): IndexEntry[] {
  const archivo = ruta.split("/").pop() ?? ruta;
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  const texto = stripHtml(html);
  if (!texto) return [];
  return [
    {
      tipo: tipo satisfies PmTipo,
      nombre: titulo || archivo,
      descripcion: texto.slice(0, 4000),
      contenido: html,
      librerias: [],
      dependencias: [],
      archivo,
      ruta,
    },
  ];
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
