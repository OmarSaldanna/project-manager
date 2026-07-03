import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PmConfig } from "./env.js";
import type { PmRow, PmTipo, ProjectRow, SearchHit } from "./types.js";

export type ApplyResult = "unchanged" | "created" | "versioned";

/**
 * Columnas de `pm_index` que se devuelven al cliente, EXCLUYENDO `embedding`.
 * El vector de 1536 dims es ruido puro para el agente (~5k tokens/entidad) y nunca
 * debe viajar en las respuestas de las tools — solo se usa server-side para la búsqueda.
 */
export const ROW_COLS = [
  "id",
  "project_id",
  "entity_id",
  "is_current",
  "tipo",
  "commit_sha",
  "content_hash",
  "nombre",
  "descripcion",
  "librerias",
  "dependencias",
  "archivo",
  "ruta",
  "created_at",
  "deleted",
  "cobertura", // ligera (un float); guía al agente sobre qué tan representada está la entidad
  "cambio", // changelog por entidad: qué cambió respecto a la versión anterior (null en altas)
  "hash_anterior", // content_hash del predecesor; encadena la traza
  "magnitud_cambio", // cosmetico|firma|logica|mixto|eliminado
  // `cuerpo` se EXCLUYE a propósito: es peso server-side (base del diff), ruido en tokens igual
  // que el embedding. Nunca viaja en las respuestas de las tools.
].join(", ");

/** Igual que ROW_COLS pero añade `detalles` (jsonb), que se devuelve solo bajo demanda. */
const ROW_COLS_CON_DETALLES = `${ROW_COLS}, detalles`;

/** Una versión a aplicar, ya con entity_id, content_hash y embedding calculados. */
export interface VersionInput {
  projectId: string;
  entityId: string;
  tipo: PmTipo;
  commitSha: string;
  contentHash: string;
  nombre: string;
  descripcion: string;
  librerias: string[];
  dependencias: string[];
  archivo: string;
  ruta: string;
  createdAt: string; // ISO
  embedding: number[] | null;
  detalles: Record<string, unknown> | null;
  cobertura: number | null;
  /** Texto compuesto que se embebe; se persiste para el canal léxico de la búsqueda híbrida. */
  textoBusqueda: string | null;
  /** Resumen del delta vs. la versión anterior (null en altas; no se embebe). */
  cambio: string | null;
  /** content_hash del predecesor (misma entity_id); ancla el diff y encadena la traza. */
  hashAnterior: string | null;
  /** cosmetico|firma|logica|mixto|eliminado (null en altas). */
  magnitudCambio: string | null;
  /** Cuerpo enmascarado y acotado, base para diffear contra la siguiente versión. */
  cuerpo: string | null;
}

/** Acceso a `pm_index`. Toda mutación pasa por los RPCs atómicos (ver schema.sql). */
export class PmRepo {
  private readonly sb: SupabaseClient;

  constructor(cfg: Pick<PmConfig, "supabaseUrl" | "supabaseServiceKey">) {
    this.sb = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }

