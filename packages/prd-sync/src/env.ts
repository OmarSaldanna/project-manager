import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

/** Raíz del plugin: CLAUDE_PLUGIN_ROOT si está, o tres niveles arriba de dist/cli.js. */
export function pluginRoot(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export interface EnginecxEnv {
  /** Ubicación del repo central. Es configuración, NO una credencial: dice a dónde
   *  clonar/pushear. El auth lo resuelve el git del equipo (credential helper / SSH). */
  repo: string;
}

/** Carga ENGINECX_PRD_REPO desde el .env del plugin (o de process.env si ya está). */
export function cargarEnv(): EnginecxEnv {
  try {
    process.loadEnvFile(join(pluginRoot(), ".env"));
  } catch {
    // sin .env: se usa lo que haya en process.env
  }
  return {
    repo: process.env.ENGINECX_PRD_REPO ?? "",
  };
}
