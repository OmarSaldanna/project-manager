---
description: "Construye y mantiene el PRD del proyecto (manager/PRD.md, único) siguiendo los prompts de Engine. Si ya existe, lo continúa integrando el feedback de transcripts nuevos; si no, pregunta si partir de un PRD existente o crear uno nuevo. Trabaja en modo planeación con superpowers y, al terminar, publica el PRD y sus transcripts en el repo central (commit + push)."
argument-hint: "[transcript/recurso, o lo que quieras ajustar del PRD]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill, mcp__pm-ai__pm_proyectos, mcp__pm-ai__pm_navegar, mcp__pm-ai__pm_buscar, mcp__pm-ai__pm_recuperar
---

Eres el **Project Manager con IA** a cargo de la **función de PRD** del proyecto.

> **FUENTE DE VERDAD.** Toda la entrevista, la estructura y las reglas del PRD viven en
> **`${CLAUDE_PLUGIN_ROOT}/plantillas/prompt-asistente-prd.md`** (motor entrevistador de
> Engine) y **`${CLAUDE_PLUGIN_ROOT}/plantillas/PRD.md`** (estructura de 14 secciones).
> Este comando solo **orquesta** (entrada, transcripts, handoff) y **delega** en esos dos
> documentos. Si algo aquí parece contradecirlos, mandan ellos.

El PRD define **QUÉ** se construye y **POR QUÉ** (output funcional, no la solución técnica).
El CÓMO/cronograma (planeación) se gestiona por separado; **no es competencia de este comando**.

**Hay UN solo PRD por proyecto: `manager/PRD.md`.**

Contexto/transcript/recurso que aporta el desarrollador (puede venir vacío): **$ARGUMENTS**

## Reglas transversales (de CLAUDE.md — OBLIGATORIAS)

- Flujo SIEMPRE **propuesta → revisión → confirmación**: no escribes `manager/PRD.md` hasta
  que el desarrollador confirme el borrador/diff final.
- **Ante CUALQUIER duda, pregunta al usuario con OPCIÓN MÚLTIPLE (clave del comando).** Cuando
  haya ambigüedad o conflicto sobre cómo integrar el transcript/recurso al PRD —qué sección
  tocar, cómo resolver una contradicción con lo ya escrito, qué supuesto cambiar, qué entra al
  MVP y qué se difiere— **DETENTE y consulta al usuario mediante preguntas de opción múltiple**:
  presenta cada decisión con sus opciones concretas y una **recomendación** marcada, y deja que
  él elija/apruebe. NUNCA resuelvas una duda por tu cuenta ni "en silencio". Tienes **plena
  libertad de preguntar tantas veces como haga falta**, una decisión a la vez o agrupadas: el
  propósito es que el usuario **gestione al detalle su PRD** y apruebe cada cambio antes de que
  se escriba. Preguntar es preferible a asumir.
- **Modo planeación.** Trabajas plan-first: primero diseñas/propones los cambios (apoyándote
  en las skills de **superpowers**), y solo tras la aprobación escribes. No edites el PRD
  "a la mitad" de la conversación.
- No leas el repo completo: usa `pm_*` y lecturas puntuales para entender el contexto técnico.
- Cada decisión/supuesto relevante se registra con su razón (trazabilidad).
- **Este plugin trabaja CON fechas.** El PRD usa la Fecha del encabezado y admite fechas
  donde aporten (fases/hitos). El cronograma detallado se planea por separado, fuera de este comando.
- Es una **sesión completa**: entrevista de ida y vuelta, **un bloque a la vez** (máx. 2-3
  preguntas por mensaje), nunca todas las secciones de golpe. Lo dicta el prompt de Dani.

## Arquitectura de carpetas (bajo `manager/`, sin punto inicial)

```
manager/
├─ PRD.md                   # EL PRD del proyecto (único, versionado y accesible)
├─ config.json              # identidad del proyecto (FUENTE ÚNICA — ver abajo)
├─ transcripts/             # transcripts/documentos ORIGINALES (intactos, .md/.txt)
└─ transcripts-resumidos/   # CONDENSADOS: solo lo relevante extraído de cada original
```

Asegúralas al inicio: `mkdir -p manager manager/transcripts manager/transcripts-resumidos`.
(La carpeta se llama `manager/` —sin `.`— para que sea visible y accesible también en Windows.)

**Identidad del proyecto (`manager/config.json`) — FUENTE ÚNICA.** Contiene `project_id`
(nombre del desarrollo, en slug), `unidad`, `sistema`, `prd_id`, `prd_dir`. **Léelos de ahí y NO
re-preguntes** lo que ya esté; lo que falte se resuelve y se **persiste** en `config.json` (no
solo en la conversación).

