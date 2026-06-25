// Verifica contra la DB real los RPCs de versionado (D5): gate de content_hash,
// flip de is_current, unicidad de versión vigente y tombstones.
// No requiere service key ni embeddings. Uso: DATABASE_URL=... node scripts/verify-rpcs.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const P = "verify_rpcs";
const E = "ent_crear_tabla";
await client.query("delete from pm_index where project_id = $1", [P]);

async function upsert(hash, desc) {
  const r = await client.query(
    `select pm_upsert_version($1,$2,$3::pm_tipo,$4,$5,$6,$7,$8::text[],$9::text[],$10,$11,$12::timestamptz,$13) as res`,
    [P, E, "funcion", "c1", hash, "crear_tabla", desc, [], [], "db.py", "src/db.py", "2026-06-17T10:00:00Z", ""],
  );
  return r.rows[0].res;
}
const count = async (where, params) =>
  Number((await client.query(`select count(*) from pm_index where ${where}`, params)).rows[0].count);

const results = [];
const check = (name, cond) => results.push([name, cond]);

// 1. Alta
check("alta devuelve 'created'", (await upsert("h1", "v1")) === "created");
// 2. Mismo hash → unchanged
check("mismo content_hash devuelve 'unchanged'", (await upsert("h1", "v1")) === "unchanged");
check("sigue habiendo 1 sola fila tras unchanged", (await count("project_id=$1", [P])) === 1);
// 3. Hash distinto → versioned
check("content_hash distinto devuelve 'versioned'", (await upsert("h2", "v2")) === "versioned");
check("ahora hay 2 filas (historia)", (await count("project_id=$1", [P])) === 2);
check("solo 1 vigente", (await count("entity_id=$1 and is_current", [E])) === 1);
const vig = await client.query("select content_hash from pm_index where entity_id=$1 and is_current", [E]);
check("la vigente es la v2 (h2)", vig.rows[0].content_hash === "h2");
// 4. Tombstone
const tomb = await client.query("select pm_tombstone($1,$2,$3::timestamptz) as r", [E, "c2", "2026-06-18T10:00:00Z"]);
check("pm_tombstone devuelve true", tomb.rows[0].r === true);
check("la vigente ahora está deleted", (await count("entity_id=$1 and is_current and deleted", [E])) === 1);
check("no aparece en estado activo", (await count("entity_id=$1 and is_current and not deleted", [E])) === 0);
check("historia preservada (3 filas)", (await count("entity_id=$1", [E])) === 3);
// 5. Re-tombstone es idempotente
const tomb2 = await client.query("select pm_tombstone($1,$2,$3::timestamptz) as r", [E, "c3", "2026-06-19T10:00:00Z"]);
check("re-tombstone devuelve false (ya borrado)", tomb2.rows[0].r === false);

await client.query("delete from pm_index where project_id = $1", [P]);
await client.end();

let ok = 0;
for (const [name, cond] of results) {
  console.log(`${cond ? "✓" : "✗ FALLO"}  ${name}`);
  if (cond) ok++;
}
console.log(`\n${ok}/${results.length} verificaciones de RPC en verde contra la DB real.`);
process.exit(ok === results.length ? 0 : 1);
