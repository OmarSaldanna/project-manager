import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ProjectConfig {
  project_id: string;
  nombre: string;
  unidad: string;
  prd_id?: string;
  prd_dir?: string;
}

/** Lee y parsea el config.json. Lanza si la ruta no existe o el JSON es inválido (la ruta la controla el llamador). */
export function leerConfig(ruta: string): ProjectConfig {
  return JSON.parse(readFileSync(ruta, "utf8")) as ProjectConfig;
}

/** Persiste prd_id/prd_dir en el config, conservando el resto y el formato (2 espacios). */
export function escribirIdentidadPrd(ruta: string, prdId: string, prdDir: string): void {
  const cfg = leerConfig(ruta);
  cfg.prd_id = prdId;
  cfg.prd_dir = prdDir;
  writeFileSync(ruta, JSON.stringify(cfg, null, 2) + "\n");
}

/** project_id que ocupa `enginecx_prd/<prdDir>/config.json`, o null si no existe/ilegible. */
export function dueñoDePrdDir(enginecxPrdDir: string, prdDir: string): string | null {
  const cfg = join(enginecxPrdDir, prdDir, "config.json");
  if (!existsSync(cfg)) return null;
  try {
    return (JSON.parse(readFileSync(cfg, "utf8")) as ProjectConfig).project_id ?? null;
  } catch {
    return null;
  }
}
