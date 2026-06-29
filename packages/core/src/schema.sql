-- PM·AI — Esquema unificado (código + documentación) en Supabase / Postgres + pgvector.
-- Ver prompt.md §6. Cada fila es UNA VERSIÓN de un símbolo de código o un chunk de doc.

create extension if not exists vector;

do $$ begin
  create type pm_tipo as enum (
    'funcion',          -- función / método de código
    'endpoint',         -- ruta de API
    'reporte',          -- HTML entregable generado para distribuir
    'pagina',           -- HTML de UI: 404, landing, dashboard/tablero…
    'markdown_chunk',   -- fragmento de un markdown (PRD, transcript, update, doc)
    'json',
    'yaml',
    'config',           -- otros archivos de configuración
    'ejecutable',       -- main.py, index.*, .sh y otros ejecutables
    'query',            -- archivo SQL (.sql/.psql/…)
    'estilos'           -- hoja de estilos (.css/.scss/.sass/.less/…)
  );
exception when duplicate_object then null; end $$;

-- El bloque anterior solo corre en una DB nueva; sobre un enum YA existente queda
-- inerte (duplicate_object). Para DBs ya creadas, agregamos los valores nuevos de
-- forma idempotente. (ADD VALUE IF NOT EXISTS no puede ir dentro del create type.)
alter type pm_tipo add value if not exists 'pagina';
alter type pm_tipo add value if not exists 'query';
alter type pm_tipo add value if not exists 'estilos';

create table if not exists pm_index (
  id            bigint generated always as identity primary key,
  project_id    text        not null,
  entity_id     text        not null,                 -- identidad lógica estable
  is_current    boolean     not null default true,    -- SCD Type 2
  tipo          pm_tipo     not null,
  commit_sha    text        not null,
  content_hash  text        not null,                 -- gate de re-versionado
  nombre        text        not null,
  descripcion   text        not null,                 -- código: ≤2 oraciones | markdown_chunk: contenido
  librerias     text[]      not null default '{}',
  dependencias  text[]      not null default '{}',    -- formato {archivo}.{funcion}
  archivo       text        not null,
  ruta          text        not null,
  created_at    timestamptz not null,
  deleted       boolean     not null default false,
  embedding     vector(1536),
  detalles      jsonb,                                  -- detalle estructural determinista (NO se embebe)
  cobertura     real                                    -- ratio de líneas del archivo cubiertas (0..1), solo código
);

-- Columnas nuevas idempotentes para DBs ya creadas (no rompe instalaciones previas).
alter table pm_index add column if not exists detalles  jsonb;
alter table pm_index add column if not exists cobertura real;
-- Texto compuesto que se embebe (nombre + ruta + descripcion + firma + constantes/valores +
-- valores de config + librerías). Se persiste para el canal LÉXICO de la búsqueda híbrida:
-- el vector resuelve paráfrasis; el léxico (tsvector) rescata identificadores/valores exactos.
alter table pm_index add column if not exists texto_busqueda text;

-- Trazabilidad del CAMBIO (no solo del estado). Cada versión registra qué cambió respecto a su
-- predecesora, convirtiendo pm_traza en un changelog por entidad (no solo "existió en N commits").
--   cambio          : resumen en lenguaje natural del delta (null en altas).
--   hash_anterior   : content_hash del predecesor (misma entity_id) — ancla el diff y encadena
--                     la historia. Invariante: hash_anterior[N] = content_hash[N+1].
--   magnitud_cambio : cosmetico|firma|logica|mixto|eliminado (texto, no enum: sin migración de tipo).
--   cuerpo          : cuerpo enmascarado y acotado, base para diffear contra la siguiente versión.
--                     Server-side: NO se devuelve en las tools (peso/ruido, como el embedding).
alter table pm_index add column if not exists cambio          text;
alter table pm_index add column if not exists hash_anterior   text;
alter table pm_index add column if not exists magnitud_cambio text;
alter table pm_index add column if not exists cuerpo          text;

-- Patrón de acceso dominante: estado actual por proyecto y tipo.
create index if not exists idx_current on pm_index (project_id, tipo)
  where is_current and not deleted;

-- Traza histórica por identidad lógica.
create index if not exists idx_entity on pm_index (entity_id, created_at desc);

