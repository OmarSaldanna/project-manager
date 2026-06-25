#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, PmRepo, OpenAICompatibleEmbedder, PM_TIPOS, type PmTipo } from "@pm-ai/core";
import {
  applyCommit,
  loadHtmlOverrides,
  LlmDescriber,
  SignatureDescriber,
  type ApplyDeps,
  type Describer,
  type FileChange,
} from "@pm-ai/indexer";

// Fuente única en @pm-ai/core para que los filtros de tipo nunca diverjan del enum SQL.
const TIPOS = PM_TIPOS;

const cfg = loadConfig();
const repo = new PmRepo(cfg);
const embedder = new OpenAICompatibleEmbedder(cfg.embeddings);

// Describer para la ingesta (pm_indexar): LLM si hay endpoint Y clave; si no, la firma (fallback).
const describer: Describer =
  process.env.PM_LLM_URL && process.env.PM_LLM_KEY
    ? new LlmDescriber({
        url: process.env.PM_LLM_URL,
        apiKey: process.env.PM_LLM_KEY,
        model: process.env.PM_LLM_MODEL ?? "gpt-4o-mini",
      })
    : new SignatureDescriber();
const indexDeps: ApplyDeps = { repo, embedder, describer };

const server = new McpServer({ name: "pm-ai", version: "0.1.0" });

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// Catálogo de proyectos (CU-5/CU-7): qué proyectos existen y de qué unidad.
server.registerTool(
  "pm_proyectos",
  {
    title: "Listar proyectos",
    description:
      "Devuelve el catálogo de proyectos registrados (nombre, unidad de negocio, repo, estado). " +
      "Úsalo para consultas que cruzan proyectos o para saber qué project_id usar en las demás tools.",
    inputSchema: { unidad: z.string().optional() },
  },
  async ({ unidad }) => json(await repo.listarProyectos(unidad)),
);

// Nivel 1+2 de navegación (prompt.md §7): metadata navegable, barato en tokens.
server.registerTool(
  "pm_navegar",
  {
    title: "Navegar índice",
    description:
      "Devuelve el índice navegable (metadata: nombre, descripción, ruta, dependencias) " +
      "de un proyecto SIN leer archivos ni embeddings. Úsalo PRIMERO para ubicar qué existe " +
      "y dónde, antes de leer cualquier archivo. Filtra por tipo para acotar.",
    inputSchema: {
      project_id: z.string(),
      tipos: z.array(z.enum(TIPOS)).optional(),
    },
  },
  async ({ project_id, tipos }) => json(await repo.navegar(project_id, tipos as PmTipo[] | undefined)),
);

// Búsqueda semántica (nivel 2): embebe la consulta y trae top-k vigentes.
server.registerTool(
  "pm_buscar",
  {
    title: "Buscar (semántico)",
    description:
      "Búsqueda semántica sobre las descripciones del índice (código y documentación). " +
      "Devuelve los símbolos/chunks más relevantes con su ruta para que luego leas SOLO eso. " +
      "Filtra por tipo si sabes qué buscas (p.ej. ['funcion'] o ['markdown_chunk']).",
    inputSchema: {
      project_id: z.string(),
      query: z.string(),
      tipos: z.array(z.enum(TIPOS)).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    },
  },
  async ({ project_id, query, tipos, limit }) => {
    const [emb] = await embedder.embed([query]);
    if (!emb) throw new Error("No se pudo generar el embedding de la consulta");
    // Se pasa también el texto crudo: el canal léxico (RRF) rescata identificadores/valores exactos.
    return json(
      await repo.buscar(project_id, emb, (tipos as PmTipo[] | undefined) ?? null, limit ?? 8, query),
    );
  },
);

// Recuperación puntual (nivel 3): metadata vigente de entidades concretas para ubicarlas.
server.registerTool(
  "pm_recuperar",
  {
    title: "Recuperar entidades",
    description:
      "Trae la versión vigente de identidades concretas (entity_id). Para código devuelve " +
      "metadata + ubicación (lee el archivo tú mismo); para markdown_chunk/reporte/pagina devuelve el contenido. " +
      "Con `incluir_detalles=true` añade el detalle estructural (firma, contenedor/clase, constantes de módulo) del código.",
    inputSchema: {
      project_id: z.string(),
      entity_ids: z.array(z.string()).min(1),
      incluir_detalles: z.boolean().optional(),
    },
  },
  async ({ project_id, entity_ids, incluir_detalles }) =>
    json(await repo.getCurrent(project_id, entity_ids, incluir_detalles ?? false)),
);

