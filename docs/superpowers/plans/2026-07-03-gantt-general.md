# Gantt general (planes de desarrollo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar el Gantt "particular" (esquema `pm_gantt*`) y construir el Gantt **general**: una tabla global `pm_plan_desarrollo` (planes de desarrollo por PRD/desarrollador), tools MCP de solo-lectura + asignar-fechas, una plantilla `gantt/general.html` segmentada por persona, y el comando `/pm-gantt` reformulado al PM.

**Architecture:** El dato del gantt general es **global** (una fila por plan, ligada a un PRD por `folio_prd`); se enlaza a `pm_projects` (por `prd_id`) y de ahí al índice de código `pm_index`. El plugin **solo lee y solo escribe las columnas de fecha**; los desarrolladores alimentan el resto por SQL directo. El HTML se renderiza en `manager/gantt/general.html` del proyecto actual como reflejo de la DB (bloque `<script id="general-data">`).

**Tech Stack:** Postgres/Supabase + pgvector (schema.sql, RPCs plpgsql/sql), TypeScript (monorepo pnpm: `@pm-ai/core`, `@pm-ai/mcp`), MCP SDK + zod, HTML/CSS/JS vanilla (plantilla), Markdown (comandos slash), scripts Node `.mjs` con `pg` para verificación contra DB real.

## Global Constraints

- Node ≥22, pnpm ≥11. Build por paquete: `pnpm build` (= `tsc -p tsconfig.json`). Typecheck: `pnpm typecheck`.
- El plugin `/pm-gantt` **solo LEE** la tabla y **solo escribe** `fecha_inicio`/`fecha_fin`. Nunca `INSERT`, nunca toca `estatus`/`responsable`/`dias`/`folio_prd`.
- Tabla confirmada: `pm_plan_desarrollo` (global, sin `project_id` propio). `folio_prd` **no** es único; los planes se referencian por `id`.
- Enlace: `folio_prd = 'PJ' || prd_id`; `pm_projects.prd_id` es el puente hacia `pm_projects.project_id` → `pm_index.project_id`.
- `estatus` es texto (no enum): `No aprobado | Aprobado | En curso | Finalizado`.
- NO tocar `gantt/index.html` (plantilla del futuro particular, congelada).
- Verificación de RPCs vía script `.mjs` con `pg` y `DATABASE_URL` (patrón `scripts/verify-rpcs.mjs`), NO vitest.
- Flujo transversal (CLAUDE.md): propuesta → revisión → confirmación. No commits sueltos (se cierra con `/guardar-cambios`).

---

### Task 1: Esquema DB — retirar `pm_gantt*` y crear el modelo general

**Files:**
- Modify: `packages/core/src/schema.sql` (sección GANTT, líneas ~264-469)
- Create: `scripts/verify-gantt-general.mjs`

**Interfaces:**
- Produces (RPCs SQL que consumen tareas posteriores):
  - `pm_planes_leer(p_estatus text[] default null, p_responsable text default null) returns jsonb`
  - `pm_plan_programar(p_id bigint, p_fecha_inicio date, p_fecha_fin date default null) returns jsonb`
  - Tabla `pm_plan_desarrollo(id bigint, folio_prd text, estatus text, responsable text, dias int, fecha_inicio date, fecha_fin date, created_at, updated_at)`
  - Columna `pm_projects.prd_id text`

- [ ] **Step 1: Reemplazar toda la sección GANTT de `schema.sql`**

En `packages/core/src/schema.sql`, borra el bloque que va desde el comentario `-- ==== GANTT / PLANEACIÓN ====` (línea ~264) hasta el final del archivo (el `pm_gantt_objetivo_eliminar`, línea ~469) y sustitúyelo por:

```sql
-- ============================================================================
-- GANTT GENERAL — PLANES DE DESARROLLO (cross-proyecto, cross-desarrollador)
-- ============================================================================
-- Reemplaza al Gantt "particular" (pm_gantt*), retirado abajo. Modelo:
--   pm_plan_desarrollo (global) ──folio_prd='PJ'||prd_id──► pm_projects ──project_id──► pm_index
-- El plugin (PM) SOLO lee y SOLO escribe fecha_inicio/fecha_fin; los devs alimentan el resto.

-- Migración: se RETIRA el Gantt particular (pm_gantt*). Se reconstruirá en fase posterior.
-- `drop ... if exists` es idempotente (no-op tras la primera corrida).
drop view     if exists pm_gantt_resumen;
drop view     if exists pm_gantt_tarea_avance;
drop function if exists pm_gantt_guardar(text, jsonb, jsonb);
drop function if exists pm_gantt_leer(text);
drop function if exists pm_gantt_objetivo_guardar(text, text, jsonb);
drop function if exists pm_gantt_objetivo_eliminar(text, text);
drop table    if exists pm_gantt_objetivo;
drop table    if exists pm_gantt_tarea;
drop table    if exists pm_gantt;

-- Puente del enlace: prd_id (hoy solo en config.json) sube a pm_projects.
alter table pm_projects add column if not exists prd_id text;
create index if not exists idx_projects_prd on pm_projects (prd_id);

-- Tabla global de planes de desarrollo. Una fila por plan, ligada a un PRD por folio.
create table if not exists pm_plan_desarrollo (
  id            bigint generated always as identity primary key,
  folio_prd     text not null,                        -- "PJ6215" — llave de enlace; la pone el dev
  estatus       text not null default 'No aprobado',  -- No aprobado | Aprobado | En curso | Finalizado
  responsable   text not null,                        -- desarrollador (Alexis, Juan Carlos…)
  dias          int,                                  -- estimación del dev (días hábiles)
  fecha_inicio  date,                                 -- SOLO el plugin (PM) la escribe
  fecha_fin     date,                                 -- SOLO el plugin (PM); default = fecha_inicio
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_plan_folio on pm_plan_desarrollo (folio_prd);

-- Lectura del gantt general: JSON agrupado por responsable + lista de "pendientes de programar"
-- (aprobados sin fecha). Enriquece cada plan por join a pm_projects (folio_prd → prd_id).
create or replace function pm_planes_leer(
  p_estatus text[] default null,
  p_responsable text default null
) returns jsonb language sql stable as $$
  with planes as (
    select pd.id, pd.folio_prd, pd.estatus, pd.responsable, pd.dias,
           pd.fecha_inicio, pd.fecha_fin,
           pr.project_id, pr.nombre as proyecto_nombre, pr.unidad
    from pm_plan_desarrollo pd
    left join pm_projects pr
      on pr.prd_id = regexp_replace(pd.folio_prd, '^PJ', '', 'i')
    where (p_estatus is null or pd.estatus = any(p_estatus))
      and (p_responsable is null or pd.responsable = p_responsable)
  )
  select jsonb_build_object(
    'responsables', coalesce((
      select jsonb_agg(g.r order by g.nombre)
      from (
        select responsable as nombre,
          jsonb_build_object(
            'nombre', responsable,
            'planes', jsonb_agg(jsonb_build_object(
              'id', id, 'folio', folio_prd, 'nombre', proyecto_nombre,
              'estatus', estatus, 'responsable', responsable, 'dias', dias,
              'fecha_inicio', fecha_inicio, 'fecha_fin', fecha_fin,
              'project_id', project_id, 'unidad', unidad
            ) order by fecha_inicio nulls last, id)
          ) as r
        from planes
        group by responsable
      ) g), '[]'::jsonb),
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'folio', folio_prd, 'nombre', proyecto_nombre,
        'estatus', estatus, 'responsable', responsable, 'dias', dias
      ) order by id)
      from planes where fecha_inicio is null and estatus = 'Aprobado'), '[]'::jsonb)
  );
$$;

-- Programa (asigna fechas a) un plan. Escribe SOLO fecha_inicio/fecha_fin (+ updated_at).
-- Si no se da fecha_fin, queda = fecha_inicio (1 día). El cálculo multi-día (usando dias) lo
-- hace el agente ANTES de llamar, respetando días hábiles.
create or replace function pm_plan_programar(
  p_id bigint, p_fecha_inicio date, p_fecha_fin date default null
) returns jsonb language plpgsql as $$
declare v_row pm_plan_desarrollo;
begin
  update pm_plan_desarrollo
     set fecha_inicio = p_fecha_inicio,
         fecha_fin    = coalesce(p_fecha_fin, p_fecha_inicio),
         updated_at   = now()
   where id = p_id
   returning * into v_row;
  if not found then raise exception 'no existe el plan de desarrollo con id %', p_id; end if;
  return to_jsonb(v_row);
end $$;
```