-- Búsqueda semántica (coseno). Se usa HNSW en vez de IVFFLAT: con IVFFLAT(lists=100) sobre
-- proyectos de cientos de filas quedaban ~1-3 filas por lista y, con ivfflat.probes=1 (default),
-- la búsqueda examinaba ~1 lista → recall destruido (devolvía 0-5 resultados sin relación con la
-- semántica). HNSW da alto recall por defecto (ef_search=40), escala sin tunear lists/probes y,
-- con pgvector ≥0.8, sus iterative scans evitan los vacíos al filtrar por tipo.
drop index if exists idx_embed;
create index if not exists idx_embed on pm_index
  using hnsw (embedding vector_cosine_ops);

-- Canal léxico de la búsqueda híbrida: GIN sobre el tsvector del texto compuesto. Config
-- 'simple' (sin stemming/stopwords) para que identificadores y valores exactos —PUBLIC_PATHS,
-- config.json, Athena, nombres de tablas— hagan match literal. El vector cubre la paráfrasis.
create index if not exists idx_lexico on pm_index
  using gin (to_tsvector('simple', coalesce(texto_busqueda, '')))
  where is_current and not deleted;

-- Una sola versión vigente por identidad lógica (defensa de integridad).
create unique index if not exists idx_one_current on pm_index (entity_id)
  where is_current;

-- Registro de proyectos. NO se crea una tabla por proyecto: se registra una FILA.
-- `unidad` agrupa accesos por unidad de negocio (Engine, Go Virtual...) — base del
-- modelo de permisos de fase 2.
create table if not exists pm_projects (
  project_id  text primary key,
  nombre      text not null,
  unidad      text,
  repo_url    text,
  descripcion text,
  estado      text not null default 'activo',  -- activo | cerrado | futuro
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- SEAM fase 2 (multi-usuario con RLS): cuando los usuarios finales se conecten con su
-- propia identidad (no la service_role key), se activa una tabla de membresía + políticas
-- RLS que filtran pm_index por proyectos a los que el usuario pertenece. Bosquejo:
--   create table pm_members (project_id text, user_id uuid, rol text);  -- rol: lector|editor
--   alter table pm_index enable row level security;
--   create policy lectura on pm_index for select using (
--     project_id in (select project_id from pm_members where user_id = auth.uid()));
-- En el MVP el MCP usa service_role (bypassa RLS): el control de acceso es por credenciales.

-- RPC de búsqueda HÍBRIDA (vector + léxico) con Reciprocal Rank Fusion. Solo vigentes.
-- El embedding entra como texto JSON ('[0.1,...]') y se castea a vector — robusto vía PostgREST.
-- `p_query_text` es el texto crudo de la consulta para el canal léxico; si es null/'' la función
-- degrada a VECTOR PURO (retrocompatible con clientes que aún no lo envían). RRF: cada documento
-- suma 1/(k+rank) de cada lista en la que aparece (k=60), lo que combina ambos rankings sin
-- necesidad de calibrar escalas heterogéneas (distancia coseno vs ts_rank).
create or replace function pm_buscar(
  p_project_id text,
  p_query_embedding text,
  p_tipos pm_tipo[] default null,
  p_limit int default 8,
  p_query_text text default null
)
returns table (
  id bigint, entity_id text, tipo pm_tipo, nombre text, descripcion text,
  archivo text, ruta text, librerias text[], dependencias text[],
  commit_sha text, created_at timestamptz, distancia float
)
language sql stable as $$
  with base as (
    select i.* from pm_index i
    where i.project_id = p_project_id
      and i.is_current and not i.deleted
      and (p_tipos is null or i.tipo = any(p_tipos))
  ),
  vec as (  -- ranking por cercanía vectorial (coseno)
    select b.id,
           row_number() over (order by b.embedding <=> p_query_embedding::vector(1536)) as r,
           (b.embedding <=> p_query_embedding::vector(1536)) as dist
    from base b
    where b.embedding is not null
    order by b.embedding <=> p_query_embedding::vector(1536)
    limit 40
  ),
  q as (  -- tsquery OR: matchea docs con CUALQUIER término (plainto_tsquery los une con AND,
          -- demasiado estricto para consultas naturales largas). ts_rank_cd rankea por relevancia.
    select nullif(replace(plainto_tsquery('simple', coalesce(p_query_text, ''))::text, '&', '|'), '')::tsquery as query
  ),
  lex as (  -- ranking léxico (solo si hay texto de consulta y hace match)
    select b.id,
           row_number() over (
             order by ts_rank_cd(to_tsvector('simple', coalesce(b.texto_busqueda, '')), q.query) desc
           ) as r
    from base b, q
    where q.query is not null
      and to_tsvector('simple', coalesce(b.texto_busqueda, '')) @@ q.query
    limit 40
  ),
  fused as (
    select coalesce(v.id, l.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + l.r), 0) as score,
           v.dist
    from vec v
    full outer join lex l on v.id = l.id
  )
  select i.id, i.entity_id, i.tipo, i.nombre, i.descripcion,
         i.archivo, i.ruta, i.librerias, i.dependencias,
         i.commit_sha, i.created_at,
         coalesce(f.dist, i.embedding <=> p_query_embedding::vector(1536)) as distancia
  from fused f
  join pm_index i on i.id = f.id
  order by f.score desc
  limit p_limit;
