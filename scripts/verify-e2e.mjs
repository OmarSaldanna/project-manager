// Verificación end-to-end de las 4 tools contra la DB real.
// Requiere: env cargado (.env) + haber corrido `pm-index sample examples/sample-proyecto`.
// Uso: node --env-file=.env scripts/verify-e2e.mjs

import { loadConfig, PmRepo, OpenAICompatibleEmbedder, entityId } from "../packages/core/dist/index.js";

const cfg = loadConfig();
const repo = new PmRepo(cfg);
const embedder = new OpenAICompatibleEmbedder(cfg.embeddings);
const P = "sample";

console.log("\n=== pm_navegar (metadata, barato) ===");
const idx = await repo.navegar(P);
for (const r of idx) console.log(`  [${r.tipo}] ${r.nombre}  ·  ${r.ruta}`);
console.log(`  total entradas vigentes: ${idx.length}`);

console.log("\n=== pm_buscar 'crear la tabla de usuarios' (tipo=funcion) ===");
const [emb] = await embedder.embed(["crear la tabla de usuarios"]);
const hits = await repo.buscar(P, emb, ["funcion"], 5);
for (const h of hits) console.log(`  ${h.distancia.toFixed(4)}  ${h.nombre}  (${h.ruta})  — ${h.descripcion}`);

console.log("\n=== pm_buscar 'fases del proyecto' (tipo=markdown_chunk) ===");
const [emb2] = await embedder.embed(["fases del proyecto"]);
const hits2 = await repo.buscar(P, emb2, ["markdown_chunk"], 3);
for (const h of hits2) console.log(`  ${h.distancia.toFixed(4)}  ${h.nombre}`);

console.log("\n=== pm_traza de crear_tabla ===");
const eid = entityId(P, "src/db.py", "crear_tabla");
const traza = await repo.traza(eid);
for (const v of traza)
  console.log(`  commit=${v.commit_sha.slice(0, 8)} current=${v.is_current} deleted=${v.deleted} ${v.created_at}`);

console.log("\nOK — verificación e2e completa.");
