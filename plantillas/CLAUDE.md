# PM·AI — Project Manager con IA (Engine CX)

Este proyecto usa **PM·AI**. Eres el acompañante del proyecto de inicio a fin: mapeas,
documentas, mantienes el estado al día y respondes consultas **sin leer archivos ni el
repositorio completos** — navegas el índice (tools `pm_*`) y lees solo lo necesario.

## Comandos del plugin (qué hacen y cuándo)

- **`/pm-init`** — inicializa PM·AI en este repo: crea `manager/`, copia el
  tablero, prepara el `.gitignore` y hace el **primer indexado completo** del proyecto en
  la base de datos. Se corre una vez al adoptar PM·AI.
- **`/pm-prd`** — construye/mantiene el **PRD** (`manager/PRD.md`, **único** por proyecto)
  siguiendo los prompts de Engine: si ya existe lo continúa integrando el feedback de
  transcripts nuevos; si no, pregunta si partir de un PRD existente o crear uno nuevo. Define
  **qué** se construye y **por qué**. Procesa los transcripts en `manager/transcripts/`
  (originales) y `manager/transcripts-resumidos/` (condensados).
- **`/pm-gantt`** — gestiona el **gantt general** de planes de desarrollo: la vista
  **cross-proyecto y cross-desarrollador** que vive en la tabla global `pm_plan_desarrollo`
  (folio, estatus, responsable y días estimados los alimentan los desarrolladores por SQL
  directo). El comando **solo lee** los planes y **solo programa fechas** (en días hábiles),
  ligando cada plan a este proyecto por `folio_prd` → `prd_id`. El dashboard
  `manager/gantt/general.html` **embebe una copia** de la DB. El gantt **particular** (tareas
  y objetivos de este proyecto) queda **fuera de alcance por ahora**.
- **`/guardar-cambios`** — guarda tu avance: lo deja registrado en el **historial (commit[s]
  en git)** y actualiza la **memoria del proyecto** (`pm_index`) aplicando el criterio de
  Entidades de Código. Es el flujo de trabajo habitual cada vez que hay avances.
- **`/reporte-cambios`** — genera un **reporte HTML de bitácora** (en `manager/traces/`) con el
  **histórico de cambios**. Por defecto apunta a **`manager/PRD.md`**; también acepta una
  **entidad**, un **archivo** o un **commit**: línea de tiempo de versiones, qué cambió y el
  **diff por versión**. Útil para revisar la evolución del PRD o del código.

Implicación clave: el **código y la documentación se indexan** en una base de datos
externa; por eso navegas con las tools en vez de leer todo el repo.

## Estructura local (`manager/`)

Todo el estado de PM·AI vive bajo `manager/` (sin punto inicial, para que sea visible y
accesible también en Windows):

```
manager/
├─ PRD.md                   # EL PRD del proyecto (único). Sigue la plantilla de Engine.
├─ transcripts/             # transcripts/documentos originales
├─ transcripts-resumidos/   # condensados de cada transcript (insumo del PRD)
├─ gantt/                   # dashboard del gantt general (general.html con datos embebidos = reflejo de la DB)
├─ traces/                  # plantilla + bitácoras de traza generadas por /reporte-cambios
└─ config.json              # identidad del proyecto (project_id, unidad, sistema, prd_id, prd_dir)
```

**Versionado:** de `manager/` git versiona **únicamente `manager/PRD.md`**; el resto es
estado local y está ignorado (`manager/*` + `!manager/PRD.md` en `.gitignore`). El PRD es el
único artefacto del directorio que debe quedar versionado y accesible.

## Identidad del proyecto (`manager/config.json`) — FUENTE ÚNICA

Toda la metadata del proyecto vive SIEMPRE en `manager/config.json` (lo construye `/pm-init`).
Antes de pedirle CUALQUIERA de estos datos al usuario, **léelos de ahí**; nunca vuelvas a
preguntar lo que ya está. Solo pregunta si el dato **falta** y, tras confirmarlo, **persístelo
en `config.json`** (no lo dejes solo en la conversación).

**Manifiesto de `manager/config.json`:**

```json
{
  "project_id": "nuevos-endpoints",
  "unidad": "EngineCX",
  "sistema": "SIGA",
  "prd_id": "8145",
  "prd_dir": "SIGA/PJ8145-nuevos-endpoints"
}
```

| Campo | Qué es |
|---|---|
| `project_id` | nombre del **desarrollo** (mini-proyecto de cambios), en **slug** (minúsculas-guiones, sin espacios). Identidad para el índice de código y base del folder inferior. |
| `unidad` | división de negocio (una de las siete). Metadata; **no** forma parte del folder de `enginecx_prd`. |
| `sistema` | sistema/proyecto de la **empresa** (SIGA, Alfa, Omega, Autoexplora…). Folder **superior** en `enginecx_prd`. |
| `prd_id` | hash de 4 dígitos del `project_id` (lo calcula `resolve-id`). |
| `prd_dir` | ruta en `enginecx_prd`: `{sistema}/PJ{prd_id}-{project_id}` (lo calcula `resolve-id`). |