$$;

-- Versiona un símbolo/chunk de forma ATÓMICA con gate de content_hash (D5).
-- Devuelve: 'unchanged' (no cambió) | 'created' (alta) | 'versioned' (nueva versión).
-- La firma cambió (se añadieron p_detalles/p_cobertura/p_texto_busqueda y luego
-- p_cambio/p_hash_anterior/p_magnitud_cambio/p_cuerpo): create-or-replace no puede alterar la
-- lista de argumentos, así que se elimina cada firma previa primero.
drop function if exists pm_upsert_version(
  text, text, pm_tipo, text, text, text, text, text[], text[], text, text, timestamptz, text
);
drop function if exists pm_upsert_version(
  text, text, pm_tipo, text, text, text, text, text[], text[], text, text, timestamptz, text, jsonb, real
);
drop function if exists pm_upsert_version(
  text, text, pm_tipo, text, text, text, text, text[], text[], text, text, timestamptz, text, jsonb, real, text
);
create or replace function pm_upsert_version(
  p_project_id text, p_entity_id text, p_tipo pm_tipo, p_commit_sha text,
  p_content_hash text, p_nombre text, p_descripcion text,
  p_librerias text[], p_dependencias text[], p_archivo text, p_ruta text,
  p_created_at timestamptz, p_embedding text,
  p_detalles jsonb default null, p_cobertura real default null,
  p_texto_busqueda text default null,
  p_cambio text default null, p_hash_anterior text default null,
  p_magnitud_cambio text default null, p_cuerpo text default null
) returns text language plpgsql as $$
declare
  v_cur record;
  v_existed boolean;  -- captura la existencia ANTES del insert; FOUND se reescribe con cada DML.
begin
  select id, content_hash, tipo, deleted into v_cur
  from pm_index where entity_id = p_entity_id and is_current;
  v_existed := found;

  -- Gate de re-versionado: el cuerpo (content_hash) Y la clasificación (tipo) deben
  -- coincidir. Una reclasificación (p.ej. funcion → endpoint) con cuerpo idéntico
  -- también amerita una nueva versión.
  if v_existed and v_cur.content_hash = p_content_hash and v_cur.tipo = p_tipo
     and not v_cur.deleted then
    return 'unchanged';
  end if;

  if v_existed then
    update pm_index set is_current = false where id = v_cur.id;
  end if;

  insert into pm_index (project_id, entity_id, is_current, tipo, commit_sha,
    content_hash, nombre, descripcion, librerias, dependencias, archivo, ruta,
    created_at, deleted, embedding, detalles, cobertura, texto_busqueda,
    cambio, hash_anterior, magnitud_cambio, cuerpo)
  values (p_project_id, p_entity_id, true, p_tipo, p_commit_sha,
    p_content_hash, p_nombre, p_descripcion, p_librerias, p_dependencias, p_archivo, p_ruta,
    p_created_at, false, nullif(p_embedding, '')::vector(1536), p_detalles, p_cobertura, p_texto_busqueda,
    p_cambio, p_hash_anterior, p_magnitud_cambio, p_cuerpo);

  if v_existed then return 'versioned'; else return 'created'; end if;
end $$;

