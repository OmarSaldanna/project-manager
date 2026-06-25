import { PM_TIPOS_DESCRITOS, type Embedder, type IndexEntry, type PmRepo } from "@pm-ai/core";
import { reconcileFile } from "./reconcile.js";
import { languageForFile, extractCode } from "./extract_code.js";
import { chunkMarkdown } from "./chunk_markdown.js";
import { extractHtml, resolveHtmlTipo, type HtmlTipo } from "./extract_html.js";
import { extractConfig } from "./extract_config.js";
import { extractExecutable } from "./extract_executable.js";
import { extractSql } from "./extract_sql.js";
import { extractStyles } from "./extract_styles.js";
import { configTipo, isExecutable, isQueryFile, isStyleFile } from "./classify.js";
import type { Describer } from "./describe.js";
import { buildEmbedText } from "./embed_text.js";
import { clasificarMagnitud, plantillaCambio, type VersionParaComparar } from "./magnitud.js";
import { maskSecrets } from "./secrets.js";

/** Tope del cuerpo que se persiste (base del diff). Acota almacenamiento sin perder la señal. */
const MAX_CUERPO = 32_000;

export interface ApplyDeps {
  repo: PmRepo;
  embedder: Embedder;
  describer: Describer;
  /** Tipo forzado por el dev para HTMLs ambiguos: `{ "ruta/x.html": "pagina" }`. */
  htmlOverrides?: Record<string, HtmlTipo>;
}

export interface FileChange {
  ruta: string;
  /** Contenido nuevo del archivo; null si fue eliminado en este commit. */
  contenido: string | null;
}

export interface ApplyStats {
  ruta: string;
  created: number;
  versioned: number;
  unchanged: number;
  tombstoned: number;
  /** Archivo NO indexado por requerir decisión humana (HTML ambiguo: ¿página o reporte?). */
  pendiente?: { razon: string };
}

const HTML_RE = /\.html?$/i;

/** Convierte un archivo (según su tipo) en entradas indexables. */
export async function extractFile(
  ruta: string,
  contenido: string,
  htmlOverrides?: Record<string, HtmlTipo>,
): Promise<IndexEntry[]> {
  if (languageForFile(ruta)) return extractCode(ruta, contenido);
  if (/\.md$/i.test(ruta)) return chunkMarkdown(ruta, contenido);
  if (HTML_RE.test(ruta)) {
    const tipo = resolveHtmlTipo(ruta, contenido, htmlOverrides);
    return tipo === "ambiguo" ? [] : extractHtml(ruta, contenido, tipo);
  }
  if (isExecutable(ruta, contenido)) return extractExecutable(ruta, contenido);
  if (configTipo(ruta)) return extractConfig(ruta, contenido);
  if (isQueryFile(ruta)) return extractSql(ruta, contenido);
  if (isStyleFile(ruta)) return extractStyles(ruta, contenido);
  return [];
}

/**
 * Aplica los cambios de UN archivo a la DB (prompt.md §8): extrae → reconcilia →
 * describe + embebe SOLO lo que cambió → versiona/tumba atómicamente.
 */