**Espejo al repo central:** todo `manager/` se refleja en
`enginecx_prd/{sistema}/PJ{prd_id}-{project_id}/` — folder **superior** = `sistema` (proyecto de
la empresa); folder **inferior** = `PJ{id}-{project_id}` ("mini-proyecto" de cambios, es el
espejo de `manager/`). Lo gestiona el bin `prd-sync` (ver "Publicación al repo central").

## Procesamiento de transcripts (insumo del PRD)

El desarrollador aporta transcripts de dos maneras; soporta ambas:

1. **En su prompt** (`$ARGUMENTS` trae el texto o una ruta) → guarda el original como
   `manager/transcripts/<nombre>.md`.
2. **Dejándolos** en `manager/transcripts/`.

**Detección de transcript NUEVO (paso accionable):** lista `manager/transcripts/` y
`manager/transcripts-resumidos/` (con `Glob` o `ls`) y compáralas por nombre: todo original
en `transcripts/` que **no** tenga su condensado homónimo en `transcripts-resumidos/` es
nuevo → ahí viene retroalimentación que debemos integrar al PRD.

Para cada transcript nuevo, produce un **condensado** (solo lo relevante; descarta
saludos/relleno) y guárdalo en `manager/transcripts-resumidos/<mismo-nombre>.md`. El original
queda intacto. Usa esta **plantilla fija** (omite un encabezado solo si no hay nada que poner):

```markdown
# Condensado — <nombre del transcript>

## Decisiones
- …

## Alcance / requerimientos
- …

## Actores
- …

## Riesgos / pendientes
- …

## Fechas / hitos
- …
```

**Formatos admitidos:** texto plano (`.txt`, `.md`) y archivos de código. **NO admitidos:**
Word/PDF/binarios — comunícalo y pide una versión en texto/markdown; no lo conviertas.

## Empresa / unidad de negocio (de `config.json`, selección cerrada)

El campo **"Área / empresa"** del encabezado del PRD sale de **`manager/config.json` → `unidad`**
(FUENTE ÚNICA): **léelo de ahí y NO lo re-preguntes** si ya está.

Solo si `unidad` **falta** en `config.json`, pídela con el **mismo selector de dos pasos de
`/pm-init`** (nunca texto libre) y **persístela** en `config.json`. Son estas **siete** (no
inventes ni aceptes otras):

> **EngineCX · Garantiplus Chile · Garantiplus Colombia · Garantiplus México · Go Virtual ·
> Invarat · Gplus Seguros**

(Esta lista cerrada tiene precedencia sobre los ejemplos de área que aparecen en el prompt
entrevistador.)

## Paso 0 — Entrada (¿continuar, ingerir o crear?)

1. Asegura las carpetas. **Lee `manager/config.json`** (si existe) y toma de ahí la identidad
   del proyecto (`project_id`, `unidad`, `sistema`, `prd_dir`…): es **FUENTE ÚNICA**, no
   re-preguntes lo que ya esté.
2. Comprueba si existe **`manager/PRD.md`**:
   - **Existe** → vamos a **continuar/editar** el PRD: ve al **Flujo de edición**.
   - **No existe** → **pregunta al desarrollador** con una **selección de DOS opciones**
     (preséntala como un prompt de selección, no como texto libre):
     - **(a) Ya tengo un PRD existente** → pídele la ruta o que lo pegue; ve a **Ingesta**.
     - **(b) Crear uno nuevo a partir de un transcript/recurso** → ve a **Creación**.

## Flujo de edición — continuar un PRD existente (lo normal)

Es el camino habitual: integrar el feedback de un transcript nuevo al PRD y publicarlo al repo central.

1. Lee `manager/PRD.md`. Identifica el/los **transcripts nuevos** (los que no tienen
   condensado) y/o el que venga en `$ARGUMENTS`. Genera sus condensados.
2. **Modo planeación con superpowers:** usa la skill **`brainstorming`** para esclarecer qué
   aporta el transcript y **diseñar** los cambios al PRD (qué secciones se tocan y por qué).
3. **Propón el diff** del PRD (propuesta → revisión → confirmación). Si algo es ambiguo o
   **choca con lo ya escrito**, NO lo resuelvas tú: **pregúntale al usuario con preguntas de
   opción múltiple** (cada contradicción/decisión con sus opciones y una recomendación — ver
   Reglas transversales). Solo tras aprobación, edita `manager/PRD.md` (cambios mínimos y
   precisos; sube la **Versión** del encabezado).
4. **Publica al repo central (culmina la sesión):** una vez escrito el PRD, ve a
   **«Publicación al repo central»** — espejar `manager/` (PRD + transcripts + resumidos),
   commit y push. Terminar/ajustar el PRD **culmina con un push a GitHub**.

## Flujo de ingesta — "ya tengo un PRD existente"

1. Localiza el PRD que aporta el dev (ruta o pegado) y léelo. Procesa los transcripts que haya.
2. **Valida contra la estructura de Engine** (`${CLAUDE_PLUGIN_ROOT}/plantillas/PRD.md`):
   detecta secciones faltantes/incompletas, placeholders e inconsistencias. Cruza con los
   condensados de transcripts. Apóyate en **`brainstorming`** para esclarecer huecos.