// Traza histórica (CU-6): todas las versiones de una entidad con su commit.
server.registerTool(
  "pm_traza",
  {
    title: "Traza histórica",
    description:
      "Historia completa de una identidad lógica (entity_id) como CHANGELOG por entidad: cada " +
      "versión con su commit_sha y fecha, más reciente primero, y además `cambio` (qué cambió " +
      "respecto a la versión anterior), `magnitud_cambio` (cosmetico|firma|logica|mixto|eliminado) " +
      "y `hash_anterior` (encadena la historia). Úsalo para responder '¿cómo evolucionó X, qué " +
      "cambió y en qué commits?' sin leer git. Con `incluir_cuerpo=true` añade el `cuerpo` de cada " +
      "versión (para calcular diffs línea a línea, p.ej. el reporte /pm-trace).",
    inputSchema: { entity_id: z.string(), incluir_cuerpo: z.boolean().optional() },
  },
  async ({ entity_id, incluir_cuerpo }) => json(await repo.traza(entity_id, incluir_cuerpo ?? false)),
);

// Entidades tocadas por un commit (CU-6/trace): qué símbolos/chunks cambió ese commit_sha.
server.registerTool(
  "pm_commit",
  {
    title: "Entidades de un commit",
    description:
      "Lista las entidades (símbolos/chunks) que un commit tocó: una fila por versión sellada con " +
      "ese commit_sha, con nombre, tipo, ruta y la metadata del changelog (cambio/magnitud_cambio). " +
      "Úsalo para resolver el input 'commit' de /pm-trace o para responder '¿qué cambió este commit?'.",
    inputSchema: { project_id: z.string(), commit_sha: z.string() },
  },
  async ({ project_id, commit_sha }) => json(await repo.entidadesDeCommit(project_id, commit_sha)),
);

// Ingesta agéntica (pm-commit): indexa en pm_index los archivos acordados de un commit.
// Aplica el criterio de Entidades de Código (código→símbolos, .md→chunks, .html→reporte)
// y el versionado SCD-2. Ver docs/entidades-y-indexacion.md.
server.registerTool(
  "pm_indexar",
  {
    title: "Indexar cambios de un commit",
    description:
      "Indexa en la base de datos los archivos acordados de un commit. Aplica el criterio de " +
      "Entidades de Código (cada tipo de archivo se trata distinto) y el versionado SCD-2; " +
      "registra el proyecto si no existe (idempotente). Úsalo desde /pm-commit DESPUÉS de hacer " +
      "el commit en git, pasando el commit_sha resultante. Marca deleted:true para archivos " +
      "borrados en el commit. Devuelve el conteo de altas/versiones/sin-cambio/tombstones.",
    inputSchema: {
      project_id: z.string(),
      nombre: z.string().optional(),
      unidad: z.string().optional(),
      repo_url: z.string().optional(),
      repo_root: z.string().describe("Ruta absoluta del repo; las rutas de 'files' son relativas a esta."),
      commit_sha: z.string(),
      created_at: z.string().optional().describe("ISO; por defecto, ahora."),
      files: z
        .array(z.object({ ruta: z.string(), deleted: z.boolean().optional() }))
        .min(1)
        .describe("Archivos acordados (ruta relativa al repo). deleted:true si se eliminaron."),
    },
  },
  async ({ project_id, nombre, unidad, repo_url, repo_root, commit_sha, created_at, files }) => {
    await repo.registrarProyecto({
      projectId: project_id,
      nombre: nombre ?? project_id,
      unidad,
      repoUrl: repo_url,
    });
    const createdAt = created_at ?? new Date().toISOString();
    const changes: FileChange[] = files.map((f) => {
      if (f.deleted) return { ruta: f.ruta, contenido: null };
      try {
        return { ruta: f.ruta, contenido: readFileSync(join(repo_root, f.ruta), "utf8") };
      } catch (e) {
        throw new Error(`No se pudo leer ${f.ruta} en ${repo_root}: ${(e as Error).message}`);
      }
    });
    // Overrides de HTML ambiguo por repo (pm-ai.overrides.json), igual que el CLI: así
    // `/pm-init` y `/pm-commit` resuelven páginas/reportes de forma consistente.
    const deps: ApplyDeps = { ...indexDeps, htmlOverrides: loadHtmlOverrides(repo_root) };
    const stats = await applyCommit(project_id, commit_sha, createdAt, changes, deps);
    const total = stats.reduce(
      (a, s) => ({
        created: a.created + s.created,
        versioned: a.versioned + s.versioned,
        unchanged: a.unchanged + s.unchanged,
        tombstoned: a.tombstoned + s.tombstoned,
      }),
      { created: 0, versioned: 0, unchanged: 0, tombstoned: 0 },
    );
    return json({ project_id, commit_sha, total, archivos: stats });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[pm-ai] MCP server listo (stdio).");