export async function applyFile(
  projectId: string,
  commitSha: string,
  createdAt: string,
  change: FileChange,
  deps: ApplyDeps,
): Promise<ApplyStats> {
  const stats: ApplyStats = { ruta: change.ruta, created: 0, versioned: 0, unchanged: 0, tombstoned: 0 };

  // HTML ambiguo (¿página o reporte?): no adivinar y NO reconciliar (evita tumbar lo ya
  // indexado). Se reporta como pendiente para que el dev lo resuelva vía overrides.
  if (
    change.contenido !== null &&
    HTML_RE.test(change.ruta) &&
    resolveHtmlTipo(change.ruta, change.contenido, deps.htmlOverrides) === "ambiguo"
  ) {
    stats.pendiente = { razon: "HTML ambiguo: ¿página o reporte? Defínelo en los overrides." };
    return stats;
  }

  const existing = await deps.repo.currentEntitiesForFile(projectId, change.ruta);
  const entries =
    change.contenido === null ? [] : await extractFile(change.ruta, change.contenido, deps.htmlOverrides);
  const plan = reconcileFile(projectId, entries, existing);
  stats.unchanged = plan.unchanged.length;

  // Estado vigente por entidad: insumo para trazar el cambio (cuerpo/firma/deps del predecesor).
  const prevByEntity = new Map(existing.map((e) => [e.entityId, e]));

  // Describir + embeber solo lo que cambió.
  for (const p of plan.toUpsert) {
    // Código y configuración: el LLM genera la descripción/manifiesto que se embebe.
    // markdown_chunk y reporte: la `descripcion` ya es el texto semántico, se embebe tal cual.
    const descripcion = PM_TIPOS_DESCRITOS.has(p.tipo) ? await deps.describer.describe(p) : p.descripcion;
    // Mini-ficha (nombre + ruta + descripcion + firma/constantes/valores/config): es lo que se
    // embebe Y lo que se persiste como `texto_busqueda` para el canal léxico de la búsqueda híbrida.
    const textoBusqueda = buildEmbedText(p, descripcion);
    const [embedding] = await deps.embedder.embed([textoBusqueda]);

    // Trazabilidad del cambio: si hay predecesor (es una nueva versión), clasificar la magnitud y
    // redactar `cambio`. En altas (sin predecesor) los tres quedan null. Cosméticos y el caso sin
    // cuerpo previo usan la plantilla (cero LLM); el resto lo redacta el describer sobre el diff.
    const prev = prevByEntity.get(p.entityId);
    let cambio: string | null = null;
    let hashAnterior: string | null = null;
    let magnitudCambio: string | null = null;
    if (prev) {
      hashAnterior = prev.contentHash;
      const firmaNueva = typeof p.detalles?.firma === "string" ? (p.detalles.firma as string) : null;
      const cuerpoPrev = prev.cuerpo ?? null;
      const magnitud = clasificarMagnitud(
        {
          firma: prev.firma ?? null,
          librerias: prev.librerias ?? [],
          dependencias: prev.dependencias ?? [],
          cuerpo: cuerpoPrev,
        },
        { firma: firmaNueva, librerias: p.librerias, dependencias: p.dependencias, cuerpo: p.contenido },
      );
      magnitudCambio = magnitud;
      cambio =
        magnitud === "cosmetico" || cuerpoPrev === null
          ? plantillaCambio(magnitud)
          : await deps.describer.describeChange(cuerpoPrev, p, magnitud);
    }

    const result = await deps.repo.upsertVersion({
      projectId,
      entityId: p.entityId,
      tipo: p.tipo,
      commitSha,
      contentHash: p.contentHash,
      nombre: p.nombre,
      descripcion,
      librerias: p.librerias,
      dependencias: p.dependencias,
      archivo: p.archivo,
      ruta: p.ruta,
      createdAt,
      embedding: embedding ?? null,
      detalles: p.detalles ?? null,
      cobertura: p.cobertura ?? null,
      textoBusqueda,
      cambio,
      hashAnterior,
      magnitudCambio,
      // Cuerpo enmascarado y acotado: base del diff de la PRÓXIMA versión. maskSecrets evita
      // persistir credenciales hardcodeadas en cuerpos de código.
      cuerpo: maskSecrets(p.contenido).slice(0, MAX_CUERPO),
    });
    if (result === "created") stats.created++;
    else if (result === "versioned") stats.versioned++;
  }

  for (const entityId of plan.toTombstone) {
    if (await deps.repo.tombstone(entityId, commitSha, createdAt)) stats.tombstoned++;
  }

  return stats;
}

/** Aplica un conjunto de archivos (un commit completo o un mapeo inicial). */
export async function applyCommit(
  projectId: string,
  commitSha: string,
  createdAt: string,
  changes: FileChange[],
  deps: ApplyDeps,
): Promise<ApplyStats[]> {
  const out: ApplyStats[] = [];
  for (const change of changes) {
    out.push(await applyFile(projectId, commitSha, createdAt, change, deps));
  }
  return out;
}