  /** Registra (o actualiza) un proyecto en el catálogo. Idempotente por project_id. */
  async registrarProyecto(p: {
    projectId: string;
    nombre: string;
    unidad?: string;
    repoUrl?: string;
    descripcion?: string;
    estado?: string;
    prdId?: string;
  }): Promise<void> {
    const { error } = await this.sb.from("pm_projects").upsert(
      {
        project_id: p.projectId,
        nombre: p.nombre,
        unidad: p.unidad ?? null,
        repo_url: p.repoUrl ?? null,
        descripcion: p.descripcion ?? null,
        ...(p.estado ? { estado: p.estado } : {}),
        ...(p.prdId ? { prd_id: p.prdId } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
    if (error) throw new Error(`registrarProyecto: ${error.message}`);
  }

  /** Catálogo de proyectos (para navegación y consultas cross-project, CU-5/CU-7). */
  async listarProyectos(unidad?: string): Promise<ProjectRow[]> {
    let q = this.sb.from("pm_projects").select("*").order("unidad").order("nombre");
    if (unidad) q = q.eq("unidad", unidad);
    const { data, error } = await q;
    if (error) throw new Error(`listarProyectos: ${error.message}`);
    return (data ?? []) as ProjectRow[];
  }

  /**
   * Entidades vigentes (no borradas) de un archivo — base de reconciliación. Además del hash y
   * el tipo (que decide el destino), trae el `cuerpo`, la `firma` (de `detalles`) y los sets
   * `librerias`/`dependencias` del predecesor: insumos para diffear y clasificar la magnitud del
   * cambio en `applyFile` sin una consulta extra. `reconcileFile` ignora estos campos (sigue puro).
   */
  async currentEntitiesForFile(
    projectId: string,
    ruta: string,
  ): Promise<
    {
      entityId: string;
      contentHash: string;
      tipo: PmTipo;
      cuerpo: string | null;
      firma: string | null;
      librerias: string[];
      dependencias: string[];
    }[]
  > {
    const { data, error } = await this.sb
      .from("pm_index")
      .select("entity_id, content_hash, tipo, cuerpo, detalles, librerias, dependencias")
      .eq("project_id", projectId)
      .eq("ruta", ruta)
      .eq("is_current", true)
      .eq("deleted", false);
    if (error) throw new Error(`currentEntitiesForFile: ${error.message}`);
    return (data ?? []).map((r) => {
      const detalles = (r.detalles ?? {}) as Record<string, unknown>;
      return {
        entityId: r.entity_id as string,
        contentHash: r.content_hash as string,
        tipo: r.tipo as PmTipo,
        cuerpo: (r.cuerpo as string | null) ?? null,
        firma: typeof detalles.firma === "string" ? detalles.firma : null,
        librerias: (r.librerias as string[] | null) ?? [],
        dependencias: (r.dependencias as string[] | null) ?? [],
      };
    });
  }

  /** Versiona un símbolo/chunk de forma atómica (gate de content_hash). */
  async upsertVersion(v: VersionInput): Promise<ApplyResult> {
    const { data, error } = await this.sb.rpc("pm_upsert_version", {
      p_project_id: v.projectId,
      p_entity_id: v.entityId,
      p_tipo: v.tipo,
      p_commit_sha: v.commitSha,
      p_content_hash: v.contentHash,
      p_nombre: v.nombre,
      p_descripcion: v.descripcion,
      p_librerias: v.librerias,
      p_dependencias: v.dependencias,
      p_archivo: v.archivo,
      p_ruta: v.ruta,
      p_created_at: v.createdAt,
      p_embedding: v.embedding ? JSON.stringify(v.embedding) : "",
      p_detalles: v.detalles ?? null,
      p_cobertura: v.cobertura ?? null,
      p_texto_busqueda: v.textoBusqueda ?? null,
      p_cambio: v.cambio ?? null,
      p_hash_anterior: v.hashAnterior ?? null,
      p_magnitud_cambio: v.magnitudCambio ?? null,
      p_cuerpo: v.cuerpo ?? null,
    });
    if (error) throw new Error(`upsertVersion: ${error.message}`);
    return data as ApplyResult;
  }

  /** Marca como borrado el estado actual de una identidad lógica (tombstone). */
  async tombstone(entityId: string, commitSha: string, createdAt: string): Promise<boolean> {
    const { data, error } = await this.sb.rpc("pm_tombstone", {
      p_entity_id: entityId,
      p_commit_sha: commitSha,
      p_created_at: createdAt,
    });
    if (error) throw new Error(`tombstone: ${error.message}`);
    return Boolean(data);
  }

  /**
   * Búsqueda HÍBRIDA (vector + léxico, fusión RRF) + filtro por tipo, solo vigentes (RPC pm_buscar).
   * `queryText` alimenta el canal léxico; si se omite, el RPC degrada a vector puro.
   */
  async buscar(
    projectId: string,
    queryEmbedding: number[],
    tipos: PmTipo[] | null,
    limit = 8,
    queryText?: string,
  ): Promise<SearchHit[]> {
    const { data, error } = await this.sb.rpc("pm_buscar", {
      p_project_id: projectId,
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_tipos: tipos,
      p_limit: limit,
      p_query_text: queryText ?? null,
    });
    if (error) throw new Error(`buscar: ${error.message}`);
    return (data ?? []) as SearchHit[];
  }

  /** Índice navegable (metadata, sin embeddings ni contenido pesado) de un proyecto. */
  async navegar(projectId: string, tipos?: PmTipo[]): Promise<Partial<PmRow>[]> {
    let q = this.sb
      .from("pm_index")
      .select("entity_id, tipo, nombre, descripcion, archivo, ruta, librerias, dependencias, cobertura")
      .eq("project_id", projectId)
      .eq("is_current", true)
      .eq("deleted", false)
      .order("ruta", { ascending: true });
    if (tipos && tipos.length > 0) q = q.in("tipo", tipos);
    const { data, error } = await q;
    if (error) throw new Error(`navegar: ${error.message}`);
    return (data ?? []) as Partial<PmRow>[];
  }

  /**
   * Versiones vigentes para un conjunto de identidades lógicas (tool recuperar).
   * `incluirDetalles` añade el jsonb `detalles` (firma/contenedor/constantes) — bajo demanda,
   * para no inflar el costo de tokens en cada recuperación.
   */
  async getCurrent(
    projectId: string,
    entityIds: string[],
    incluirDetalles = false,
  ): Promise<PmRow[]> {
    if (entityIds.length === 0) return [];
    const { data, error } = await this.sb
      .from("pm_index")
      .select(incluirDetalles ? ROW_COLS_CON_DETALLES : ROW_COLS)
      .eq("project_id", projectId)
      .eq("is_current", true)
      .in("entity_id", entityIds);
    if (error) throw new Error(`getCurrent: ${error.message}`);
    return (data ?? []) as unknown as PmRow[];
  }

  /**
   * Historia completa de una identidad lógica, más reciente primero (traza, CU-6).
   * Con `incluirCuerpo` añade el `cuerpo` de cada versión (peso server-side, normalmente excluido):
   * lo necesita el reporte `/pm-trace` para calcular el diff `+N −M` y el modal de cambios.
   */
  async traza(entityId: string, incluirCuerpo = false): Promise<PmRow[]> {
    const { data, error } = await this.sb
      .from("pm_index")
      .select(incluirCuerpo ? `${ROW_COLS}, cuerpo` : ROW_COLS)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`traza: ${error.message}`);
    return (data ?? []) as unknown as PmRow[];
  }

  /**
   * Entidades tocadas por un commit (todas las versiones selladas con ese commit_sha): una fila
   * por versión, con la metadata del changelog. Base del input "commit" de `/pm-trace`.
   */
  async entidadesDeCommit(projectId: string, commitSha: string): Promise<Partial<PmRow>[]> {
    const { data, error } = await this.sb
      .from("pm_index")
      .select("entity_id, tipo, nombre, archivo, ruta, magnitud_cambio, cambio, deleted, created_at")
      .eq("project_id", projectId)
      .eq("commit_sha", commitSha)
      .order("ruta", { ascending: true });
    if (error) throw new Error(`entidadesDeCommit: ${error.message}`);
    return (data ?? []) as Partial<PmRow>[];
  }

  /**
   * Gantt GENERAL: planes de desarrollo agrupados por responsable + pendientes de programar
   * (RPC pm_planes_leer). Solo lectura; enriquece cada plan por join a pm_projects (folio→prd_id).
   */
  async leerPlanes(
    estatus?: string[],
    responsable?: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.sb.rpc("pm_planes_leer", {
      p_estatus: estatus ?? null,
      p_responsable: responsable ?? null,
    });
    if (error) throw new Error(`leerPlanes: ${error.message}`);
    return (data as Record<string, unknown> | null) ?? null;
  }

  /**
   * Programa un plan de desarrollo: escribe SOLO fecha_inicio/fecha_fin (RPC pm_plan_programar).
   * Si fechaFin se omite, la DB la deja = fechaInicio. Fechas en ISO "YYYY-MM-DD".
   */
  async programarPlan(
    id: number,
    fechaInicio: string,
    fechaFin?: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.sb.rpc("pm_plan_programar", {
      p_id: id,
      p_fecha_inicio: fechaInicio,
      p_fecha_fin: fechaFin ?? null,
    });
    if (error) throw new Error(`programarPlan: ${error.message}`);
    return data as Record<string, unknown>;
  }
}