-- Inserta un tombstone (estado actual = borrado) preservando la historia (D9).
create or replace function pm_tombstone(
  p_entity_id text, p_commit_sha text, p_created_at timestamptz
) returns boolean language plpgsql as $$
declare v_cur record;
begin
  select * into v_cur from pm_index where entity_id = p_entity_id and is_current;
  if not found or v_cur.deleted then return false; end if;
  update pm_index set is_current = false where id = v_cur.id;
  -- El tombstone también es un evento de la traza: ancla al último contenido vigente
  -- (hash_anterior) y lo marca como eliminación, para que pm_traza muestre la desaparición.
  insert into pm_index (project_id, entity_id, is_current, tipo, commit_sha,
    content_hash, nombre, descripcion, librerias, dependencias, archivo, ruta,
    created_at, deleted, embedding, detalles, cobertura, texto_busqueda,
    cambio, hash_anterior, magnitud_cambio, cuerpo)
  values (v_cur.project_id, p_entity_id, true, v_cur.tipo, p_commit_sha,
    'DELETED', v_cur.nombre, v_cur.descripcion, v_cur.librerias, v_cur.dependencias,
    v_cur.archivo, v_cur.ruta, p_created_at, true, null, v_cur.detalles, v_cur.cobertura, v_cur.texto_busqueda,
    'Entidad eliminada', v_cur.content_hash, 'eliminado', null);
  return true;
end $$;

-- ============================================================================
-- GANTT / PLANEACIÓN
-- ============================================================================
-- Persiste lo que hoy vive en gantt.js (window.PROJECT_DATA). Cuelga del MISMO
-- project_id que pm_index (el índice de código). Modelo:
--   PRD ──► pm_gantt (cabecera, 1:1) ──► pm_gantt_tarea (1:N) ──► pm_gantt_objetivo (1:N)
-- Regla clave: el AVANCE de una tarea NO se guarda; se DERIVA de cuántos de sus
-- objetivos están terminados (finished IS NOT NULL) → vista pm_gantt_tarea_avance.
-- La unidad de negocio ("empresa") NO se duplica aquí: vive en pm_projects.unidad.

