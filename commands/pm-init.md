---
description: "Inicializa PM·AI en este repo (nuevo o ya construido): copia CLAUDE.md, tablero y plantilla de trazas a manager/, prepara .gitignore y hace el primer indexado completo del proyecto en la base de datos."
argument-hint: "[nombre o unidad del proyecto]"
allowed-tools: Read, Write, Edit, Bash, mcp__pm-ai__pm_indexar, mcp__pm-ai__pm_proyectos
---

Eres el **Project Manager con IA** inicializando PM·AI en este proyecto. Funciona tanto en
un **proyecto nuevo** (carpeta casi vacía) como en una **base de código ya construida**. A
diferencia de `/guardar-cambios` (que se basa en `git status`), aquí lees el proyecto **completo**
para el primer indexado. La mecánica de indexado está en `docs/entidades-y-indexacion.md`.

Contexto del desarrollador (puede venir vacío): **$ARGUMENTS**

## Reglas transversales (de CLAUDE.md — OBLIGATORIAS)

- Flujo **propuesta → revisión → confirmación**: NO indexas en la base de datos hasta que
  el desarrollador confirme la lista de archivos.
- No sobrescribas archivos existentes del proyecto sin avisar (ver Paso 1).

## Paso 1 — Andamiaje desde el código fuente del plugin

1. Determina la raíz del repo: `git rev-parse --show-toplevel`.
   - Si **no** es un repo git, ofrece inicializarlo (`git init`); se necesita para listar
     respetando `.gitignore` y para `/guardar-cambios` después.
2. Crea `manager/` y copia desde el plugin (NO se edita su contenido):
   - `mkdir -p manager`
   - `cp -R "${CLAUDE_PLUGIN_ROOT}/gantt" manager/gantt`
     (queda `manager/gantt/index.html` con los datos embebidos en `<script id="project-data">`,
     reflejo de la DB; ya no hay `gantt.js`). El Gantt vive en la DB (`pm_gantt*`); `/pm-gantt`
     lo gestiona y repinta el HTML.
   - `mkdir -p manager/traces && cp "${CLAUDE_PLUGIN_ROOT}/trace/trace.html" manager/traces/trace.html`
     (deja lista la **plantilla de bitácoras de traza**; `/reporte-cambios` generará al lado copias
     `trace_*.html` con los datos de cada reporte).
   - `mkdir -p manager/transcripts manager/transcripts-resumidos`
     (carpetas de la función de PRD: los **transcripts originales** y sus **condensados**; el
     **PRD** vive como archivo único `manager/PRD.md`. Las llena `/pm-prd`).
3. Copia el `CLAUDE.md` oficial a la **raíz** del proyecto:
   - Si NO existe `./CLAUDE.md`: `cp "${CLAUDE_PLUGIN_ROOT}/plantillas/CLAUDE.md" ./CLAUDE.md`.
   - Si YA existe: NO lo sobrescribas. Muéstralo, explica que el oficial cubre los comandos
     `pm_*`, y pregunta si reemplazar, fusionar o conservar el actual.

## Paso 2 — `.gitignore`

**De `manager/` se versiona ÚNICAMENTE `manager/PRD.md`**; todo lo demás del directorio
(gantt, traces, transcripts, transcripts-resumidos, config.json) es estado local y se
**ignora**. El PRD es el único artefacto que debe quedar versionado y accesible en git.

- Si no existe `.gitignore`, créalo. Si existe, **complétalo** (no lo reescribas).
- Asegura estas dos líneas (en este orden; la negación re-incluye el PRD):
  ```gitignore
  manager/*
  !manager/PRD.md
  ```
- Si una corrida anterior dejó una regla que ignora `manager/` por completo (p. ej.
  `manager/` o `.manager/`), **reemplázala** por las dos líneas de arriba para que el PRD sí
  se versione.

## Paso 3 — Identidad del proyecto (`manager/config.json`)

Al iniciar, recolecta la identidad con estas preguntas **en este orden** (una a la vez).
Si `manager/config.json` ya existe con estos campos, **respétalos y NO re-preguntes** (FUENTE
ÚNICA); solo pregunta lo que falte.

1. **Unidad de negocio** — **SIEMPRE con un selector** (AskUserQuestion), nunca texto libre.
   Como el selector admite máx. 4 opciones y son siete unidades, usa un **selector de DOS PASOS**:
   - **Paso A** (en ESTE orden exacto): `EngineCX`, `Garantiplus`, `Go Virtual`,
     `Invarat / Gplus Seguros`.
   - **Paso B** (solo si hace falta desambiguar):
     - `Garantiplus` → `Garantiplus Chile` / `Garantiplus Colombia` / `Garantiplus México`.
     - `Invarat / Gplus Seguros` → `Invarat` / `Gplus Seguros`.
     - `EngineCX` y `Go Virtual` se resuelven en el Paso A.
   - Valor final (`config.json.unidad`), una de estas exactas: `EngineCX`, `Garantiplus Chile`,
     `Garantiplus Colombia`, `Garantiplus México`, `Go Virtual`, `Invarat`, `Gplus Seguros`.
     Es **metadata** (la usa el índice de código); **no** forma parte del folder de `enginecx_prd`.

