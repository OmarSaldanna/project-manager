// Seed de prueba de pm_plan_desarrollo con las 7 filas del Excel de la reunión (2026-07-02).
// NO es parte del flujo del plugin (los devs alimentan la tabla por SQL directo). Solo pruebas.
// Uso: DATABASE_URL=... node scripts/seed-plan-desarrollo.mjs
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const filas = [
  ["PJ6215", "Aprobado",     "Alexis",      1],
  ["PJ6216", "No aprobado",  "Juan Carlos", 3],
  ["PJ6217", "En curso",     "Alejandro",   5],
  ["PJ6218", "No aprobado",  "Alexis",      3],
  ["PJ6219", "Finalizado",   "Juan Carlos", 5],
  ["PJ6220", "Aprobado",     "Alejandro",   3],
  ["PJ6221", "No aprobado",  "Alexis",      1],
];
for (const [folio, estatus, resp, dias] of filas) {
  await client.query(
    "insert into pm_plan_desarrollo (folio_prd, estatus, responsable, dias) values ($1,$2,$3,$4)",
    [folio, estatus, resp, dias],
  );
}
console.log(`Seed listo: ${filas.length} planes insertados.`);
await client.end();