-- Cabecera del gantt (1 fila por proyecto).
create table if not exists pm_gantt (
  project_id         text primary key
                       references pm_projects(project_id) on delete cascade,
  nombre             text not null,        -- project.name
  code               text,                 -- project.code (firma del reporte)
  descripcion        text,                 -- project.description
  manager            text,                 -- responsable
  status_done        text,                 -- texto de estado "Finalizado"
  status_in_progress text,                 -- texto de estado "En progreso"
  objetivo_general   text,                 -- project.objective (nota interna)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Tareas del cronograma (1:N). Barras del tablero, por fechas (días hábiles).
-- El % de avance y "terminada" se DERIVAN de los objetivos (ver vista abajo): NO se guardan.
create table if not exists pm_gantt_tarea (
  id           bigint generated always as identity primary key,
  project_id   text not null references pm_projects(project_id) on delete cascade,
  tarea_id     text not null,              -- id local estable ("g1", "g2", …)
  nombre       text not null,
  track        text,                       -- categoría/equipo (etiqueta)
  fecha_inicio date,                       -- start (YYYY-MM-DD)
  fecha_fin    date,                       -- end (inclusivo)
  orden        int  not null default 0,    -- orden vertical en el tablero
  unique (project_id, tarea_id)
);
create index if not exists idx_gantt_tarea on pm_gantt_tarea (project_id, orden);

-- Objetivos (1:N) que DESGLOSAN una tarea. El avance de la tarea depende de cuántos
-- de SUS objetivos están terminados. "Completado" = finished IS NOT NULL.
create table if not exists pm_gantt_objetivo (
  id          bigint generated always as identity primary key,
  project_id  text not null,
  objetivo_id text not null,               -- id local estable ("o1", "o2", …)
  tarea_id    text not null,               -- tarea a la que pertenece (id local)
  titulo      text not null,
  descripcion text,
  planned     date,                        -- día planeado de completarse (según el plan)
  finished    date,                        -- día real en que se completó (null = pendiente)
  orden       int  not null default 0,
  unique (project_id, objetivo_id),
  foreign key (project_id, tarea_id)
    references pm_gantt_tarea (project_id, tarea_id) on delete cascade
);
create index if not exists idx_gantt_objetivo on pm_gantt_objetivo (project_id, tarea_id, orden);

-- Vista: avance POR TAREA derivado de sus objetivos (single source of truth).
--   objetivos_total / objetivos_hechos, progreso 0-100, finished (todas hechas).
create or replace view pm_gantt_tarea_avance as
select t.project_id, t.tarea_id, t.nombre, t.track, t.fecha_inicio, t.fecha_fin, t.orden,
       count(o.*)                              as objetivos_total,
       count(o.finished)                       as objetivos_hechos,
       case when count(o.*) = 0 then 0
            else round(100.0 * count(o.finished) / count(o.*)) end as progreso,
       (count(o.*) > 0 and count(o.*) = count(o.finished)) as finished
from pm_gantt_tarea t
left join pm_gantt_objetivo o
  on o.project_id = t.project_id and o.tarea_id = t.tarea_id
group by t.project_id, t.tarea_id, t.nombre, t.track, t.fecha_inicio, t.fecha_fin, t.orden;

-- Vista: resumen POR PROYECTO (insights rápidos). Subconsultas escalares para no
-- multiplicar filas al cruzar tareas × objetivos.
create or replace view pm_gantt_resumen as
select g.project_id, g.nombre, p.unidad as empresa, g.manager,
  (select count(*) from pm_gantt_tarea t where t.project_id = g.project_id) as tareas,
  (select count(*) from pm_gantt_objetivo o where o.project_id = g.project_id) as objetivos,
  (select count(*) from pm_gantt_objetivo o
     where o.project_id = g.project_id and o.finished is not null) as objetivos_hechos,
  (select count(*) from pm_gantt_objetivo o
     where o.project_id = g.project_id and o.finished is null
       and o.planned is not null and o.planned < current_date) as objetivos_atrasados,
  (select min(fecha_inicio) from pm_gantt_tarea t where t.project_id = g.project_id) as inicio,
  (select max(fecha_fin)    from pm_gantt_tarea t where t.project_id = g.project_id) as fin,
  (select coalesce(round(avg(progreso)), 0) from pm_gantt_tarea_avance av
     where av.project_id = g.project_id) as avance_global
from pm_gantt g
left join pm_projects p on p.project_id = g.project_id;

-- Guarda (REEMPLAZA) el Gantt completo de un proyecto desde el JSON de gantt.js.
-- Upsert de cabecera + reemplazo total de tareas y objetivos. Reconcilia empresa→pm_projects.unidad.
--   p_project: el objeto `project` de gantt.js (incluye `empresa` y `status{done,inProgress}`).
--   p_tasks  : `gantt.tasks` (cada tarea con su arreglo `objetivos`).
-- Devuelve el conteo de tareas/objetivos guardados. El % de avance NO se guarda (se deriva).
create or replace function pm_gantt_guardar(
  p_project_id text,
  p_project jsonb default '{}'::jsonb,
  p_tasks jsonb default '[]'::jsonb
) returns jsonb language plpgsql as $$
declare
  v_t jsonb; v_o jsonb;
  v_tareas int := 0; v_objs int := 0;
  v_empresa text := nullif(p_project->>'empresa', '');
begin
  -- el proyecto debe existir en pm_projects (misma referencia que el índice de código)
  insert into pm_projects (project_id, nombre)
  values (p_project_id, coalesce(nullif(p_project->>'name',''), p_project_id))
  on conflict (project_id) do nothing;
  if v_empresa is not null then
    update pm_projects set unidad = v_empresa, updated_at = now() where project_id = p_project_id;
  end if;

  -- cabecera (1:1)
  insert into pm_gantt (project_id, nombre, code, descripcion, manager,
                        status_done, status_in_progress, objetivo_general, updated_at)
  values (p_project_id, coalesce(p_project->>'name',''), p_project->>'code',
          p_project->>'description', p_project->>'manager',
          p_project->'status'->>'done', p_project->'status'->>'inProgress',
          p_project->>'objective', now())
  on conflict (project_id) do update set
    nombre=excluded.nombre, code=excluded.code, descripcion=excluded.descripcion,
    manager=excluded.manager, status_done=excluded.status_done,
    status_in_progress=excluded.status_in_progress, objetivo_general=excluded.objetivo_general,
    updated_at=now();

  -- reemplazo total (orden de borrado por FK: objetivos antes que tareas)
  delete from pm_gantt_objetivo where project_id = p_project_id;
  delete from pm_gantt_tarea   where project_id = p_project_id;

  for v_t in select value from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    insert into pm_gantt_tarea (project_id, tarea_id, nombre, track, fecha_inicio, fecha_fin, orden)
    values (p_project_id, v_t->>'id', coalesce(v_t->>'name',''), v_t->>'track',
            nullif(v_t->>'start','')::date, nullif(v_t->>'end','')::date, v_tareas);
    v_tareas := v_tareas + 1;
    for v_o in select value from jsonb_array_elements(coalesce(v_t->'objetivos', '[]'::jsonb)) loop
      insert into pm_gantt_objetivo (project_id, objetivo_id, tarea_id, titulo, descripcion, planned, finished, orden)
      values (p_project_id, v_o->>'id', v_t->>'id', coalesce(v_o->>'titulo',''),
              v_o->>'descripcion', nullif(v_o->>'planned','')::date, nullif(v_o->>'finished','')::date, v_objs);
      v_objs := v_objs + 1;
    end loop;
  end loop;

  return jsonb_build_object('project_id', p_project_id, 'tareas', v_tareas, 'objetivos', v_objs);
end $$;

-- Lee el Gantt de un proyecto y lo reconstruye con la MISMA forma que window.PROJECT_DATA
-- (project + gantt.tasks con objetivos anidados). Es la fuente para "pintar" el HTML: el
-- bloque de datos embebido en el dashboard es un reflejo de lo que devuelve esta función.
-- Las fechas salen como cadenas ISO "YYYY-MM-DD"; empresa = pm_projects.unidad.
create or replace function pm_gantt_leer(p_project_id text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'name', g.nombre, 'code', g.code, 'description', g.descripcion,
      'manager', g.manager, 'empresa', p.unidad,
      'status', jsonb_build_object('done', g.status_done, 'inProgress', g.status_in_progress),
      'objective', g.objetivo_general),
    'gantt', jsonb_build_object('tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.tarea_id, 'name', t.nombre, 'track', t.track,
        'start', t.fecha_inicio, 'end', t.fecha_fin,
        'objetivos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.objetivo_id, 'titulo', o.titulo, 'descripcion', o.descripcion,
            'planned', o.planned, 'finished', o.finished) order by o.orden)
          from pm_gantt_objetivo o
          where o.project_id = t.project_id and o.tarea_id = t.tarea_id), '[]'::jsonb))
        order by t.orden)
      from pm_gantt_tarea t where t.project_id = g.project_id), '[]'::jsonb)))
  from pm_gantt g
  left join pm_projects p on p.project_id = g.project_id
  where g.project_id = p_project_id;
