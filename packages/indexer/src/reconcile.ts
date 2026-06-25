import { entityId, contentHash, type IndexEntry, type PmTipo } from "@pm-ai/core";

/** Estado vigente conocido de una entidad en la DB (para detectar cambios). */
export interface ExistingEntity {
  entityId: string;
  contentHash: string;
  /** Clasificación vigente. Si difiere de la extraída, fuerza re-versionado aunque
   *  el cuerpo no cambie (reclasificación funcion → endpoint). Opcional para back-compat. */
  tipo?: PmTipo;
}

/** Entrada ya resuelta con su identidad y hash, lista para decidir su destino. */
export interface PreparedEntry extends IndexEntry {
  entityId: string;
  contentHash: string;
}

export interface ReconcilePlan {
  /** Necesitan embedding + descripción + RPC (alta o nueva versión). */
  toUpsert: PreparedEntry[];
  /** Vigentes en DB que ya no aparecen en el archivo → tombstone. */
  toTombstone: string[];
  /** Sin cambios (mismo entity_id y mismo content_hash): no se tocan ni se embeben. */
  unchanged: PreparedEntry[];
}

/**
 * Reconcilia el contenido extraído de UN archivo contra su estado vigente en DB.
 * Puro y determinista → testeable sin servicios externos (prompt.md §11, Etapa 1).
 *
 * Reglas (D5, D9):
 *  - mismo entity_id + mismo content_hash + mismo tipo → unchanged (no re-embebe, gate de costo).
 *  - mismo entity_id + distinto content_hash → toUpsert (nueva versión).
 *  - mismo entity_id + distinto tipo (reclasificación) → toUpsert (nueva versión).
 *  - entity_id nuevo → toUpsert (alta).
 *  - entity_id vigente ausente del archivo → toTombstone (borrado; renombrar cae aquí + alta).
 */
export function reconcileFile(
  projectId: string,
  entries: IndexEntry[],
  existing: ExistingEntity[],
): ReconcilePlan {
  const existingByEntity = new Map(existing.map((e) => [e.entityId, e]));

  const prepared: PreparedEntry[] = entries.map((e) => ({
    ...e,
    entityId: entityId(projectId, e.ruta, e.nombre),
    contentHash: contentHash(e.contenido),
  }));

  const seen = new Set<string>();
  const toUpsert: PreparedEntry[] = [];
  const unchanged: PreparedEntry[] = [];

  for (const p of prepared) {
    seen.add(p.entityId);
    const prev = existingByEntity.get(p.entityId);
    const mismoHash = prev !== undefined && prev.contentHash === p.contentHash;
    const mismoTipo = prev?.tipo === undefined || prev.tipo === p.tipo;
    if (mismoHash && mismoTipo) {
      unchanged.push(p);
    } else {
      toUpsert.push(p);
    }
  }

  const toTombstone = existing.map((e) => e.entityId).filter((id) => !seen.has(id));

  return { toUpsert, toTombstone, unchanged };
}