`project_id`, `unidad` y `sistema` los recolecta `/pm-init`; `prd_id` y `prd_dir` los agrega
`resolve-id`. No hay `nombre` ni `entregable` ni `repo_url`.

## Repo central de PRDs (`enginecx_prd`) — identidad git del `.env`

Todo `git` que toque `enginecx_prd` (clonar, commitear, pushear) se hace SIEMPRE con el bin
`prd-sync` (`node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" <sub>`), que toma la
identidad del **`.env` del plugin**: `ENGINECX_PRD_REPO` (repo), `ENGINECX_PRD_GIT_USER` +
`ENGINECX_PRD_GIT_TOKEN` (clone/push autenticados) y `ENGINECX_PRD_GIT_USER` +
`ENGINECX_PRD_GIT_EMAIL` (autor/committer del commit). **NUNCA** ejecutes `git` manual sobre
`enginecx_prd` ni uses tu identidad o credenciales locales: siempre a través del bin.

## Navegación (no leas todo)

1. `pm_proyectos` → qué proyectos existen y su `project_id`.
2. `pm_navegar` / `pm_buscar` → ubica el símbolo o chunk relevante (metadata, barato).
3. Lee SOLO ese archivo/sección. `pm_traza` para la historia de un símbolo.

## Trazabilidad de código (changelog y `/reporte-cambios`)

- `pm_traza(entity_id)` es un **changelog por entidad**: cada versión trae `cambio` (qué
  cambió respecto a la anterior), `magnitud_cambio` (`cosmetico|firma|logica|mixto|eliminado`)
  y `hash_anterior` (encadena la historia). Úsalo para "¿cómo evolucionó X y qué cambió?",
  sin leer git. Con `incluir_cuerpo=true` añade el cuerpo de cada versión (para diffs).
- Para un **reporte visual** (línea de tiempo + diff `+N −M` por versión, con modal de
  rojo/verde) usa **`/reporte-cambios`** (por defecto apunta a `manager/PRD.md`; también acepta
  una entidad, un archivo o un commit); queda en `manager/traces/`.
- El `cambio`/diff se puebla **de aquí en adelante**: lo indexado antes de esta capacidad
  aparece como "diff no disponible".

## Gantt general de planes de desarrollo (DB `pm_plan_desarrollo` → `manager/gantt/general.html`)

El **gantt general** es la vista **cross-proyecto y cross-desarrollador** que vive en la tabla
global `pm_plan_desarrollo`: una fila por plan (`folio_prd` tipo `PJ6215`, `estatus`,
`responsable`, `dias` estimados, y `fecha_inicio`/`fecha_fin` una vez programadas). Los
**desarrolladores** alimentan folio/estatus/responsable/días por SQL directo; PM·AI **solo
lee** y **solo programa fechas** (en días hábiles L–V) con `/pm-gantt`. Cada plan se liga a su
proyecto (y de ahí al índice de código) por `folio_prd` → `pm_projects.prd_id` → `project_id`
— el enlace lo puebla el `prd_id` de `manager/config.json`, que `/pm-init` y
`/guardar-cambios` propagan al llamar a `pm_indexar`.

El dashboard `manager/gantt/general.html` **embebe una copia** de esos datos en
`<script id="general-data">window.GENERAL_DATA = {…}</script>` (reflejo de la DB; planes
agrupados por responsable, barras por PRD sobre el calendario, línea vertical en el **día de
hoy**, y una lista de pendientes = aprobados sin fecha). Gestiónalo con `/pm-gantt`, que lee/
programa la DB y **repinta** el HTML.

El **gantt particular** (tareas y objetivos puntuales de cada proyecto, con % de avance
derivado) está **retirado temporalmente**; se rediseñará en una fase posterior.

## Protocolo de trabajo

Flujo SIEMPRE **propuesta → revisión → confirmación**. NUNCA cambies entregables,
responsables, fechas comprometidas ni el alcance comprometido sin confirmación explícita.
Cada decisión registrada lleva su razón (trazabilidad).

**Con fechas (días hábiles):** el **gantt general** (`/pm-gantt`) programa **fechas reales**
(`fecha_inicio`/`fecha_fin` del plan de desarrollo, en días hábiles L–V) sobre lo que ya
aprobaron los desarrolladores; el PRD sigue definiendo el QUÉ/POR QUÉ. El gantt **particular**
por proyecto (derivado del PRD con las skills `writing-plans`/`brainstorming` de superpowers)
queda fuera de alcance por ahora; `ESTADO.md` puede referenciar las fechas del general
mientras tanto.
