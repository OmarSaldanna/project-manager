# Diseño: Gantt general (planes de desarrollo)

Fecha: 2026-07-03
Estado: aprobado (pendiente de implementar)

## Contexto y motivación

El Gantt actual del plugin es **estrictamente por-proyecto**: cada repo tiene su `manager/`, su
`project_id`, y un Gantt de **tareas + objetivos** dentro de ese único proyecto (tablas
`pm_gantt`, `pm_gantt_tarea`, `pm_gantt_objetivo`). Eso es, en la nueva terminología, el Gantt
**particular**.

En la reunión del 2026-07-02 (Alexis, jefe de desarrollo; Omar, autor del plugin del lado PM) se
definió un segundo Gantt, el **general**: una vista **cross-proyecto y cross-desarrollador** del
orden y los tiempos de todos los desarrollos, segmentada **por persona**, mostrando quién está a
cargo de qué PRD y cuándo. Referencias: el transcript de esa reunión y la foto del Excel que
definieron (tabla `plan_desarrollo` + mock del Gantt por persona).

**Foco de este diseño: solo el Gantt general.** El particular se rediseña en una fase posterior.

## Decisiones

1. **Alcance de `/pm-gantt` (reformulado a general):** el comando queda limitado a **dos
   capacidades**: (a) **leer** la tabla de planes; (b) **modificar únicamente** las columnas de
   fecha (`fecha_inicio` / `fecha_fin`) de un plan existente. **Nunca** hace `INSERT` ni toca
   `estatus` / `responsable` / `dias` / `folio_prd`. Esa parte la alimentan los desarrolladores
   por SQL directo a Supabase (acordado con Alexis).
2. **Reparto de responsabilidades:** el PM aprueba el PRD; el desarrollador aprueba el plan de
   desarrollo. El PM tiene las **prioridades**, por eso es quien asigna las **fechas**.
3. **Dónde vive el HTML:** el general se renderiza en `manager/gantt/general.html` del proyecto
   donde el PM esté trabajando. El **dato es global** (la tabla agrega todos los proyectos/devs);
   el HTML es solo el punto de render. El particular sigue en `manager/gantt/index.html`.
4. **Enlace entre tablas:** cada fila de planes puede relacionarse con `pm_projects` y, a través
   de ella, con el índice de código `pm_index`. La llave de negocio es el **folio del PRD**
   (`PJ6215`), que coincide con `prd_id` de `config.json` (`folio_prd = 'PJ' || prd_id`).
5. **Tabla:** nombre confirmado `pm_plan_desarrollo`. Se persiste `prd_id` en `pm_projects`
   (hoy solo vive en `config.json`) como puente del enlace.

## Modelo de datos

### Se ELIMINA (Gantt particular actual)

`DROP` de: tablas `pm_gantt`, `pm_gantt_tarea`, `pm_gantt_objetivo`; vistas
`pm_gantt_tarea_avance`, `pm_gantt_resumen`; funciones `pm_gantt_guardar`, `pm_gantt_leer`,
`pm_gantt_objetivo_guardar`, `pm_gantt_objetivo_eliminar`. Se reconstruirá cuando toque el
particular.

### Se AGREGA

```sql
-- Puente: persistir prd_id (hoy solo en config.json) para unir folio ↔ proyecto ↔ índice.
alter table pm_projects add column if not exists prd_id text;
create index if not exists idx_projects_prd on pm_projects (prd_id);

-- Tabla global de planes de desarrollo (1 fila por plan, ligada a un PRD por folio).
create table if not exists pm_plan_desarrollo (
  id            bigint generated always as identity primary key,
  folio_prd     text not null,                        -- "PJ6215" — llave de enlace; la pone el dev
  estatus       text not null default 'No aprobado',  -- No aprobado | Aprobado | En curso | Finalizado
  responsable   text not null,                        -- desarrollador (Alexis, Juan Carlos…)
  dias          int,                                  -- estimación del dev (días hábiles)
  fecha_inicio  date,                                 -- SOLO el plugin (PM) la escribe
  fecha_fin     date,                                 -- SOLO el plugin (PM); se deriva de dias si falta
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_plan_folio on pm_plan_desarrollo (folio_prd);
```

Notas de modelo:
- **Global** (sin `project_id` propio): la fila vive en el eje org-wide. No duplica
  `nombre`/`unidad`; los trae por join.
- `folio_prd` **no** es único: permite re-planear el mismo PRD. Los planes se referencian por
  `id` (como en el Excel: "el plan 1", "el plan 6").
- `estatus` es texto (no enum) para no arrastrar migraciones de tipo, igual que `magnitud_cambio`
  en `pm_index`.

### Enlace entre las tres tablas