- [ ] **Step 2: Aplicar el esquema contra la DB**

Run: `DATABASE_URL="$DATABASE_URL" node scripts/run-schema.mjs`
Expected: aplica sin error; los `drop ... if exists` y `create ... if not exists` corren idempotentes.

- [ ] **Step 3: Escribir el script de verificación de los RPCs**

Crea `scripts/verify-gantt-general.mjs` (patrón de `scripts/verify-rpcs.mjs`):

```javascript
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
```

- [ ] **Step 4: Correr la verificación**

Run: `DATABASE_URL="$DATABASE_URL" node scripts/verify-gantt-general.mjs`
Expected: `N/N verificaciones del gantt general en verde.` (exit 0).

- [ ] **Step 5: Commit** — se difiere a `/guardar-cambios` al cierre (no commit suelto).

---

### Task 2: `@pm-ai/core` — repo (db.ts): retirar métodos gantt viejos, agregar planes + prd_id

**Files:**
- Modify: `packages/core/src/db.ts` (métodos gantt ~280-330; `registrarProyecto` ~79-100)

**Interfaces:**
- Consumes: RPCs de Task 1 (`pm_planes_leer`, `pm_plan_programar`).
- Produces (métodos de `PmRepo` que consume Task 3):
  - `leerPlanes(estatus?: string[], responsable?: string): Promise<Record<string,unknown> | null>`
  - `programarPlan(id: number, fechaInicio: string, fechaFin?: string): Promise<Record<string,unknown>>`
  - `registrarProyecto(p: { …; prdId?: string })` (nuevo campo opcional `prdId`)

- [ ] **Step 1: Retirar los cuatro métodos gantt viejos**

En `packages/core/src/db.ts`, elimina `guardarGantt`, `leerGantt`, `guardarObjetivo`, `eliminarObjetivo` (bloque ~280-330, con sus comentarios).

- [ ] **Step 2: Agregar `prdId` a `registrarProyecto`**

Modifica la firma y el upsert de `registrarProyecto` (~79-100). Reemplaza el objeto del upsert por (nota el spread condicional para NO pisar `prd_id` cuando no se provee):

```ts
  async registrarProyecto(p: {
    projectId: string;
    nombre: string;
    unidad?: string;
    repoUrl?: string;
    descripcion?: string;
    estado?: string;
    prdId?: string;
  }): Promise<void> {
    const { error } = await this.sb.from("pm_projects").upsert(
      {
        project_id: p.projectId,
        nombre: p.nombre,
        unidad: p.unidad ?? null,
        repo_url: p.repoUrl ?? null,
        descripcion: p.descripcion ?? null,
        ...(p.estado ? { estado: p.estado } : {}),
        ...(p.prdId ? { prd_id: p.prdId } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
    if (error) throw new Error(`registrarProyecto: ${error.message}`);
  }
```

- [ ] **Step 3: Agregar los métodos del gantt general**

Donde estaban los métodos gantt viejos, agrega:

