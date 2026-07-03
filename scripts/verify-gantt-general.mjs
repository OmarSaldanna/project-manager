// Verifica contra la DB real los RPCs del gantt general: enlace por folio→prd_id,
// agrupación por responsable, pendientes de programar y que pm_plan_programar solo toca fechas.
// Uso: DATABASE_URL=... node scripts/verify-gantt-general.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const PRJ = "verify_gg_proj";
const FOLIO = "PJ9911";
// limpieza previa
await client.query("delete from pm_plan_desarrollo where folio_prd like 'PJ99%'");
await client.query("delete from pm_projects where project_id = $1", [PRJ]);

// proyecto puente: prd_id 9911 ↔ folio PJ9911
await client.query(
  "insert into pm_projects (project_id, nombre, unidad, prd_id) values ($1,$2,$3,$4)",
  [PRJ, "Proyecto Verify GG", "EngineCX", "9911"],
);
// dos planes: uno aprobado sin fecha (pendiente), otro con fecha
await client.query(
  "insert into pm_plan_desarrollo (folio_prd, estatus, responsable, dias) values ($1,'Aprobado','Alexis',3)",
  [FOLIO],
);
const ins = await client.query(
  "insert into pm_plan_desarrollo (folio_prd, estatus, responsable, dias) values ($1,'Aprobado','Alexis',1) returning id",
  ["PJ9912"],
);
const id2 = ins.rows[0].id;

const results = [];
const check = (name, cond) => results.push([name, cond]);

// 1. Lectura + enlace por join
const leer = (await client.query("select pm_planes_leer(null,null) as d")).rows[0].d;
const alexis = leer.responsables.find((r) => r.nombre === "Alexis");
check("agrupa por responsable (Alexis presente)", !!alexis);
const p1 = alexis.planes.find((p) => p.folio === FOLIO);
check("enlace folio→proyecto trae el nombre", p1 && p1.nombre === "Proyecto Verify GG");
check("enlace trae project_id", p1 && p1.project_id === PRJ);

// 2. Pendientes = aprobados sin fecha
check("PJ9911 aparece en pendientes", leer.pendientes.some((p) => p.folio === FOLIO));

// 3. Programar solo toca fechas
const prog = (await client.query("select pm_plan_programar($1,$2::date,$3::date) as d", [id2, "2026-07-27", "2026-07-30"])).rows[0].d;
check("pm_plan_programar fija fecha_inicio", prog.fecha_inicio === "2026-07-27");
check("pm_plan_programar fija fecha_fin", prog.fecha_fin === "2026-07-30");
check("no cambió estatus", prog.estatus === "Aprobado");
check("no cambió responsable", prog.responsable === "Alexis");

// 4. fecha_fin default = fecha_inicio
const prog1 = (await client.query("select pm_plan_programar((select id from pm_plan_desarrollo where folio_prd=$1),$2::date,null) as d", [FOLIO, "2026-07-03"])).rows[0].d;
check("fecha_fin default = fecha_inicio", prog1.fecha_fin === "2026-07-03");

// 5. ya no existen las tablas del gantt particular
const gone = await client.query("select to_regclass('public.pm_gantt') as t");
check("pm_gantt fue retirada", gone.rows[0].t === null);

// limpieza
await client.query("delete from pm_plan_desarrollo where folio_prd like 'PJ99%'");
await client.query("delete from pm_projects where project_id = $1", [PRJ]);
await client.end();

let ok = 0;
for (const [name, cond] of results) { console.log(`${cond ? "✓" : "✗ FALLO"}  ${name}`); if (cond) ok++; }
console.log(`\n${ok}/${results.length} verificaciones del gantt general en verde.`);
process.exit(ok === results.length ? 0 : 1);
