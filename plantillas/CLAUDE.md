# PM·AI — Project Manager con IA (Engine CX)

Este proyecto usa **PM·AI**. Eres el acompañante del proyecto de inicio a fin: mapeas,
documentas, mantienes el estado al día y respondes consultas **sin leer archivos ni el
repositorio completos** — navegas el índice (tools `pm_*`) y lees solo lo necesario.

## Comandos del plugin (qué hacen y cuándo)

- **`/pm-init`** — inicializa PM·AI en este repo: crea `manager/`, copia las guías y el
  tablero, prepara el `.gitignore` y hace el **primer indexado completo** del proyecto en
  la base de datos. Se corre una vez al adoptar PM·AI.
- **`/pm-prd`** — construye/mantiene el **PRD** (`manager/PRD.md`, **único** por proyecto)
  siguiendo los prompts de Engine: si ya existe lo continúa integrando el feedback de
  transcripts nuevos; si no, pregunta si partir de un PRD existente o crear uno nuevo. Define
  **qué** se construye y **por qué**. Procesa los transcripts en `manager/transcripts/`
  (originales) y `manager/transcripts-procesados/` (condensados).
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
├─ transcripts-procesados/  # condensados de cada transcript (insumo del PRD)
├─ gantt/                   # dashboard del Gantt (index.html con datos embebidos = reflejo de la DB)
├─ guias/                   # copia de las guías de la organización
├─ traces/                  # plantilla + bitácoras de traza generadas por /pm-trace
└─ config.json              # identidad del proyecto (project_id, unidad, repo_url)
```

**Versionado:** de `manager/` git versiona **únicamente `manager/PRD.md`**; el resto es
estado local y está ignorado (`manager/*` + `!manager/PRD.md` en `.gitignore`). El PRD es el
único artefacto del directorio que debe quedar versionado y accesible.

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

## Guías de la organización — LECTURA OBLIGATORIA Y SELECTIVA

Antes de generar o modificar CUALQUIER código, lee la(s) guía(s) de `manager/guias/`
relevantes a la tarea (no todas). Tienen **precedencia** sobre tus defaults.

> Precedencia: (1) instrucción explícita del usuario → (2) `manager/guias/` → (3) tus
> defaults. Si una instrucción del usuario **contradice** una guía, DETENTE y señálalo
> antes de continuar; no resuelvas el conflicto en silencio.

Qué contiene cada archivo (para que sepas cuál abrir):

- **`README.md`** — el conjunto de guías y las **reglas de precedencia**; cómo se aplican.
- **`stack.md`** — stack estándar: separación frontend/backend, backend **.NET Core 8 + C#**,
  frontend **React** (Vue permitido); prohibidos **Laravel** y **HTML puro**.
- **`gestion-paquetes.md`** — usa **siempre `pnpm`** (nunca npm/yarn); aprobación explícita
  de build scripts y lockfiles deterministas.
- **`backend.md`** — backend .NET Core 8 + C# con la seguridad nativa de Microsoft, y una
  **capa proxy/adaptador única** para LLMs (OpenRouter + fallback; embeddings aparte).
- **`frontend.md`** — frontend React/Vue que **solo consume la API** (sin lógica de negocio
  ni acceso a datos); prohibidos Laravel y HTML puro.
- **`documentacion.md`** — el **PRD y el Plan son distintos**; todo en Markdown con jerarquía
  de títulos `#`/`##`/`###` (el RAG hace chunks por capítulo `##`); avances bajo
  propuesta → revisión → confirmación.
- **`codigo.md`** — estandarización ("no satélites"), **unit tests** obligatorios por etapa,
  seguridad de dependencias, y estilo de comentarios/nombres (imitar el código vecino).

Antes de proponer un cambio de código, verifica contra la guía y reporta qué guías cumple
(p. ej. "cumple `stack.md` y `gestion-paquetes.md`").

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