```ts
  /**
   * Gantt GENERAL: planes de desarrollo agrupados por responsable + pendientes de programar
   * (RPC pm_planes_leer). Solo lectura; enriquece cada plan por join a pm_projects (folio→prd_id).
   */
  async leerPlanes(
    estatus?: string[],
    responsable?: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.sb.rpc("pm_planes_leer", {
      p_estatus: estatus ?? null,
      p_responsable: responsable ?? null,
    });
    if (error) throw new Error(`leerPlanes: ${error.message}`);
    return (data as Record<string, unknown> | null) ?? null;
  }

  /**
   * Programa un plan de desarrollo: escribe SOLO fecha_inicio/fecha_fin (RPC pm_plan_programar).
   * Si fechaFin se omite, la DB la deja = fechaInicio. Fechas en ISO "YYYY-MM-DD".
   */
  async programarPlan(
    id: number,
    fechaInicio: string,
    fechaFin?: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.sb.rpc("pm_plan_programar", {
      p_id: id,
      p_fecha_inicio: fechaInicio,
      p_fecha_fin: fechaFin ?? null,
    });
    if (error) throw new Error(`programarPlan: ${error.message}`);
    return data as Record<string, unknown>;
  }
```

- [ ] **Step 4: Build + typecheck de core**

Run: `pnpm --filter @pm-ai/core build && pnpm --filter @pm-ai/core typecheck`
Expected: sin errores. (Si `db.test.ts` referenciaba métodos gantt viejos, ver Task 6/limpieza — grep en Step 5.)

- [ ] **Step 5: Verificar que no queden referencias colgadas**

Run: `grep -rn "guardarGantt\|leerGantt\|guardarObjetivo\|eliminarObjetivo" packages/`
Expected: solo (si acaso) en `packages/mcp/src/index.ts` (se arregla en Task 3). Si aparecen en tests de core, actualízalos/elimínalos y re-corre `pnpm --filter @pm-ai/core test`.

- [ ] **Step 6: Commit** — diferido a `/guardar-cambios`.

---

### Task 3: `@pm-ai/mcp` — retirar tools gantt viejas, registrar planes, propagar prd_id

**Files:**
- Modify: `packages/mcp/src/index.ts` (tools gantt ~208-279; tool `pm_indexar` ~151-206)

**Interfaces:**
- Consumes: `repo.leerPlanes`, `repo.programarPlan`, `repo.registrarProyecto({prdId})` (Task 2).
- Produces (tools MCP): `pm_planes_leer`, `pm_plan_programar` (las consume el comando `/pm-gantt`, Task 6).

- [ ] **Step 1: Eliminar las cuatro tools `pm_gantt_*`**

En `packages/mcp/src/index.ts`, borra los cuatro `server.registerTool("pm_gantt_guardar" …)`, `"pm_gantt_leer"`, `"pm_gantt_objetivo_guardar"`, `"pm_gantt_objetivo_eliminar"` (bloque ~208-279, con sus comentarios).

- [ ] **Step 2: Registrar las dos tools nuevas**

En el lugar donde estaban, agrega:

```ts
// Gantt GENERAL (pm-gantt): lee los planes de desarrollo agrupados por responsable + pendientes.
// Solo lectura; enriquece por join a pm_projects (folio_prd → prd_id → project_id → pm_index).
server.registerTool(
  "pm_planes_leer",
  {
    title: "Leer planes de desarrollo (gantt general)",
    description:
      "Devuelve los planes de desarrollo (tabla global pm_plan_desarrollo) AGRUPADOS por " +
      "responsable, más la lista de 'pendientes' (aprobados sin fecha). Cada plan viene " +
      "enriquecido por join a pm_projects (nombre, unidad, project_id) cuando el folio empata " +
      "un prd_id. Úsalo desde /pm-gantt para consultar y para pintar manager/gantt/general.html. " +
      "Filtra por estatus (p.ej. ['Aprobado']) o responsable.",
    inputSchema: {
      estatus: z.array(z.string()).optional(),
      responsable: z.string().optional(),
    },
  },
  async ({ estatus, responsable }) => json(await repo.leerPlanes(estatus, responsable)),
);

// Programar un plan: escribe SOLO fecha_inicio/fecha_fin. Ninguna otra columna es escribible.
server.registerTool(
  "pm_plan_programar",
  {
    title: "Programar plan (asignar fechas)",
    description:
      "Asigna fechas a UN plan de desarrollo por su id: escribe SOLO fecha_inicio y fecha_fin " +
      "(YYYY-MM-DD). Es la ÚNICA escritura que /pm-gantt puede hacer sobre la tabla; nunca toca " +
      "estatus/responsable/dias/folio. Si omites fecha_fin queda = fecha_inicio (1 día); para " +
      "rangos multi-día calcula tú las fechas en días hábiles y pásalas ambas. Tras programar, " +
      "vuelve a pintar el HTML del gantt general.",
    inputSchema: {
      id: z.number().int(),
      fecha_inicio: z.string().describe("YYYY-MM-DD"),
      fecha_fin: z.string().optional().describe("YYYY-MM-DD; por defecto = fecha_inicio"),
    },
  },
  async ({ id, fecha_inicio, fecha_fin }) =>
    json(await repo.programarPlan(id, fecha_inicio, fecha_fin)),
);
```

