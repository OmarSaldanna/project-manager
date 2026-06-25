/** Lectura tipada de configuración por entorno. Falla temprano y claro si falta algo. */

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

export function loadConfig(): PmConfig {
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
