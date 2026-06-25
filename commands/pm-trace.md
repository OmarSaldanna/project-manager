---
description: Genera un reporte HTML (bitácora) de la traza de cambios de una entidad de código, un archivo o un commit, en manager/traces/. Tabla por entidad con línea de tiempo, magnitud y diff estilo git.
argument-hint: "[nombre de función/entidad | ruta de archivo | commit sha]"
allowed-tools: Read, Write, Edit, Bash, mcp__pm-ai__pm_proyectos, mcp__pm-ai__pm_navegar, mcp__pm-ai__pm_buscar, mcp__pm-ai__pm_recuperar, mcp__pm-ai__pm_traza, mcp__pm-ai__pm_commit
---

Eres el **Project Manager con IA** generando una **bitácora de trazabilidad de código**: un
reporte HTML que muestra, por cada entidad, su **línea de tiempo de versiones** (qué cambió,
con qué magnitud) y el **diff estilo git** (`+N −M`, con modal de rojo/verde). El reporte se
guarda en `manager/traces/` como una copia de la plantilla `trace.html` en la que **solo
cambia el JSON de datos**.

Petición del desarrollador (puede venir vacía): **$ARGUMENTS**

## Reglas transversales (de CLAUDE.md — OBLIGATORIAS)

- Flujo SIEMPRE **propuesta → revisión → confirmación**. No generas el reporte hasta que el
  desarrollador confirme **qué entidades** trazar y el **título**.
- No leas el repo completo: localiza todo vía las tools `pm_*` (la traza vive en la DB, no en git).

## Paso 0 — Identidad del proyecto (`manager/config.json`)

1. Lee `manager/config.json` para obtener `project_id` (y `nombre`). Es lo que creó `/pm-init`.
2. Si no existe, infiérelo igual que `/pm-commit` (raíz del repo, nombre de carpeta) y
   confírmalo antes de continuar.

## Paso 1 — Localizar la(s) entidad(es) a trazar (conversacional)

A partir de `$ARGUMENTS` (o pregunta si viene vacío), detecta el **tipo de input**:

- **Commit** — parece un sha (hex de ≥7 chars): `pm_commit(project_id, commit_sha)` → entidades
  tocadas por ese commit.
- **Archivo** — contiene `/` o termina en extensión (`.py`, `.ts`, `.cs`, `.md`, …):
  `pm_navegar(project_id)` y filtra por `ruta` (igual o que termine en lo pedido).
- **Entidad** — en otro caso (nombre de función/símbolo): `pm_buscar(project_id, query)` y/o
  `pm_navegar` filtrando por `nombre`.

Si el input es ambiguo, **pregunta** cuál de los tres es.

Luego **muestra una tabla de entidades candidatas** (no generes nada aún) con info de la DB para
que el desarrollador se haga una idea:

| # | Entidad | Tipo | Ruta | Último cambio | Magnitud |
|---|---------|------|------|---------------|----------|

(El "último cambio"/magnitud salen de la fila vigente o de `pm_commit`.) **Conversa hasta
confirmar** qué entidades entran al reporte — pueden ser **una o varias**. No incluyas entidades
que el desarrollador no haya aprobado.

## Paso 2 — Construir los datos de la traza

Por **cada entidad confirmada**, llama a `pm_traza(entity_id, incluir_cuerpo=true)` (el
`incluir_cuerpo` trae el `cuerpo` de cada versión, necesario para el diff). Arma el objeto de
datos con esta forma EXACTA (arreglo de entidades → arreglo de versiones, más reciente primero):

```json
{
  "titulo": "Traza De Código: <archivo o entidad>",
  "proyecto": "<project_id>",
  "generado": "<nombre solicitado por el usuario | fecha-hora>",
  "entidades": [
    {
      "nombre": "<nombre>", "tipo": "<tipo>", "ruta": "<ruta>", "entity_id": "<id>",
      "descripcion": "<qué hace la entidad — la `descripcion` de la versión vigente>",
      "versiones": [
        {
          "commit_sha": "...", "fecha": "YYYY-MM-DD", "magnitud_cambio": "logica|firma|cosmetico|mixto|eliminado|null",
          "cambio": "<texto del changelog o null>", "content_hash": "...", "hash_anterior": "...|null",
          "is_current": true, "cuerpo": "<cuerpo de esa versión o null>"
        }
      ]
    }
  ]
}
```

Notas:
- `versiones` va **más reciente primero** (tal cual lo devuelve `pm_traza`). La plantilla calcula
  el diff de cada versión contra la **siguiente (más vieja)** del arreglo; la más antigua es el
  alta (todo inserciones).
- Si una versión tiene `cuerpo` null (histórico previo a la feature), déjalo `null`: la plantilla
  mostrará "diff n/d" sin romperse.
- Convierte `created_at` a `fecha` (solo `YYYY-MM-DD`).

## Paso 3 — Confirmar y generar el reporte

1. **Propón el título** (por defecto `Traza De Código: {nombre del archivo o entidad}`) y pide
   el **nombre del reporte** (o usa fecha-hora). **Confirma** antes de escribir.
2. Asegura la plantilla local (cópiala del plugin solo si falta):
   ```bash
   mkdir -p manager/traces
   [ -f manager/traces/trace.html ] || cp "${CLAUDE_PLUGIN_ROOT}/trace/trace.html" manager/traces/trace.html
   ```
3. Escribe el JSON de datos con `Write` en `manager/traces/<name>.json`.
4. Inyéctalo en una copia de la plantilla (modifica **solo** el bloque de datos):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/trace/inject.mjs" \
     manager/traces/trace.html manager/traces/<name>.json manager/traces/trace_<name>.html
   ```
   `inject.mjs` valida el JSON; si falla, corrige el `data.json` y reintenta.

## Paso 4 — Abrir y resumir

1. `open manager/traces/trace_<name>.html` (macOS).
2. Resume qué verá: nº de entidades, total de versiones y los cambios más relevantes (p. ej.
   "la lógica de `X` cambió en el commit `abc1234`").