```
pm_plan_desarrollo.folio_prd
        │  (folio_prd = 'PJ' || prd_id)
        ▼
   pm_projects.prd_id ─────► pm_projects.project_id
                                     │  (mismo project_id)
                                     ▼
                               pm_index.project_id   ← entidades de código del desarrollo
```

Desde una fila del plan se alcanza nombre, unidad, repo y descripción del proyecto, y todo su
índice de código. Si el folio aún no tiene proyecto indexado (sin fila en `pm_projects` con ese
`prd_id`), el join no enriquece y la etiqueta cae a `PRD - PJ6215`: la relación es una
**posibilidad** que se activa en cuanto los `prd_id` empatan.

## Tools MCP

**Se retiran** las cuatro `pm_gantt_*`.

**Se agregan dos** (contrato mínimo, alineado con el alcance del comando):

- `pm_planes_leer(estatus?, responsable?)` — solo lectura. Devuelve el JSON **agrupado por
  responsable**, cada plan **enriquecido por join** (nombre, unidad, project_id del proyecto
  ligado). Es la fuente para pintar `general.html`.
- `pm_plan_programar(id, fecha_inicio, fecha_fin?)` — **actualiza solo** `fecha_inicio` /
  `fecha_fin` (y `updated_at`). Si `fecha_fin` es null y hay `dias`, la deriva sumando días
  hábiles. No puede escribir ninguna otra columna.

## Plantilla `gantt/general.html`

- **NO se toca** `gantt/index.html` (queda congelada como base del futuro particular).
- Nueva `gantt/general.html`, misma identidad visual (calendario, fines de semana rayados, línea
  vertical de "hoy"), reestructurada:
  - Filas **agrupadas por persona** (`responsable`).
  - Bajo cada persona, **una barra por plan con fechas asignadas**, coloreada por `estatus`
    (`Aprobado` / `En curso` / `Finalizado`).
  - Etiqueta de barra: `PRD - {folio} [nombre]` (nombre del join; si no hay, solo el folio).
  - Sección "**Pendientes de programar**": planes aprobados aún sin fecha.
- Dato embebido (reflejo de la DB, mismo patrón que hoy):

```js
window.GENERAL_DATA = {
  generado: "<fecha-hora>",
  hoy: "YYYY-MM-DD",
  responsables: [
    { nombre: "Alexis Salvador Herrera García",
      planes: [
        { id: 1, folio: "PJ6215", nombre: "…", estatus: "Aprobado",
          fecha_inicio: "2026-07-03", fecha_fin: "2026-07-03", dias: 1 }
      ] }
  ],
  pendientes: [ /* aprobados sin fecha */ ]
}
```

## Comando `/pm-gantt` reformulado

Flujo, 100% orientado al PM (no pide `project_id`, es global):

1. Lee `pm_plan_desarrollo` vía `pm_planes_leer`. Resume: cuántos planes por estatus, cuáles ya
   tienen fecha y cuáles no.
2. **Consultar** — p. ej. "¿Qué planes de desarrollo ya están aprobados?" → responde desde la DB.
3. **Programar** — p. ej. "programa el plan 1 para el 3 de julio", "el plan 6 del 27 al 30 de
   julio". Propone las fechas (si solo hay inicio, deriva el fin con `dias`) → confirmación del
   PM → `pm_plan_programar` → **repinta** `manager/gantt/general.html`.
4. Abre el dashboard.

Regla transversal (de CLAUDE.md): flujo **propuesta → revisión → confirmación** siempre; el
comando nunca modifica más que las fechas.

## Propagación de `prd_id`

`prd_id` deja de vivir solo en `config.json`: `/pm-init` y `resolve-id` empiezan a persistirlo en
`pm_projects.prd_id` para que el enlace exista en la DB. (Detalle fino: definirlo en el plan de
implementación — dónde exactamente se escribe.)

## Migración / pruebas

- Migración: aplicar el `DROP` del bloque `pm_gantt_*` y el `CREATE` del bloque general en
  `packages/core/src/schema.sql` (idempotente donde aplique) y correr contra la DB.
- Seed para pruebas del PM mientras Alexis aún no alimenta la tabla: un **script SQL de seed**
  aparte (fuera del contrato del plugin), con las 7 filas del Excel.

## Fuera de alcance (por ahora)

- Gantt **particular** (tareas + objetivos por proyecto): se rediseña después.
- Versionado de cambios (PRD cambia, plan cambia): fase 2 (acordado como MVP camino feliz).
- Notificaciones automáticas / comunicación PM↔dev por el programa: sigue siendo persona a
  persona.

## Supuestos confirmados

- Alcance `/pm-gantt`: leer + solo fechas. ✓
- Nombre de tabla: `pm_plan_desarrollo`. ✓
- Agregar `prd_id` a `pm_projects`. ✓
- `folio_prd` no único; planes referenciados por `id`. ✓