$$;

-- CRUD de UN objetivo (lo usa el agente para agregar/editar). Upsert por (project_id, objetivo_id).
-- p_objetivo: { id, titulo, descripcion?, planned?, finished?, orden? }. La tarea debe existir.
create or replace function pm_gantt_objetivo_guardar(
  p_project_id text, p_tarea_id text, p_objetivo jsonb
) returns jsonb language plpgsql as $$
declare v_oid text := p_objetivo->>'id';
begin
  if v_oid is null or v_oid = '' then raise exception 'el objetivo necesita un id'; end if;
  if not exists (select 1 from pm_gantt_tarea where project_id = p_project_id and tarea_id = p_tarea_id) then
    raise exception 'la tarea % no existe en el proyecto %', p_tarea_id, p_project_id;
  end if;
  insert into pm_gantt_objetivo (project_id, objetivo_id, tarea_id, titulo, descripcion, planned, finished, orden)
  values (p_project_id, v_oid, p_tarea_id, coalesce(p_objetivo->>'titulo',''), p_objetivo->>'descripcion',
          nullif(p_objetivo->>'planned','')::date, nullif(p_objetivo->>'finished','')::date,
          coalesce((p_objetivo->>'orden')::int,
                   (select coalesce(max(orden)+1, 0) from pm_gantt_objetivo where project_id = p_project_id and tarea_id = p_tarea_id)))
  on conflict (project_id, objetivo_id) do update set
    tarea_id = excluded.tarea_id, titulo = excluded.titulo, descripcion = excluded.descripcion,
    planned = excluded.planned, finished = excluded.finished, orden = excluded.orden;
  return jsonb_build_object('project_id', p_project_id, 'tarea_id', p_tarea_id, 'objetivo_id', v_oid, 'accion', 'guardado');
end $$;

-- Elimina UN objetivo por id. Devuelve cuántos se borraron (0 si no existía).
create or replace function pm_gantt_objetivo_eliminar(p_project_id text, p_objetivo_id text)
returns jsonb language plpgsql as $$
declare v_n int;
begin
  delete from pm_gantt_objetivo where project_id = p_project_id and objetivo_id = p_objetivo_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('project_id', p_project_id, 'objetivo_id', p_objetivo_id, 'eliminados', v_n);
end $$;
