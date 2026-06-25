// Tipos compartidos del índice unificado PM·AI. Espejo de schema.sql (prompt.md §6).

/**
 * Discriminador de fila. HTML se clasifica en `reporte` (entregable generado para
 * distribuir) o `pagina` (artefacto de UI: 404, landing, dashboard…). Cualquier
 * markdown se parte en `markdown_chunk`. `query` = archivo SQL. `estilos` = hoja de estilos.
 *
 * Fuente ÚNICA de la lista de tipos: el enum SQL (`schema.sql`), los filtros del MCP y
 * `PmTipo` derivan de aquí — así no vuelven a divergir.
 */
export const PM_TIPOS = [
  "funcion",
  "endpoint",
  "reporte",
  "pagina",
  "markdown_chunk",
  "json",
  "yaml",
  "config",
  "ejecutable",
  "query",
  "estilos",
] as const;

export type PmTipo = (typeof PM_TIPOS)[number];

/** Tipos que son código (símbolos o scripts ejecutables). */
export const PM_TIPOS_CODIGO: ReadonlySet<PmTipo> = new Set([
  "funcion",
  "endpoint",
  "ejecutable",
]);

/**
 * Tipos cuya `descripcion` se genera con el LLM (no es contenido literal):
 * código + archivos de configuración (mini manifiesto). Para `markdown_chunk` y
 * `reporte` la `descripcion` ya ES el texto semántico y se embebe tal cual.
 */
export const PM_TIPOS_DESCRITOS: ReadonlySet<PmTipo> = new Set<PmTipo>([
  ...PM_TIPOS_CODIGO,
  "json",
  "yaml",
  "config",
  "query",
  "estilos",
]);

/** Una fila persistida en `pm_index`. Cada fila es una versión. */
export interface PmRow {
  id: number;
  project_id: string;
  entity_id: string;
  is_current: boolean;
  tipo: PmTipo;
  commit_sha: string;
  content_hash: string;
  nombre: string;
  descripcion: string;
  librerias: string[];
  dependencias: string[];
  archivo: string;
  ruta: string;
  created_at: string; // ISO 8601
  deleted: boolean;
  embedding: number[] | null;
  /** Detalle estructural determinista (firma, contenedor, constantes…). NO se embebe. */
  detalles?: Record<string, unknown> | null;
  /** Ratio de líneas del archivo cubiertas por símbolos indexados (0..1). Solo código. */
  cobertura?: number | null;
  /** Resumen del delta vs. la versión anterior (changelog por entidad). Null en altas. */
  cambio?: string | null;
  /** content_hash del predecesor; encadena la traza (invariante hash_anterior[N]=content_hash[N+1]). */
  hash_anterior?: string | null;
  /** Magnitud del cambio: cosmetico|firma|logica|mixto|eliminado. Null en altas. */
  magnitud_cambio?: string | null;
}

/**
 * Entrada lista para indexar (antes de calcular entity_id, embedding y de versionar).
 * La produce el extractor de código o el chunker de documentación.
 */
export interface IndexEntry {
  tipo: PmTipo;
  nombre: string;
  /** Código: descripción ≤2 oraciones. markdown_chunk: el contenido del chunk. */
  descripcion: string;
  /** Texto crudo del símbolo/chunk usado para calcular content_hash. */
  contenido: string;
  librerias: string[];
  dependencias: string[];
  archivo: string;
  ruta: string;
  /**
   * Detalle estructural determinista del símbolo (firma, contenedor/clase, constantes de
   * módulo…). Va en campo APARTE, NO en `descripcion`: `descripcion` es lo que se vectoriza
   * y mezclarle identificadores diluiría el embedding. Solo lo llena el extractor de código.
   */
  detalles?: Record<string, unknown> | null;
  /** Ratio de líneas del archivo cubiertas por los símbolos indexados (0..1). Solo código. */
  cobertura?: number | null;
}

/** Fila del catálogo de proyectos (`pm_projects`). */
export interface ProjectRow {
  project_id: string;
  nombre: string;
  unidad: string | null;
  repo_url: string | null;
  descripcion: string | null;
  estado: string;
  created_at: string;
  updated_at: string;
}

/** Resultado de búsqueda devuelto por el RPC pm_buscar. */
export interface SearchHit {
  id: number;
  entity_id: string;
  tipo: PmTipo;
  nombre: string;
  descripcion: string;
  archivo: string;
  ruta: string;
  librerias: string[];
  dependencias: string[];
  commit_sha: string;
  created_at: string;
  distancia: number;
}
