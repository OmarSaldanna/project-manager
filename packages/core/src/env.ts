/** Lectura tipada de configuración por entorno. Falla temprano y claro si falta algo. */

import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

export interface PmConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  embeddings: EmbeddingsConfig;
}

export interface EmbeddingsConfig {
  /** Endpoint compatible OpenAI /embeddings (vía la capa proxy/adaptador, D11). */
  url: string;
  apiKey: string;
  model: string;
  dim: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno requerida: ${name}`);
  return v;
}

/** Raíz del plugin: CLAUDE_PLUGIN_ROOT si está, o tres niveles arriba de dist/. */
export function pluginRoot(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function loadConfig(): PmConfig {
  // El MCP y el CLI del indexer toman sus credenciales del .env de la raíz del plugin
  // (misma vía que prd-sync). Node lo carga, no Claude Code; no pisa variables ya presentes
  // en process.env, así que un --env-file explícito o el entorno del shell siguen ganando.
  try {
    process.loadEnvFile(join(pluginRoot(), ".env"));
  } catch {
    // sin .env: se usa lo que haya en process.env
  }
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceKey: required("SUPABASE_SERVICE_KEY"),
    embeddings: {
      url: process.env.PM_EMBEDDINGS_URL ?? "https://api.openai.com/v1/embeddings",
      apiKey: required("PM_EMBEDDINGS_KEY"),
      model: process.env.PM_EMBEDDINGS_MODEL ?? "text-embedding-3-small",
      dim: Number(process.env.PM_EMBEDDINGS_DIM ?? "1536"),
    },
  };
}
