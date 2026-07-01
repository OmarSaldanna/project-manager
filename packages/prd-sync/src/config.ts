import { readFileSync, writeFileSync } from "node:fs";

export interface ProjectConfig {
  project_id: string;
  unidad: string;
  sistema?: string;
  prd_id?: string;
  prd_dir?: string;
}

/** Lee y parsea el config.json. Lanza si la ruta no existe o el JSON es inválido (la ruta la controla el llamador). */
export function leerConfig(ruta: string): ProjectConfig {
  return JSON.parse(readFileSync(ruta, "utf8")) as ProjectConfig;
}

/**
 * Persiste la identidad de carpeta PRD en el config.json, conservando el resto de claves y el
 * formato (2 espacios + salto final). `sistema` y `project_id` deben existir ya en el config;
 * aquí solo se agregan los derivados:
 * - `prd_id`  → hash de 4 dígitos del `project_id`
 * - `prd_dir` → ruta relativa en enginecx_prd: `{sistema}/PJ{prd_id}-{project_id}`
 */
export function escribirIdentidadPrd(
  ruta: string,
  datos: { prdId: string; prdDir: string },
): void {
  const cfg = leerConfig(ruta);
  cfg.prd_id = datos.prdId;
  cfg.prd_dir = datos.prdDir;
  writeFileSync(ruta, JSON.stringify(cfg, null, 2) + "\n");
}
