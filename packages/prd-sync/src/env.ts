import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

/** Raíz del plugin: CLAUDE_PLUGIN_ROOT si está, o tres niveles arriba de dist/cli.js. */
export function pluginRoot(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export interface EnginecxEnv {
  repo: string;
  user: string;
  email: string;
  token: string;
}

/** Carga las ENGINECX_PRD_* desde el .env del plugin (o de process.env si ya están). */
export function cargarEnv(): EnginecxEnv {
  try {
    process.loadEnvFile(join(pluginRoot(), ".env"));
  } catch {
    // sin .env: se usa lo que haya en process.env
  }
  return {
    repo: process.env.ENGINECX_PRD_REPO ?? "",
    user: process.env.ENGINECX_PRD_GIT_USER ?? "",
    email: process.env.ENGINECX_PRD_GIT_EMAIL ?? "",
    token: process.env.ENGINECX_PRD_GIT_TOKEN ?? "",
  };
}