2. **Nombre del sistema** — con un **INPUT de texto** (NO selector). Pregunta literal:
   > «¿A qué proyecto de la empresa corresponde este desarrollo? (por ejemplo: SIGA, Alfa,
   > Omega, Autoexplora, …)»

   Es el `sistema` = folder **SUPERIOR** de `enginecx_prd`. No puede contener `/`.

3. **Nombre del desarrollo** — con un **INPUT de texto** (NO selector). Pregunta literal:
   > «¿Cómo le llamaremos a este desarrollo? (por ejemplo: nuevos-endpoints, cambios-landing,
   > cambio-endpoints, …)»

   Este es el `project_id` = folder **INFERIOR** (el "mini-proyecto" de los cambios) y lo que se
   hashea para el id. **NORMALÍZALO a slug**: minúsculas, guiones, sin espacios ni acentos
   (p. ej. «Nuevos Endpoints» → `nuevos-endpoints`); debe cumplir `^[a-z0-9]+(-[a-z0-9]+)*$`.

4. **Confirmación (OBLIGATORIA).** Hazlo en DOS partes:
   1. **En un mensaje normal** (NO dentro del selector) muestra la tabla con lo recolectado —
      así se renderiza como tabla de verdad. **NUNCA** metas la tabla en el texto del selector
      (ahí sale en crudo, con `|` y `---`):

      | Campo | Valor |
      |---|---|
      | Unidad de negocio | `<unidad>` |
      | Sistema (proyecto de la empresa) | `<sistema>` |
      | Nombre del desarrollo (`project_id`) | `<project_id>` |

   2. **Luego** llama al **selector** (AskUserQuestion) con una pregunta **corta** (p. ej.
      «¿Apruebas el init con estos datos?») y EXACTAMENTE estas dos opciones: **«Aprobar el
      init»** y **«Chat about this»**. Solo con «Aprobar el init» continúas; con «Chat about
      this» abres conversación para ajustar y vuelves a mostrar la tabla.

   **NO** escribas `config.json` ni indexes nada antes de la aprobación.

5. Tras la aprobación, escribe `manager/config.json` (si ya existía, respétalo):
   ```json
   { "project_id": "...", "unidad": "...", "sistema": "..." }
   ```
   y resuelve/persiste la identidad de carpeta PRD:
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" ensure-repo`
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" resolve-id --config "manager/config.json"`
     (lee `sistema` + `project_id` del config y agrega `prd_id` = hash 4 díg del `project_id` y
     `prd_dir` = `{sistema}/PJ{prd_id}-{project_id}`). La carpeta final es
     `enginecx_prd/{sistema}/PJ{prd_id}-{project_id}/`, cuyo folder inferior es la liga/espejo de
     `manager/`.

## Paso 4 — Listado completo de archivos a procesar

A diferencia de `/guardar-cambios`, aquí se lee TODO el proyecto, **excepto lo que esté en
`.gitignore`** (incluido `manager/`).

1. Lista los archivos que git considera (respeta `.gitignore` nativamente):
   `git ls-files --cached --others --exclude-standard`
   (en un proyecto nuevo vacío esto devolverá poco o nada).
2. Quédate con los **indexables** y descarta el resto (binarios, lockfiles como
   `pnpm-lock.yaml`/`package-lock.json`, `.env`). **NUNCA indexes `.gitignore` ni `CLAUDE.md`**
   (raíz o de subcarpetas): exclúyelos SIEMPRE de la lista, aunque git los liste. El mapeo fiel está en
   `docs/entidades-y-indexacion.md`; resumido, cada archivo se procesa bajo esta
   **identidad de código** (su `tipo`):

   | Identidad de código | Archivos |
   |---|---|
   | `funcion` / `endpoint` (símbolos) | `.py .ts .mts .cts .tsx .js .jsx .mjs .cjs .cs` |
   | `markdown_chunk` | `.md` |
   | `reporte` **o** `pagina` | `.html .htm` (ver clasificación abajo) |
   | `ejecutable` | `.sh .bash .cmd .bat`, o archivo sin extensión con shebang de shell |
   | `json` / `yaml` / `config` | `.json` / `.yaml .yml` / `.toml .ini .config .npmrc .editorconfig .env.example` (⚠ `.gitignore` y `CLAUDE.md` **NO** se indexan) |
   | `query` | `.sql .psql .pgsql .ddl .dml` |
   | `estilos` | `.css .scss .sass .less .styl .pcss` |

   - **Código** (`funcion`/`endpoint`): un archivo produce **varios** símbolos; a nivel
     archivo anótalo como `funcion/endpoint (símbolos)` — el indexador decide `endpoint`
     por decorador/atributo de routing o ruta de API.
   - **HTML** (`reporte` vs `pagina`): `pagina` = artefacto de UI (404, landing, dashboard);
     `reporte` = HTML entregable generado para distribuir. Si por nombre/contenido **no es
     claro**, márcalo como **pendiente (ambiguo)**: NO se indexa hasta que se defina en
     `pm-ai.overrides.json` (`{ "html": { "ruta/x.html": "pagina" } }`).