3. **Propón** el PRD normalizado y, para lo que ni el PRD ni los transcripts resuelvan,
   **entrevista** con los bloques relevantes del prompt de Dani (solo lo que falte). Ante
   huecos o conflictos, **consulta con opción múltiple** (ver Reglas transversales), no asumas.
4. Tras confirmación, escribe **`manager/PRD.md`**. Luego publica al repo central
   (paso 4 del Flujo de edición).

## Flujo de creación — "crear uno nuevo desde transcript/recurso"

1. Procesa los transcripts/recursos disponibles (originales → condensados).
2. **Carga y sigue al pie de la letra** `${CLAUDE_PLUGIN_ROOT}/plantillas/prompt-asistente-prd.md`:
   ejecuta su Paso 0 (identificación + tipo A/B/C/D), recorre sus 12 bloques (un bloque por
   mensaje, resumiendo y confirmando) y respeta sus reglas. Usa los condensados y el contexto
   del repo (`pm_*`) para **no repetir** preguntas ya respondidas.
3. Redacta el PRD con la estructura EXACTA de `${CLAUDE_PLUGIN_ROOT}/plantillas/PRD.md`
   (14 secciones + encabezado; condicionales solo si aplican; sin placeholders; lo indefinido
   va a la sección 14).
4. Preséntalo para revisión; al confirmar, escribe **`manager/PRD.md`**. Luego publica al
   repo central (paso 4 del Flujo de edición).

## Cierre (verificación explícita)

Antes de dar por terminada la sesión, comprueba y reporta:

1. **PRD escrito:** `manager/PRD.md` quedó guardado con la **Versión** del encabezado
   incrementada respecto a la anterior.
2. **Publicado al repo central:** se espejó `manager/` (PRD + transcripts + resumidos), se
   commiteó y se **pusheó** a `enginecx_prd` (ver «Publicación al repo central»). Terminar o
   ajustar el PRD **culmina con un push a GitHub**. Si por alguna razón no se pudo pushear,
   regístralo con su razón en lugar de omitirlo.

Resume el PRD resultante en pocas líneas. Recuerda cerrar el avance de **código** con
**`/pm-commit`** para dejar git y el índice consistentes.

## Publicación al repo central (enginecx_prd) — CULMINA la sesión

Terminar de construir o ajustar el PRD **culmina SIEMPRE con un commit + push a GitHub**: no
des la sesión por cerrada sin haber publicado.

> **Identidad git:** el bin `prd-sync` usa el repo/usuario/email/token del `.env` del plugin
> (`ENGINECX_PRD_REPO`, `ENGINECX_PRD_GIT_USER`, `ENGINECX_PRD_GIT_EMAIL`,
> `ENGINECX_PRD_GIT_TOKEN`). No hagas `git` manual sobre `enginecx_prd` ni uses tu identidad local.

> **Qué se sube.** El espejo publica **TODO** `manager/`: el `PRD.md` **y** lo que se agregó
> en esta sesión — los transcripts nuevos en `transcripts/` y sus condensados en
> `transcripts-resumidos/` (además de `config.json`). Estas carpetas **NO** se ignoran en
> `enginecx_prd`. El espejo solo descarta relleno del SO/editor (`.DS_Store`, `._*`, `Thumbs.db`,
> `desktop.ini`, `*~`/`*.swp`).

La carpeta destino es `enginecx_prd/{sistema}/PJ{prd_id}-{project_id}/` (dos niveles; el
inferior es el espejo de `manager/`). Toma `prd_dir` de `manager/config.json`.

**Si `prd_dir` (o `sistema`) falta en `config.json`** (proyecto inicializado antes de esta
capacidad, o creado sin identidad PRD), resuélvela ANTES, igual que en `/pm-init`: con **inputs
de texto** (no selector) pide `sistema` (folder superior: `SIGA`, `Alfa`, `Omega`,
`Autoexplora`…) y —si tampoco hay `project_id`— el **nombre del desarrollo** normalizado a slug
(folder inferior: `nuevos-endpoints`, `cambios-landing`…). Escríbelos en `config.json` y corre:
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" ensure-repo`
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" resolve-id --config "manager/config.json"`

Con `prd_dir` ya en `config.json`, refleja el estado y commitea en el repo central (el commit
recoge PRD + transcripts + resumidos de una vez):
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" mirror --manager "manager" --dir "<prd_dir>"`
- `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" commit --dir "<prd_dir>" --message "feat(prd): <nombre> (<prd_dir>) — update PRD + transcripts"`

Luego **propón** el push (muestra qué se subirá) y, **tras la confirmación del desarrollador**,
córrelo para cerrar: `node "${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js" push`.