- [ ] **Step 3: Propagar `prd_id` en `pm_indexar`**

En la tool `pm_indexar` (~151-206): (a) agrega `prd_id: z.string().optional()` al `inputSchema` (junto a `nombre`/`unidad`/`repo_url`); (b) desestructúralo en el handler; (c) pásalo a `registrarProyecto`:

```ts
    await repo.registrarProyecto({
      projectId: project_id,
      nombre: nombre ?? project_id,
      unidad,
      repoUrl: repo_url,
      prdId: prd_id,
    });
```

- [ ] **Step 4: Build de mcp**

Run: `pnpm --filter @pm-ai/mcp build && pnpm --filter @pm-ai/mcp typecheck`
Expected: sin errores.

- [ ] **Step 5: Build de todo el monorepo**

Run: `pnpm build && pnpm typecheck`
Expected: sin errores en ningún paquete.

- [ ] **Step 6: Commit** — diferido a `/guardar-cambios`.

---

### Task 4: Plantilla `gantt/general.html`

**Files:**
- Create: `gantt/general.html` (basado visualmente en `gantt/index.html`; NO modificar el original)

**Interfaces:**
- Consumes: la forma `window.GENERAL_DATA` (producida por `pm_planes_leer`, Task 1/3):
  ```js
  window.GENERAL_DATA = {
    generado: "<fecha-hora>", hoy: "YYYY-MM-DD",
    responsables: [ { nombre, planes: [ { id, folio, nombre, estatus, responsable, dias, fecha_inicio, fecha_fin, project_id, unidad } ] } ],
    pendientes: [ { id, folio, nombre, estatus, responsable, dias } ]
  }
  ```

- [ ] **Step 1: Copiar la base y renombrar el contrato de datos**

Run: `cp gantt/index.html gantt/general.html`
Luego, en `gantt/general.html`:
- Cambia `<title>` a `Gantt General · Planes de desarrollo`.
- Renombra el bloque de datos: `<script id="project-data">` → `<script id="general-data">` y su contenido a `window.GENERAL_DATA = { … }` con un ejemplo de 2 responsables (Alexis con un plan fechado, Alejandro con otro) y 1 pendiente, siguiendo la forma de arriba. Este ejemplo es el placeholder que el comando reemplaza al pintar.

- [ ] **Step 2: Reestructurar el render de filas: por persona, barra por PRD**

En el `<script>` de render de `gantt/general.html`, adapta la lógica (que hoy itera `gantt.tasks` con `track`/`objetivos`) para iterar `GENERAL_DATA.responsables`:
- **Eje temporal (calendario, fines de semana rayados, línea de "hoy"):** reutiliza `buildAxis`/`minT`/`maxT`/`idxOf`/`esFinde` tal cual, calculando el rango a partir de `min(fecha_inicio)`..`max(fecha_fin)` de TODOS los planes con fecha (más un margen), y `hoy` desde `GENERAL_DATA.hoy`.
- **Filas:** una **cabecera por responsable** (nombre) y, debajo, **una fila por plan con fechas** de ese responsable. La barra va de `fecha_inicio` a `fecha_fin`; etiqueta `PRD - {folio}` + (si `nombre`) ` · {nombre}`. Color de la barra por `estatus`: `Aprobado` (azul/base), `En curso` (ámbar), `Finalizado` (verde).
- **Sin objetivos ni % de avance** (eso era del particular): elimina `objetivosDe`, el cálculo de avance derivado y la "lista de objetivos" del pie; en su lugar, una sección **"Pendientes de programar"** que lista `GENERAL_DATA.pendientes` (folio · nombre · responsable · `dias` estimados).

