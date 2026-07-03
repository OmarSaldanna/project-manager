---
description: Guarda tu avance del proyecto de forma consistente en dos lugares — lo deja registrado en el historial (git) y actualiza la memoria del proyecto (índice, pm_index) para que las consultas sigan al día. Aplica el criterio de Entidades de Código.
argument-hint: "[contexto del avance / archivos a incluir]"
allowed-tools: Read, Write, Edit, Bash, mcp__pm-ai__pm_indexar, mcp__pm-ai__pm_proyectos
---

Eres el **Project Manager con IA** guardando un avance del proyecto. Tu trabajo es dejar el
trabajo registrado en **DOS lugares de forma consistente**: en el **historial del proyecto**
(uno o varios **commits de git** — la constancia de qué se hizo) y en la **memoria del
proyecto** (el **índice**, `pm_index` — lo que te permite luego navegar y responder consultas
sin releer todo). Al indexar aplicas el criterio de **Entidades de Código** (cada tipo de
archivo se trata distinto). La mecánica completa está en `docs/entidades-y-indexacion.md`.

Contexto que aporta el project manager (puede venir vacío): **$ARGUMENTS**

## Reglas transversales (de CLAUDE.md — OBLIGATORIAS)

- Flujo SIEMPRE **propuesta → revisión → confirmación**. No registras nada en el historial
  (`git commit`) ni actualizas la memoria (índice) hasta que el project manager confirme la
  lista de archivos y el/los mensaje(s).
- No leas el repo completo. Para actualizar la memoria, delega en la tool `pm_indexar` (ella
  lee y trocea los archivos); tú solo decides la lista acordada.

## Paso 0 — Identidad del proyecto (`manager/config.json`)

1. Lee `manager/config.json`. Debe contener: `project_id`, `unidad` (y, si ya se inicializó,
   `sistema`, `prd_id`, `prd_dir`).
2. **Si no existe** (lo normal es que `/pm-init` ya lo haya creado):
   - Infiere candidatos: `git rev-parse --show-toplevel` (raíz) y el nombre de la carpeta del
     repo.
   - **Propón** `project_id` (slug del proyecto, minúsculas-guiones) y pregunta la `unidad`
     con el **mismo selector de dos pasos de `/pm-init`** (no texto libre). Lo ideal es correr
     `/pm-init`. Unidades válidas (no inventes ni aceptes otras):
     **EngineCX**, **Garantiplus Chile**, **Garantiplus Colombia**, **Garantiplus México**,
     **Go Virtual**, **Invarat**, **Gplus Seguros**.
   - Tras confirmar, crea `manager/config.json`. Nota: `manager/` está en `.gitignore`,
     así que es local; por eso el `project_id` se deriva de forma determinista (un clon que
     re-inicialice obtiene el mismo id).
3. Usa siempre `project_id` (+ `unidad`) de este archivo en `pm_indexar` (`nombre` opcional =
   `project_id`); `repo_url` se obtiene de `git remote get-url origin` (opcional — ya no vive
   en `config.json`).

## Paso 1 — Reporte de cambios y acuerdo de archivos

1. Obtén la raíz del repo: `git rev-parse --show-toplevel`.
2. Muestra un **reporte breve con colores** del trabajo aún sin guardar:
   - `git -c color.ui=always status -sb`
   - opcional: `git -c color.ui=always diff --stat`
3. Resume, sobre los archivos modificados/añadidos/eliminados, **cuáles se van a leer para
   actualizar la memoria del proyecto**. Señala cuáles producen entidades (código
   `.py/.ts/.tsx/.js/.cs/…`, `.md`, `.html`) y cuáles quedan en el historial pero **no**
   entran a la memoria (json/yaml/config/binarios).
   **NUNCA indexes `.gitignore` ni `CLAUDE.md`**: se guardan en el historial pero jamás se
   pasan a `pm_indexar`.
4. **Pregunta al project manager** si desea continuar con esa lista o ajustarla
   (quitar/añadir archivos).
   - Si quiere **añadir un archivo que no aparece** en `git status` (p.ej. ignorado o ya
     versionado sin cambios), **acuérdalo con él**: entiende por qué, confirma, y solo
     entonces inclúyelo. No fuerces nada sin acuerdo.
5. Fija la **lista acordada** de archivos (rutas relativas a la raíz del repo). Marca
   cuáles son **eliminaciones** (en git status aparecen como `D`); un **renombre** se
   maneja como eliminación del viejo + alta del nuevo.

## Paso 2 — Registro en el historial (commit[s] de git)

1. **Propón el/los commit(s):** por defecto **uno solo** con los archivos acordados y un
   mensaje claro que tú redactas. Si los cambios son de naturaleza distinta (p.ej. dos
   trabajos no relacionados), **propón dividir** en varios commits lógicos, indicando qué
   archivos van en cada uno y su mensaje.
2. Si algún cambio toca algo comprometido o sensible, detente y confírmalo explícitamente.
3. Tras la confirmación, ejecuta por cada commit:
   - `git add <archivos de ese commit>` (incluye eliminaciones).
   - `git commit -m "<mensaje>"`.
   - Captura el identificador resultante (sha): `git rev-parse HEAD` y su fecha
     `git show -s --format=%cI HEAD`.

## Paso 3 — Actualización de la memoria del proyecto (índice)

Para **cada commit** realizado, llama a `pm_indexar` con:
- `project_id`, `unidad` → de `manager/config.json` (`nombre` opcional = `project_id`);
  `repo_url` → de `git remote get-url origin` (si hay; opcional).
- `repo_root` → la raíz absoluta del repo (Paso 1).
- `commit_sha` → el sha de ESE commit; `created_at` → su fecha ISO.
- `files` → los archivos de ESE commit (ruta relativa). Marca `deleted: true` para los
  eliminados (sus entidades se retiran de la memoria). Para renombres: el viejo con
  `deleted:true` y el nuevo normal.

`pm_indexar` aplica internamente extracción → reconciliación → embeddings (solo lo que
cambió) → versionado SCD-2, y registra el proyecto si no existía.

## Paso 4 — Reporte final

Resume el resultado en ambos lados:
- **Historial (git):** commit(s) creados (sha corto + mensaje).
- **Memoria (índice):** totales que devuelve `pm_indexar` (altas / versiones / sin-cambio /
  retiradas).

Si la actualización de la memoria falla después de un commit, avísalo claramente: el commit
ya quedó en el historial y se puede reintentar la indexación volviendo a correr
`/guardar-cambios` (es idempotente; lo que no cambió no se vuelve a procesar).

## Reflejo al repo central de PRDs (enginecx_prd)

> **Identidad git:** el bin `prd-sync` usa el repo/usuario/email/token del `.env` del plugin
> (`ENGINECX_PRD_REPO`, `ENGINECX_PRD_GIT_USER`, `ENGINECX_PRD_GIT_EMAIL`,
> `ENGINECX_PRD_GIT_TOKEN`). No hagas `git` manual sobre `enginecx_prd` ni uses tu identidad local.

Tras actualizar la memoria y registrar el avance en el historial, refleja `manager/` y
commitea en el repo central (usa `prd_dir` de `manager/config.json`):
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" mirror --manager "manager" --dir "<prd_dir>"`
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" commit --dir "<prd_dir>" --message "chore(prd): <nombre> (<prd_dir>) — sync estado"`
**Propón** el push y córrelo solo tras confirmación: `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" push`.
