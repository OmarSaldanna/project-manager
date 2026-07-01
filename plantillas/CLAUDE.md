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
- **`/pm-gantt`** — gestiona la planeación, que **vive en la DB** (`pm_gantt*`): tareas
  (cronograma **por días hábiles**) y **objetivos que desglosan cada tarea** (el % de la tarea se
  deriva de ellos). El dashboard `manager/gantt/index.html` **embebe una copia** de la DB.
  Construye el Gantt a partir del PRD usando la skill de planeación de superpowers; sirve para planear,
  ajustar y registrar avances, y para visualizar el tablero (`manager/gantt/index.html`).
- **`/pm-commit`** — cierra un avance: hace **commit(s) en git** e **indexa los cambios en
  la base de datos** (`pm_index`) aplicando el criterio de Entidades de Código. Es el flujo
  de trabajo habitual cada vez que hay avances.
- **`/pm-trace`** — genera un **reporte HTML de bitácora** (en `manager/traces/`) con la
  traza de cambios de una **entidad**, un **archivo** o un **commit**: línea de tiempo de
  versiones, qué cambió y el **diff por versión**. Útil para revisar la evolución del código.

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
├─ gantt/                   # dashboard del Gantt (index.html con datos embebidos = reflejo de la DB)
├─ traces/                  # plantilla + bitácoras de traza generadas por /pm-trace
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

## Trazabilidad de código (changelog y `/pm-trace`)

- `pm_traza(entity_id)` es un **changelog por entidad**: cada versión trae `cambio` (qué
  cambió respecto a la anterior), `magnitud_cambio` (`cosmetico|firma|logica|mixto|eliminado`)
  y `hash_anterior` (encadena la historia). Úsalo para "¿cómo evolucionó X y qué cambió?",
  sin leer git. Con `incluir_cuerpo=true` añade el cuerpo de cada versión (para diffs).
- Para un **reporte visual** (línea de tiempo + diff `+N −M` por versión, con modal de
  rojo/verde) usa **`/pm-trace`** con una entidad, un archivo o un commit; queda en
  `manager/traces/`.
- El `cambio`/diff se puebla **de aquí en adelante**: lo indexado antes de esta capacidad
  aparece como "diff no disponible".

## Tablero de planeación (DB `pm_gantt*` → `manager/gantt/index.html`)

El Gantt **vive en la base de datos**: `pm_gantt` (cabecera), `pm_gantt_tarea` (tareas, por
**fechas** `start`/`end` en días hábiles) y `pm_gantt_objetivo` (objetivos que **desglosan**
cada tarea, con `planned`/`finished`). El **% de avance de la tarea se DERIVA** de sus objetivos
terminados (vista `pm_gantt_tarea_avance`); `pm_gantt_resumen` da insights (hechos, atrasados,
avance global). Todo cuelga del mismo `project_id` que el índice de código.

El dashboard `manager/gantt/index.html` **embebe una copia** de esos datos en
`<script id="project-data">window.PROJECT_DATA = {…}</script>` (reflejo de la DB; fines de
semana rayados, línea vertical en el **día de hoy**, objetivos agrupados por tarea). Gestiónalo
con `/pm-gantt`, que actualiza la DB y **repinta** el HTML.

## Protocolo de trabajo

Flujo SIEMPRE **propuesta → revisión → confirmación**. NUNCA cambies entregables,
responsables, fechas comprometidas ni el alcance comprometido sin confirmación explícita.
Cada decisión registrada lleva su razón (trazabilidad).

**Con fechas (días hábiles):** la planeación (Gantt) usa **fechas reales** (`start`/`end` por
tarea, estimadas en días hábiles L–V) y `ESTADO.md` puede referenciarlas. El cronograma vive en
el Gantt; el PRD define el QUÉ/POR QUÉ. El Gantt se deriva del PRD usando la skill
`writing-plans` de superpowers (y `brainstorming` para esclarecer alcance).