- [ ] **Step 3: Verificación visual**

Run: `open gantt/general.html` (macOS)
Expected: se ven cabeceras por persona, barras por PRD sobre el calendario, la línea de "hoy", y la sección de pendientes. Sin errores en consola del navegador.

- [ ] **Step 4: Commit** — diferido a `/guardar-cambios`.

---

### Task 5: Comando `/pm-gantt` reformulado (gantt general)

**Files:**
- Modify: `commands/pm-gantt.md` (reescritura completa)

**Interfaces:**
- Consumes: tools `pm_planes_leer`, `pm_plan_programar` (Task 3); plantilla `gantt/general.html` (Task 4).

- [ ] **Step 1: Reescribir `commands/pm-gantt.md`**

Reemplaza el contenido por un comando orientado al PM con este contrato (frontmatter + cuerpo):
- **Frontmatter:** `description` en tono PM (gestiona el gantt GENERAL de planes de desarrollo: consulta estados y programa fechas; solo lee y solo escribe fechas). `allowed-tools`: `Read, Write, Edit, Bash, mcp__pm-ai__pm_planes_leer, mcp__pm-ai__pm_plan_programar` (quita las 4 `pm_gantt_*`; ya no usa `pm_gantt_leer` etc.). `argument-hint: "[consulta o instrucción de programación]"`.
- **Alcance explícito (regla dura):** el comando SOLO lee la tabla y SOLO modifica `fecha_inicio`/`fecha_fin`; nunca crea filas ni toca estatus/responsable/dias/folio (eso lo alimentan los desarrolladores).
- **Flujo:**
  1. Lee hoy: `date +%F`. Lee los planes con `pm_planes_leer` (opcional filtrar por estatus/responsable). Resume por estatus y separa fechados vs pendientes.
  2. **Consultar** ("¿qué planes están aprobados?"): responde desde `pm_planes_leer(['Aprobado'])`.
  3. **Programar** ("programa el plan 1 para el 3 de julio", "el plan 6 del 27 al 30"): identifica el plan por `id`; si solo hay inicio, deriva `fecha_fin` sumando `dias` **en días hábiles** (L–V) desde el inicio; **propón** las fechas → confirmación → `pm_plan_programar(id, fecha_inicio, fecha_fin)`.
  4. **Repintar** `manager/gantt/general.html`: si falta, `mkdir -p manager/gantt && cp "${CLAUDE_PLUGIN_ROOT}/gantt/general.html" manager/gantt/general.html`. Luego `pm_planes_leer` → reemplaza el contenido entre `<script id="general-data">` y `</script>` por `window.GENERAL_DATA = <JSON>;` (agregando `generado` y `hoy`). No toques el resto del HTML.
  5. Abre: `open manager/gantt/general.html`.
- **Fuera de alcance (nota):** el gantt particular (tareas+objetivos por proyecto) está retirado temporalmente; se rediseñará después.

- [ ] **Step 2: Revisión manual del comando**

Verifica que el frontmatter no mencione tools inexistentes y que las reglas de alcance (solo fechas) queden explícitas. (No hay test automatizado para comandos.)

- [ ] **Step 3: Commit** — diferido a `/guardar-cambios`.

---

### Task 6: Propagación de `prd_id` en `/pm-init` y `/guardar-cambios` + seed + docs

**Files:**
- Modify: `commands/pm-init.md` (llamada a `pm_indexar`)
- Modify: `commands/guardar-cambios.md` (llamada a `pm_indexar`)
- Create: `scripts/seed-plan-desarrollo.mjs`
- Modify: `CLAUDE.md`, `plantillas/CLAUDE.md`, `README.md` (secciones de Gantt)

