# Plan de mejoras de indexación — derivado de las pruebas de campo

> Documento de trabajo. Recoge las mejoras al indexado de PM·AI que salieron de tres pruebas
> de campo reales sobre proyectos internos y las decisiones tomadas para acotarlas. La fuente de verdad
> arquitectónica sigue siendo `prompt.md` (decisiones D1–D12); este documento solo prioriza y
> aterriza mejoras que **no** contradicen esas decisiones.

## Diagnóstico (qué dijeron las pruebas)

La infraestructura es sólida: MCP, versionado SCD-2, deduplicación por `content_hash`, embeddings
y describer funcionan bien en los tres proyectos. Las brechas reales son dos:

1. **Qué exponen las tools.** `pm_recuperar` y `pm_traza` devuelven la columna `embedding`
   (vector de 1536 dims, ~5k tokens por entidad) que para el agente es ruido puro. Contradice el
   principio rector de "navegar barato".
2. **Cuánto detalle estructural del código llega al índice.** Se pierden firma con tipos,
   contenedor (clase), constantes de módulo y parámetros. El detalle existe en tree-sitter pero
   se descarta en la etapa de descripción.

## Decisiones de alcance (qué NO hacemos, y por qué)

- **No** extractor de IIFE / callbacks anónimos: es sobreajuste a JS vanilla, fuera del stack
  objetivo del MVP (.NET/C#, React/TS, Python; el stack no contempla HTML/JS puro). En el stack
  objetivo tree-sitter ya captura el 100% de las funciones nombradas.
- **No** reintroducir `linea_inicio`/`linea_fin`: contradice **D10**. La métrica de cobertura usa
  posiciones de tree-sitter **solo durante el indexado** y persiste un **ratio**, no posiciones.
- **No** exponer el `contenido` crudo en `pm_recuperar` por ahora: la nueva columna `detalles`
  cubre la necesidad (firma, params, constantes) sin el riesgo de servir código stale.
- Columna `detalles` en **jsonb**, llenada de forma **determinista** (tree-sitter, no LLM),
  devuelta **bajo demanda**, y **sin embeber** (no diluye `pm_buscar`).
- Constantes en `detalles`: **solo nombres** (sin valores → cero riesgo de filtrar secretos a la DB).
- Extractor de archivos de datos puros: **diferido**.

## Principio de diseño transversal

Todo el detalle nuevo va en **campos estructurados** (columna `detalles`), **nunca** dentro de
`descripcion` — porque `descripcion` es lo que se vectoriza, y mezclarle listas de identificadores
diluye el embedding y degrada `pm_buscar`. Prosa para buscar; estructura para recuperar.

## Plan por prioridad

| Prioridad | Acción | Dónde |
|---|---|---|
| **P0** | Excluir el vector `embedding` de `pm_recuperar`/`pm_traza` (SELECT explícito) | `packages/core/src/db.ts` (`getCurrent`, `traza`) |
| **P1** | Columna `detalles jsonb` (firma, contenedor, constantes, parámetros, retorno) + flag `incluir_detalles` | `schema.sql`, `types.ts`, `db.ts`, `apply.ts`, `extract_code.ts`, `mcp/src/index.ts` |
| **P1** | Métrica de `cobertura` por archivo (ratio líneas-en-símbolos / líneas-totales) | `extract_code.ts`, `schema.sql`, `db.ts` (`navegar`) |
| **P2** | Priorizar docstring del autor sobre la descripción del LLM | `describe.ts` |
| **P2** | Enmascarado de secretos antes de enviar contenido al LLM | `describe.ts` |
| **P2** | Limpiar/deduplicar `dependencias` (sin builtins, callee raíz) | `extract_code.ts` |
| **P2** | Pares clave→valor para configs pequeños; símbolos CSS (selectores, custom props, keyframes) | `extract_config.ts`, `extract_styles.ts` |
| **P3** | Ignorar encabezados dentro de fences ` ``` ` en el chunking de markdown | `chunk_markdown.ts` |

## Diferido (documentado, no implementado)

- Extractor de archivos de datos puros (arrays/objetos top-level sin funciones) como tipo nuevo.
- Exponer `contenido` crudo en `pm_recuperar` (reevaluar si `detalles` deja algún hueco).
- Grafo inverso de callers; resolución de `dependencias` a `entity_id`.

## Verificación

- `pnpm -r typecheck` y los tests de `@pm-ai/core` y `@pm-ai/indexer` (vitest) en verde. Los tests
  usan `FakeRepo` y embedders en memoria, así que no requieren Supabase real.
- `schema.sql` queda idempotente (`add column if not exists`); aplicar la migración en Supabase es
  paso de despliegue. El código TS degrada bien si la columna aún no existe (campos nullables).
