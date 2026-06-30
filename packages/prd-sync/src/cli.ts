#!/usr/bin/env node
import { join } from "node:path";
import { resolverPrdDir } from "./identidad.js";
import { espejar } from "./mirror.js";
import { ensureRepo, commitDir, pushRepo, redactarUrl, construirUrlAutenticada } from "./git.js";
import { escribirIdentidadPrd, dueñoDePrdDir } from "./config.js";
import { cargarEnv, pluginRoot } from "./env.js";

/** Lee el valor de una bandera `--nombre valor` de los args restantes. */
function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function requerido(rest: string[], name: string): string {
  const v = flag(rest, name);
  if (v === undefined) throw new Error(`Falta la bandera ${name}`);
  return v;
}

function enginecxPrdDir(): string {
  return join(pluginRoot(), "enginecx_prd");
}

function main(): void {
  const [, , sub, ...rest] = process.argv;
  const env = cargarEnv();
  const repoDir = enginecxPrdDir();

  switch (sub) {
    case "ensure-repo": {
      if (!env.repo) throw new Error("Falta ENGINECX_PRD_REPO en .env");
      ensureRepo(repoDir, env.repo, env.user, env.token);
      console.log(`enginecx_prd listo (${redactarUrl(construirUrlAutenticada(env.repo, env.user, "•"))}).`);
      break;
    }
    case "resolve-id": {
      const projectId = requerido(rest, "--project-id");
      const unidad = requerido(rest, "--unidad");
      const config = requerido(rest, "--config");
      const { prdId, prdDir } = resolverPrdDir(projectId, unidad, (d) => dueñoDePrdDir(repoDir, d));
      escribirIdentidadPrd(config, prdId, prdDir);
      console.log(prdDir);
      break;
    }
    case "mirror": {
      const manager = requerido(rest, "--manager");
      const dir = requerido(rest, "--dir");
      espejar(manager, join(repoDir, dir));
      console.log(`Espejado manager/ → enginecx_prd/${dir}/`);
      break;
    }
    case "commit": {
      const dir = requerido(rest, "--dir");
      const message = requerido(rest, "--message");
      const hubo = commitDir(repoDir, dir, message, env.user, env.email);
      console.log(hubo ? `Commit en enginecx_prd: ${message}` : "Sin cambios; nada que commitear.");
      break;
    }
    case "push": {
      if (!env.repo) throw new Error("Falta ENGINECX_PRD_REPO en .env");
      pushRepo(repoDir, env.repo, env.user, env.token);
      console.log("Push a enginecx_prd hecho.");
      break;
    }
    default:
      console.error("Uso: pm-prd-sync <ensure-repo|resolve-id|mirror|commit|push> [opciones]");
      process.exit(1);
  }
}

main();