**Interfaces:**
- Consumes: tool `pm_indexar` con `prd_id` (Task 3); tabla `pm_plan_desarrollo` (Task 1).

- [ ] **Step 1: Pasar `prd_id` al indexar**

En `commands/pm-init.md` y `commands/guardar-cambios.md`, donde instruyen la llamada a `pm_indexar`, añade que se pase `prd_id` leído de `manager/config.json` (si existe) para que `pm_projects.prd_id` quede poblado y el enlace del gantt general funcione. (Grep: `grep -n "pm_indexar" commands/pm-init.md commands/guardar-cambios.md`.)

- [ ] **Step 2: Script de seed para pruebas**

Crea `scripts/seed-plan-desarrollo.mjs` que inserte las 7 filas del Excel de la reunión (fuera del contrato del plugin, solo para pruebas del PM mientras Alexis aún no alimenta la tabla):

```javascript
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
```

Run: `DATABASE_URL="$DATABASE_URL" node scripts/seed-plan-desarrollo.mjs`
Expected: `Seed listo: 7 planes insertados.`

- [ ] **Step 3: Actualizar la documentación del Gantt**

- `CLAUDE.md` (raíz) y `plantillas/CLAUDE.md`: reemplaza la sección del Gantt/tablero (`pm_gantt*`) por la del **gantt general** (tabla `pm_plan_desarrollo`, alcance solo-lectura+fechas, `manager/gantt/general.html`, enlace por `prd_id`). Nota que el particular queda para después.
- `README.md`: fila de `/pm-gantt` → "Gantt general de planes de desarrollo (consulta estados; programa fechas)".

- [ ] **Step 4: Verificar el gantt general de punta a punta (opcional, con DB real)**

Con el seed cargado, corre `/pm-gantt` mentalmente/manual: `pm_planes_leer(['Aprobado'])` debe devolver PJ6215 y PJ6220 en pendientes (sin fecha); programa uno y confirma que `manager/gantt/general.html` se repinta.

- [ ] **Step 5: Commit** — cierre completo con `/guardar-cambios` (git + índice sincronizados), incluyendo el spec y este plan.

---

## Self-Review

**1. Spec coverage:**
- Alcance `/pm-gantt` (solo leer + fechas) → Task 3 (tool `pm_plan_programar` escribe solo fechas) + Task 5 (regla dura en el comando). ✓
- DROP `pm_gantt*` → Task 1 Step 1. ✓
- `pm_plan_desarrollo` + índices → Task 1. ✓
- `prd_id` en `pm_projects` + propagación → Task 1 (columna) + Task 2 (registrarProyecto) + Task 3 (pm_indexar) + Task 6 (comandos). ✓
- Enlace 3 tablas (join folio→prd_id) → Task 1 (`pm_planes_leer`) + verificación Task 1 Step 3. ✓
- Tools nuevas / retiro de viejas → Task 2 (repo) + Task 3 (MCP). ✓
- Plantilla `general.html` (por persona, barras PRD, pendientes) → Task 4. ✓
- Comando reformulado → Task 5. ✓
- Seed de pruebas → Task 6. ✓
- Docs → Task 6. ✓

**2. Placeholder scan:** Sin "TBD/TODO". El único texto no-código es la descripción estructural de `general.html` (Task 4) y el comando (Task 5), donde el contrato de datos y las transformaciones están explícitos; se construyen adaptando `index.html`/patrones existentes, no desde cero ciego.

**3. Type consistency:** `leerPlanes(estatus?: string[], responsable?)` / `programarPlan(id: number, fechaInicio, fechaFin?)` coinciden entre Task 2 (repo), Task 3 (tools `pm_planes_leer`/`pm_plan_programar`) y los RPCs de Task 1 (`p_estatus text[]`, `p_id bigint`, `p_fecha_inicio/p_fecha_fin date`). La forma `GENERAL_DATA` es idéntica entre Task 1 (RPC), Task 4 (plantilla) y Task 5 (repintado). `prdId`/`prd_id` consistente en Task 1/2/3/6.
