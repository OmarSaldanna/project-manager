// Aplica packages/core/src/schema.sql contra la DB indicada en DATABASE_URL.
// Uso: DATABASE_URL=postgresql://... node scripts/run-schema.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "packages", "core", "src", "schema.sql"), "utf8");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("Conectado. Aplicando schema.sql...");
await client.query(sql);

const tablas = await client.query(
  "select count(*) from information_schema.tables where table_name = 'pm_index'",
);
const fns = await client.query(
  "select proname from pg_proc where proname in ('pm_buscar','pm_upsert_version','pm_tombstone') order by proname",
);
const ext = await client.query("select extname from pg_extension where extname = 'vector'");

console.log("tabla pm_index:", Number(tablas.rows[0].count) === 1 ? "OK" : "FALTA");
console.log("extensión vector:", ext.rows.length ? "OK" : "FALTA");
console.log("RPCs:", fns.rows.map((r) => r.proname).join(", ") || "NINGUNO");
await client.end();
console.log("Listo.");
