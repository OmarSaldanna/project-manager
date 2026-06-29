---
description: "Construye y mantiene el PRD del proyecto (manager/PRD.md, único) siguiendo los prompts de Engine. Si ya existe, lo continúa integrando el feedback de transcripts nuevos; si no, pregunta si partir de un PRD existente o crear uno nuevo. Trabaja en modo planeación con superpowers y propaga los cambios al Gantt."
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
El CÓMO/cronograma vive en el Gantt (`/pm-gantt`).

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
  en las skills de **superpowers**), y solo tras la aprobación escribes. No edites el PRD ni
  el Gantt "a la mitad" de la conversación.
- No leas el repo completo: usa `pm_*` y lecturas puntuales para entender el contexto técnico.
- Cada decisión/supuesto relevante se registra con su razón (trazabilidad).
- **Este plugin trabaja CON fechas.** El PRD usa la Fecha del encabezado y admite fechas
  donde aporten (fases/hitos). El cronograma detallado es del Gantt.
- Es una **sesión completa**: entrevista de ida y vuelta, **un bloque a la vez** (máx. 2-3
  preguntas por mensaje), nunca todas las secciones de golpe. Lo dicta el prompt de Dani.

## Arquitectura de carpetas (bajo `manager/`, sin punto inicial)

```
manager/
├─ PRD.md                   # EL PRD del proyecto (único, versionado y accesible)
├─ transcripts/             # transcripts/documentos ORIGINALES (intactos, .md/.txt)
└─ transcripts-procesados/  # CONDENSADOS: solo lo relevante extraído de cada original
```

Asegúralas al inicio: `mkdir -p manager manager/transcripts manager/transcripts-procesados`.
(La carpeta se llama `manager/` —sin `.`— para que sea visible y accesible también en Windows.)

## Procesamiento de transcripts (insumo del PRD)

El desarrollador aporta transcripts de dos maneras; soporta ambas:

1. **En su prompt** (`$ARGUMENTS` trae el texto o una ruta) → guarda el original como
   `manager/transcripts/<nombre>.md`.
2. **Dejándolos** en `manager/transcripts/`.

**Detección de transcript NUEVO (paso accionable):** lista `manager/transcripts/` y
`manager/transcripts-procesados/` (con `Glob` o `ls`) y compáralas por nombre: todo original
en `transcripts/` que **no** tenga su condensado homónimo en `transcripts-procesados/` es
nuevo → ahí viene retroalimentación que debemos integrar al PRD.

Para cada transcript nuevo, produce un **condensado** (solo lo relevante; descarta
saludos/relleno) y guárdalo en `manager/transcripts-procesados/<mismo-nombre>.md`. El original
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

## Empresa / unidad de negocio (selección cerrada, OBLIGATORIA)

El campo **"Área / empresa"** del encabezado del PRD es una **selección cerrada** entre estas
seis (no inventes ni aceptes otras), la MISMA lista que usa `/pm-gantt`:

> **Go Virtual · Garantiplus México · Garantiplus Colombia · Gplus Seguros · Invarat · EngineCX**

Pregúntala como selección al crear el PRD por primera vez y úsala en el encabezado. Debe
**coincidir** con `project.empresa` del Gantt. (Esta lista cerrada tiene precedencia sobre los
ejemplos de área que aparecen en el prompt entrevistador.)

## Paso 0 — Entrada (¿continuar, ingerir o crear?)

1. Asegura las carpetas.
2. Comprueba si existe **`manager/PRD.md`**:
   - **Existe** → vamos a **continuar/editar** el PRD: ve al **Flujo de edición**.
   - **No existe** → **pregunta al desarrollador** con una **selección de DOS opciones**
     (preséntala como un prompt de selección, no como texto libre):
     - **(a) Ya tengo un PRD existente** → pídele la ruta o que lo pegue; ve a **Ingesta**.
     - **(b) Crear uno nuevo a partir de un transcript/recurso** → ve a **Creación**.

## Flujo de edición — continuar un PRD existente (lo normal)

Es el camino habitual: integrar el feedback de un transcript nuevo al PRD y poner al día el Gantt.

1. Lee `manager/PRD.md`. Identifica el/los **transcripts nuevos** (los que no tienen
   condensado) y/o el que venga en `$ARGUMENTS`. Genera sus condensados.
2. **Modo planeación con superpowers:** usa la skill **`brainstorming`** para esclarecer qué
   aporta el transcript y **diseñar** los cambios al PRD (qué secciones se tocan y por qué).
3. **Propón el diff** del PRD (propuesta → revisión → confirmación). Si algo es ambiguo o
   **choca con lo ya escrito**, NO lo resuelvas tú: **pregúntale al usuario con preguntas de
   opción múltiple** (cada contradicción/decisión con sus opciones y una recomendación — ver
   Reglas transversales). Solo tras aprobación, edita `manager/PRD.md` (cambios mínimos y
   precisos; sube la **Versión** del encabezado).
4. **Pon al corriente el Gantt (obligatorio, misma sesión):** una vez escrito el PRD, NO
   cierres la sesión todavía. **Carga la skill `pm-ai:pm-gantt` con la herramienta `Skill`**
   (no basta con mencionar `/pm-gantt`) y ejecútala: el Gantt se construye **en plan mode**
   (`EnterPlanMode`) usando **`writing-plans`** de superpowers para que **jale los cambios del
   PRD** (nuevas tareas/fases, alcance), y solo se escribe al aprobar el plan. Los ajustes
   finos (fechas, orden, duraciones) se revisan contigo ahí, bajo propuesta → revisión →
   confirmación. El PRD y el Gantt se actualizan **en la misma sesión**; si por alguna razón
   no se puede actualizar el Gantt, díselo explícitamente al desarrollador (no lo omitas en
   silencio).

## Flujo de ingesta — "ya tengo un PRD existente"

1. Localiza el PRD que aporta el dev (ruta o pegado) y léelo. Procesa los transcripts que haya.
2. **Valida contra la estructura de Engine** (`${CLAUDE_PLUGIN_ROOT}/plantillas/PRD.md`):
   detecta secciones faltantes/incompletas, placeholders e inconsistencias. Cruza con los
   condensados de transcripts. Apóyate en **`brainstorming`** para esclarecer huecos.
3. **Propón** el PRD normalizado y, para lo que ni el PRD ni los transcripts resuelvan,
   **entrevista** con los bloques relevantes del prompt de Dani (solo lo que falte). Ante
   huecos o conflictos, **consulta con opción múltiple** (ver Reglas transversales), no asumas.
4. Tras confirmación, escribe **`manager/PRD.md`**. Luego pon al corriente el Gantt
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
4. Preséntalo para revisión; al confirmar, escribe **`manager/PRD.md`**. Luego pon al
   corriente el Gantt (paso 4 del Flujo de edición).

## Cierre (verificación explícita)

Antes de dar por terminada la sesión, comprueba y reporta:

1. **PRD escrito:** `manager/PRD.md` quedó guardado con la **Versión** del encabezado
   incrementada respecto a la anterior.
2. **Gantt al corriente:** el Gantt en la DB (`pm_gantt*`) y su reflejo en el tablero
   (`manager/gantt/index.html`) reflejan los cambios del PRD
   (se ejecutó la skill `pm-ai:pm-gantt` en esta misma sesión). Si no aplica o no se pudo,
   regístralo con su razón en lugar de omitirlo.

Resume el PRD resultante en pocas líneas. Recuerda cerrar el avance con **`/pm-commit`** para
dejar git y el índice consistentes.
