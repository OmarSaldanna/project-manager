---
description: Genera un reporte HTML (bitácora) con el histórico de cambios de un documento o pieza del proyecto (por defecto, manager/PRD.md), en manager/traces/. Muestra, por cada pieza, su línea de tiempo de versiones, la magnitud del cambio y el diff estilo git.
argument-hint: "[vacío = PRD.md | ruta de archivo | nombre de pieza/función | commit]"
allowed-tools: Read, Write, Edit, Bash, mcp__pm-ai__pm_proyectos, mcp__pm-ai__pm_navegar, mcp__pm-ai__pm_buscar, mcp__pm-ai__pm_recuperar, mcp__pm-ai__pm_traza, mcp__pm-ai__pm_commit
---

Eres el **Project Manager con IA** generando una **bitácora del histórico de cambios**: un
reporte HTML que muestra, por cada pieza del proyecto (un documento como el PRD, un archivo o
una función), su **línea de tiempo de versiones** (qué cambió, con qué magnitud) y el **diff
estilo git** (`+N −M`, con modal de rojo/verde). El reporte se guarda en `manager/traces/`
como una copia de la plantilla `trace.html` en la que **solo cambia el JSON de datos**.

Petición del project manager (puede venir vacía): **$ARGUMENTS**

## Reglas transversales (de CLAUDE.md — OBLIGATORIAS)

- Flujo SIEMPRE **propuesta → revisión → confirmación**. No generas el reporte hasta que el
  project manager confirme **qué se traza** y el **título**.
- No leas el repo completo: localiza todo vía las tools `pm_*` (el histórico vive en la memoria
  del proyecto —la base de datos—, no en git).

## Paso 0 — Identidad del proyecto (`manager/config.json`)

1. Lee `manager/config.json` para obtener `project_id`. Es lo que creó `/pm-init`.
2. Si no existe, infiérelo igual que `/guardar-cambios` (raíz del repo, nombre de carpeta) y
   confírmalo antes de continuar.

## Paso 1 — Elegir qué trazar (por defecto, el PRD)

Lo normal es querer ver el histórico de **`manager/PRD.md`**, así que ese es el objetivo por
defecto:

- Si `$ARGUMENTS` **ya nombra un objetivo** (una ruta de archivo, el nombre de una pieza/función
  o un commit), úsalo directamente (equivale a haber elegido «otro archivo»).
- Si `$ARGUMENTS` **viene vacío**, **pregunta con un select**:

  **¿Deseas ver el histórico de cambios del PRD.md?**
  - **Sí** — traza `manager/PRD.md` (el caso normal).
  - **(Otro)** — escribe el archivo, la pieza (función/símbolo) o el commit del que quieras ver
    el histórico.

Con el objetivo elegido, detecta el **tipo de input**:

- **Documento/Archivo** — ruta o nombre de archivo (`manager/PRD.md`, `.md`, `.py`, `.ts`, `.cs`, …):
  `pm_navegar(project_id)` y filtra por `ruta` (igual o que termine en lo pedido).
- **Pieza/entidad** — nombre de función/símbolo: `pm_buscar(project_id, query)` y/o
  `pm_navegar` filtrando por `nombre`.
- **Commit** — parece un sha (hex de ≥7 chars): `pm_commit(project_id, commit_sha)` → piezas
  tocadas por ese commit.

Si el input es ambiguo, **pregunta** de cuál de los tres se trata.

> **Nota sobre el PRD:** `manager/PRD.md` solo tiene histórico si ya pasó por `/guardar-cambios`
> (que lo indexa por secciones). Si `pm_navegar` no encuentra ninguna pieza para esa ruta,
> avísalo: el PRD aún no se ha guardado en la memoria del proyecto; sugiere correr
> `/guardar-cambios` incluyéndolo y luego reintentar la bitácora.

Luego **muestra una tabla de piezas candidatas** (no generes nada aún) con info de la memoria del
proyecto para que el project manager se haga una idea:

| # | Pieza | Tipo | Ruta | Último cambio | Magnitud |
|---|-------|------|------|---------------|----------|

(El "último cambio"/magnitud salen de la versión vigente o de `pm_commit`.) **Conversa hasta
confirmar** qué piezas entran al reporte — pueden ser **una o varias**. No incluyas piezas
que el project manager no haya aprobado.

## Paso 2 — Construir los datos del histórico

Por **cada pieza confirmada**, llama a `pm_traza(entity_id, incluir_cuerpo=true)` (el
`incluir_cuerpo` trae el `cuerpo` de cada versión, necesario para el diff). Arma el objeto de
datos con esta forma EXACTA (arreglo de piezas → arreglo de versiones, más reciente primero):

```json
{
  "titulo": "Histórico De Cambios: <archivo o pieza>",
  "proyecto": "<project_id>",
  "generado": "<nombre solicitado por el usuario | fecha-hora>",
  "entidades": [
    {
      "nombre": "<nombre>", "tipo": "<tipo>", "ruta": "<ruta>", "entity_id": "<id>",
      "descripcion": "<qué hace la pieza — la `descripcion` de la versión vigente>",
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
- La clave del JSON sigue siendo `entidades` (es lo que espera la plantilla); en el título y en tu
  conversación con el project manager habla de "piezas" o "documento".

## Paso 3 — Confirmar y generar el reporte

1. **Propón el título** (por defecto `Histórico De Cambios: {nombre del archivo o pieza}`) y pide
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
2. Resume qué verá: nº de piezas, total de versiones y los cambios más relevantes (p. ej.
   "la sección de alcance del PRD cambió en el commit `abc1234`").