3. **Muestra al desarrollador** un reporte claro, agrupado por carpeta, donde **cada
   archivo lleve anotada la identidad de código** bajo la que se procesará. Incluye el
   conteo por carpeta y un **resumen por identidad** (cuántos `funcion/endpoint`,
   `markdown_chunk`, `estilos`, etc.). Lista aparte los **HTML pendientes (ambiguos)** y los
   archivos excluidos. Aclara que todo lo de `.gitignore` queda excluido. Ejemplo:

   ```
   src/
     api/usuarios.py        → funcion/endpoint (símbolos)
     ui/tema.scss           → estilos
   db/
     schema.sql             → query
   public/
     404.html               → pagina
     export_q2.html         → reporte
     data.html              → ⚠ pendiente (¿página o reporte?)
   Resumen: 1 código, 1 estilos, 1 query, 2 html (1 pendiente). Excluidos: 0.
   ```

4. Permite ajustar (excluir archivos/carpetas, o resolver los HTML pendientes) hasta llegar
   a un acuerdo sobre la lista.
5. **Autorización explícita (OBLIGATORIA, bloqueante).** Con la lista y sus identidades de
   código ya mostradas, pregunta de forma EXPLÍCITA si se procede:
   > "¿Autorizas **leer e indexar** estos N archivos con las identidades de código
   > mostradas? (sí / no / ajustar)"
   - **NO leas ni indexes nada** (no llames a `pm_indexar`) hasta recibir un **sí explícito**.
   - Si responde "ajustar", vuelve al punto 4. Si responde "no", detente sin indexar.

## Paso 5 — Primer commit en la base de datos

SOLO tras el **sí explícito** del Paso 4.5, indexa el proyecto completo:

1. Determina el commit: `git rev-parse HEAD` (si hay historia; si no, usa `initial`) y la
   fecha `git show -s --format=%cI HEAD` (si no hay, la fecha de hoy).
2. Llama a `pm_indexar` con:
   - `project_id`, `unidad` → de `manager/config.json` (`nombre` opcional = `project_id`);
     `repo_url` → de `git remote get-url origin` (si hay; opcional — ya no vive en `config.json`).
   - `prd_id` → de `manager/config.json` **si existe** (lo agrega `resolve-id` en el Paso 3).
     Así `pm_projects.prd_id` queda poblado y el gantt general (`/pm-gantt`) puede ligar este
     proyecto a su plan de desarrollo por folio (`PJ{prd_id}`).
   - `repo_root` → la raíz absoluta del repo.
   - `commit_sha` y `created_at` → del paso anterior.
   - `files` → la lista indexable acordada (todas como altas; sin `deleted`).
3. Para proyectos grandes, si la lista es muy extensa, puedes indexar en **lotes** (varias
   llamadas a `pm_indexar` con el mismo `commit_sha`) e ir reportando el progreso.

## Paso 6 — Reporte y handoff

- Resume: qué se creó (`manager/`, `CLAUDE.md`, `.gitignore`) y los totales de
  `pm_indexar` (altas / versiones / sin-cambio / tombstones).
- Sugiere los siguientes pasos: **`/pm-prd`** para el PRD, **`/pm-gantt`** para la
  planeación, **`/guardar-cambios`** para los avances posteriores y **`/reporte-cambios`** para
  generar bitácoras del histórico de cambios (del PRD o del código).

## Paso 7 — Publicar en el repo central de PRDs (enginecx_prd)

> **Identidad git:** el bin `prd-sync` usa el repo/usuario/email/token del `.env` del plugin
> (`ENGINECX_PRD_REPO`, `ENGINECX_PRD_GIT_USER`, `ENGINECX_PRD_GIT_EMAIL`,
> `ENGINECX_PRD_GIT_TOKEN`). No hagas `git` manual sobre `enginecx_prd` ni uses tu identidad local.

> **Qué se publica.** El espejo sube **TODO** el contenido de `manager/` al repo central —
> `PRD.md`, `config.json`, `transcripts/` y `transcripts-resumidos/` incluidos (estas carpetas
> **NO** se ignoran en `enginecx_prd`; el `.gitignore` que excluye `manager/*` es SOLO del repo
> local del proyecto, no del central). Lo único que el espejo **descarta** es el relleno del
> SO/editor (`.DS_Store`, recursos `._*`, `Thumbs.db`, `desktop.ini`, temporales `*~`/`*.swp`).

1. Espeja `manager/` y commitea en el repo central (lee `prd_dir` de `manager/config.json`):
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" mirror --manager "manager" --dir "<prd_dir>"`
   - `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" commit --dir "<prd_dir>" --message "feat(prd): <nombre> (<prd_dir>) — init"`
2. **Propón** el push (no automático): muestra qué se subirá y, **solo tras confirmación**, corre
   `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" push`.
