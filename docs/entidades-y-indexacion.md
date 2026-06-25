# Tratamiento de archivos, entidades de código e indexación

> Documento de referencia técnica. Describe **cómo** PM·AI convierte un archivo en
> filas de la tabla `pm_index`. Es la descripción fiel de lo implementado en
> `packages/indexer` y `packages/core` (no del diseño ideal). La fuente de verdad
> arquitectónica sigue siendo `prompt.md`; este documento aterriza la mecánica.

El flujo tiene **tres etapas** encadenadas, una por archivo:

```
archivo  ──①─►  clasificación + extracción  ──②─►  entidades (IndexEntry[])  ──③─►  indexación (pm_index)
            (¿qué extractor?)                  (separación en símbolos/chunks)   (reconcile → embed → versionado SCD-2)
```

El orquestador que las encadena es `applyFile()` en
[`packages/indexer/src/apply.ts`](../packages/indexer/src/apply.ts).

---

## ① Tratamiento de archivos — clasificación por tipo

Lo primero es decidir **qué extractor** aplica según el nombre/contenido del archivo.
Esto ocurre en `extractFile()` (`apply.ts`); la clasificación de config/ejecutables vive
en [`packages/indexer/src/classify.ts`](../packages/indexer/src/classify.ts), fuente
única de verdad para que el filtro de descubrimiento (cli) y el enrutador (apply) nunca
diverjan.

| Tipo de archivo | Detección | Extractor | `tipo` resultante |
|---|---|---|---|
| Código (`.py`, `.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.cs`) | `languageForFile(ruta)` ≠ null | `extractCode()` | `funcion` o `endpoint` |
| Markdown (`.md`) | `/\.md$/i` | `chunkMarkdown()` | `markdown_chunk` |
| HTML (`.html`, `.htm`) | `/\.html?$/i` + `resolveHtmlTipo()` | `extractHtml()` | `reporte` o `pagina` (o se salta si es ambiguo) |
| Ejecutable (`.sh`, `.bash`, `.cmd`, `.bat`, o shebang de shell sin extensión) | `isExecutable(ruta, contenido)` | `extractExecutable()` | `ejecutable` |
| Configuración (`.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.config`, `.gitignore`, `.npmrc`, `.editorconfig`, `.env.example`) | `configTipo(ruta)` ≠ null | `extractConfig()` | `json` / `yaml` / `config` |
| SQL (`.sql`, `.psql`, `.pgsql`, `.ddl`, `.dml`) | `isQueryFile(ruta)` | `extractSql()` | `query` |
| Estilos (`.css`, `.scss`, `.sass`, `.less`, `.styl`, `.pcss`) | `isStyleFile(ruta)` | `extractStyles()` | `estilos` |
| Lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`), `.env`, binarios… | — | — (se ignora) | — |

```ts
export async function extractFile(ruta, contenido, htmlOverrides?): Promise<IndexEntry[]> {
  if (languageForFile(ruta)) return extractCode(ruta, contenido);
  if (/\.md$/i.test(ruta)) return chunkMarkdown(ruta, contenido);
  if (/\.html?$/i.test(ruta)) {
    const tipo = resolveHtmlTipo(ruta, contenido, htmlOverrides); // pagina | reporte | ambiguo
    return tipo === "ambiguo" ? [] : extractHtml(ruta, contenido, tipo);
  }
  if (isExecutable(ruta, contenido)) return extractExecutable(ruta, contenido);
  if (configTipo(ruta)) return extractConfig(ruta, contenido);
  if (isQueryFile(ruta)) return extractSql(ruta, contenido);
  if (isStyleFile(ruta)) return extractStyles(ruta, contenido);
  return [];
}
```

> **Lockfiles y `.env` se excluyen a propósito** (`EXCLUDE_NAMES` en `classify.ts`):
> los lockfiles son enormes y autogenerados (gastarían embeddings sin valor semántico) y
> `.env` contiene secretos (además casi siempre está en `.gitignore`).

> **Regla clave:** el archivo nunca se indexa entero. Siempre se descompone primero
> en *entidades* más pequeñas. Por eso el agente puede navegar el código por símbolo
> sin leer archivos completos.

---

## ② Separación en entidades de código

Una **entidad** (`IndexEntry`) es la unidad mínima indexable. Tiene siempre la misma
forma —`tipo`, `nombre`, `descripcion`, `contenido`, `librerias`, `dependencias`,
`archivo`, `ruta`— sin importar de qué extractor venga. Lo que cambia es **cómo se
parte** cada tipo de archivo.

### 2.1 Código → símbolos (tree-sitter)

Archivo: [`packages/indexer/src/extract_code.ts`](../packages/indexer/src/extract_code.ts).

Se parsea el archivo con **tree-sitter** (WASM, vía `web-tree-sitter` +
`tree-sitter-wasms`) y se extrae **una entidad por función/método** usando *queries*
del árbol sintáctico. Cada lenguaje tiene su `LanguageSpec` con tres queries:

- **`defQuery`** — define qué nodos son una entidad. Captura `@n` (nombre) y `@d`
  (nodo completo de la definición). Ej. Python: `(function_definition name:(identifier) @n) @d`.
  En TS/JS reconoce `function_declaration`, `method_definition` y `variable_declarator`
  con valor `arrow_function`/`function_expression`. En C#, `method_declaration`.
- **`importQuery` + `importToLibs`** — extrae los imports a **nivel de archivo**;
  esa lista de `librerias` se comparte por todos los símbolos del mismo archivo.
- **`callQuery`** — dentro del cuerpo de cada símbolo captura los *callees* →
  `dependencias` (best-effort, se filtra la auto-referencia).

Por cada match de `defQuery` se emite una entidad:

```ts
entries.push({
  tipo: classifyTipo(key, ruta, nameNode.text, source), // "funcion" | "endpoint"
  nombre: nameNode.text,            // p.ej. "crear_tabla"
  descripcion: firstLine(contenido), // firma (1ª línea) — placeholder hasta ③
  contenido: defNode.text,           // cuerpo completo del símbolo → base del content_hash
  librerias,                         // imports del archivo
  dependencias,                      // llamadas dentro del cuerpo
  archivo, ruta,
});
```

**Clasificación `funcion` vs `endpoint`** (`classifyTipo`, "ambas señales combinadas"):
un símbolo se marca como `endpoint` si hay **señal de código** —decorador/atributo de
routing junto al símbolo: `@app.get`/`@router.post`/`@app.route` (Python), `[HttpGet]`/
`[Route]` (C#), `@Get()`/`@Post()` (NestJS/TS)— **o** **señal de ruta** —el archivo vive
en `controllers/`, `routes/`, `api/`, `pages/api/` o `route.ts` **y** el símbolo se llama
como un método HTTP (`GET`, `POST`, …), p.ej. los route handlers de Next.js App Router.

**Limitaciones v1 (documentadas en el propio archivo):**
- `dependencias` son callees por texto, no resolución de símbolos real.
- La detección de `endpoint` es best-effort por patrón; los handlers **inline** de Express
  (arrow anónima como argumento de `app.get(...)`) no se extraen como símbolo, así que
  tampoco se clasifican.
- `descripcion` aquí es solo la firma; la descripción semántica ≤2 oraciones la pone
  la etapa ③ (`describe`), no el extractor.

### 2.2 Markdown → chunks por encabezado

Archivo: [`packages/indexer/src/chunk_markdown.ts`](../packages/indexer/src/chunk_markdown.ts).

El markdown se parte **por encabezado** (`#`…`######`). Cada sección produce un
`markdown_chunk` donde:
- `nombre` = **breadcrumb** de ancestros (`"PRD > Fase 2 > Riesgos"`), construido con
  un stack que mantiene solo encabezados de nivel estrictamente menor.
- `descripcion` = `contenido` = el texto de la sección (es lo que se embebe).
- El texto previo al primer encabezado se emite como chunk `"(preámbulo)"`.

### 2.3 HTML → reporte **o** pagina

Archivo: [`packages/indexer/src/extract_html.ts`](../packages/indexer/src/extract_html.ts).

Un HTML produce **una sola** entidad, pero el `tipo` depende de su intención (los mismos
archivos pueden ser una cosa u otra):
- **`pagina`** — artefacto de UI navegable (404, landing, dashboard/tablero, login…).
- **`reporte`** — HTML entregable, generado para distribuir (export, informe con fecha…).

Forma de la entidad (idéntica para ambos):
- `nombre` = `<title>` o el nombre del archivo.
- `contenido` = HTML **crudo** (base del `content_hash`).
- `descripcion` = texto visible sin tags (`stripHtml`, recortado a 4000 chars) — es lo
  que se embebe. (No usa LLM; el texto visible ya es semántico.)

**Clasificación (`classifyHtml`, conservadora).** Hay señales de **página** (nombres como
`404`/`index`/`dashboard`, dirs `pages/`/`public/`/`views/`, o `<nav>`/`<header>`/`<form>`/
`viewport` en el contenido) y de **reporte** (nombres con `report`/`reporte`/`informe`/
`export`, fecha en el nombre, dirs `reports/`/`out/`/`dist/`, o `<meta generator>`/"generado
el"). Regla: si aparece **exactamente una** de las dos → ese tipo; si aparecen **ambas o
ninguna** → **`ambiguo`**.

**El indexador NO adivina los ambiguos** (decisión del dev): los **salta** (no los indexa
y no los tumba) y los **reporta como pendientes** al final del CLI. El dev los resuelve en
`pm-ai.overrides.json` en la raíz del repo y reindexa:

```json
{ "html": { "ruta/relativa/data.html": "pagina" } }
```

`resolveHtmlTipo()` aplica primero el override del dev y, si no hay, la heurística. El
override **siempre gana**.

### 2.4 Configuración → un mini-manifiesto

Archivo: [`packages/indexer/src/extract_config.ts`](../packages/indexer/src/extract_config.ts).

Un archivo de configuración produce **una sola** entidad (`json` / `yaml` / `config`); el
archivo entero es la unidad (no se parte en símbolos):
- `nombre` = nombre del archivo.
- `contenido` = texto **crudo** (base del `content_hash`).
- `descripcion` = un **mini-manifiesto** del archivo — y eso es lo que se embebe. Cuando
  hay LLM, la etapa ③ lo redacta (propósito + claves/secciones relevantes); el fallback
  determinista (sin API key) lista las claves de primer nivel (parseo de JSON, o líneas
  `clave:` para YAML).

### 2.5 Ejecutable → qué hace el script

Archivo: [`packages/indexer/src/extract_executable.ts`](../packages/indexer/src/extract_executable.ts).

Un script (`.sh`/`.bash`/`.cmd`/`.bat`, o archivo sin extensión con shebang de shell)
produce **una sola** entidad `ejecutable`; el archivo entero es la unidad:
- `nombre` = nombre del archivo.
- `contenido` = texto **crudo** (base del `content_hash`).
- `descripcion` = qué hace / qué ejecuta el script — lo que se embebe. Con LLM la redacta
  la etapa ③; el fallback determinista usa el shebang + las primeras líneas de comentario.

### 2.6 SQL → query

Archivo: [`packages/indexer/src/extract_sql.ts`](../packages/indexer/src/extract_sql.ts).

Un archivo SQL (`.sql`/`.psql`/`.pgsql`/`.ddl`/`.dml`) produce **una sola** entidad
`query`; el archivo entero es la unidad:
- `nombre` = nombre del archivo.
- `contenido` = texto **crudo** (base del `content_hash`).
- `descripcion` = un resumen **muy breve** (≤1 párrafo) de qué hacen las queries — lo que
  se embebe. Con LLM lo redacta la etapa ③; el fallback determinista usa el primer
  comentario `--` + los tipos de sentencia detectados (SELECT/INSERT/CREATE/ALTER…).

### 2.7 Estilos → qué define la hoja

Archivo: [`packages/indexer/src/extract_styles.ts`](../packages/indexer/src/extract_styles.ts).

Una hoja de estilos (`.css`/`.scss`/`.sass`/`.less`/`.styl`/`.pcss`) produce **una sola**
entidad `estilos`; el archivo entero es la unidad:
- `nombre` = nombre del archivo.
- `contenido` = texto **crudo** (base del `content_hash`).
- `descripcion` = un resumen breve de qué estilos define (componentes/temas/variables) — lo
  que se embebe. Con LLM lo redacta la etapa ③; el fallback determinista usa el primer
  comentario (`/* */` o `//`) + el nº de reglas + si define variables (`$`/`--`/`@`).

---

## ③ Indexación en la base de datos

Aquí las entidades extraídas se concilian contra lo que ya existe en `pm_index` y se
versionan. Todo esto vive en `applyFile()` (`apply.ts`) apoyándose en `reconcile.ts`,
`hash.ts`, `describe.ts`, `embeddings.ts` y los RPCs de `schema.sql`.

### 3.1 Identidad y hash — `packages/core/src/hash.ts`

Cada entidad obtiene dos huellas:

- **`entityId = sha256(project_id + ruta + nombre).slice(0,32)`** — identidad lógica
  **estable**. No cambia aunque cambie el cuerpo (eso permite re-versionar bajo la
  misma identidad). **Sí** cambia si cambia `ruta` o `nombre` → un *rename* se trata
  como borrado de la vieja + alta de la nueva.
- **`contentHash = sha256(normalizeWhitespace(contenido))`** — huella del contenido.
  Se normaliza whitespace para que un reformateo trivial **no** cuente como cambio
  semántico y no genere versiones espurias.

### 3.2 Reconciliación — `packages/indexer/src/reconcile.ts`

`reconcileFile()` es **puro y determinista** (testeable sin servicios externos).
Compara las entidades del archivo contra el estado vigente en DB
(`currentEntitiesForFile`) y produce un plan de tres listas:

| Caso | Condición | Destino |
|---|---|---|
| Sin cambios | mismo `entity_id`, mismo `content_hash` **y** mismo `tipo` | `unchanged` — no se toca ni se re-embebe |
| Modificada | mismo `entity_id`, **distinto** `content_hash` | `toUpsert` — nueva versión |
| Reclasificada | mismo `entity_id` y `content_hash`, **distinto** `tipo` | `toUpsert` — nueva versión |
| Nueva | `entity_id` no existía | `toUpsert` — alta |
| Desaparecida | `entity_id` vigente que ya no está en el archivo | `toTombstone` — borrado lógico |

> El gate de `content_hash` es el que evita costo: lo `unchanged` **nunca** llega al
> describer ni al embedder. Se añade `tipo` al gate para que una **reclasificación**
> (p.ej. una `funcion` que pasa a `endpoint` sin tocar el cuerpo) sí re-versione; por eso
> `currentEntitiesForFile` devuelve también el `tipo` vigente.

### 3.3 Describir + embeber (solo lo que cambió)

En `applyFile`, por cada entidad en `toUpsert`:
1. **Describir** — si el `tipo` está en `PM_TIPOS_DESCRITOS` (código `funcion`/`endpoint`/
   `ejecutable`, configuración `json`/`yaml`/`config`, `query` y `estilos`) se llama al
   `Describer` (`describe.ts`) para generar la descripción; para `markdown_chunk`, `reporte`
   y `pagina` la `descripcion` ya es el texto semántico (chunk / texto visible del HTML) y
   se embebe tal cual.
   - El `Describer` adapta el prompt al `tipo`: resumen de función/endpoint, "qué ejecuta"
     para scripts, mini-manifiesto para configuración, "qué hacen las queries" para SQL, o
     "qué estilos define" para hojas de estilo.
   - `LlmDescriber` usa un chat compatible OpenAI (capa proxy, D11);
     `SignatureDescriber` es el fallback sin LLM (devuelve la `descripcion` del extractor:
     firma del símbolo, o el resumen determinista de config/ejecutable).
   - El contenido que se manda al LLM se **acota (~16k chars)**: un símbolo enorme (p.ej. JS
     generado/minificado o una función de cientos de líneas) reventaba el contexto del modelo.
2. **Componer y embeber** — NO se embebe solo la `descripcion`. `buildEmbedText` (`embed_text.ts`)
   arma una mini-ficha = nombre + cola de ruta + `descripcion` + firma + **constantes y sus
   valores** + **valores de config** (de `detalles`) + librerías, y **eso** es lo que se embebe
   (`embeddings.ts`, `text-embedding-3-small`, 1536 dims). El mismo texto se persiste en la columna
   `texto_busqueda` para el canal léxico. Así las constantes y los valores de configuración —que
   antes quedaban fuera del vector— se vuelven localizables.

### 3.3.2 Trazabilidad del cambio (changelog por entidad)

Además de describir *qué hace* una entidad, en la rama `versioned` (hay predecesor) se registra
*qué cambió* respecto a la versión anterior. Esto convierte `pm_traza` en un **changelog por
entidad** (no solo "existió en estos commits"), navegable sin `git diff`:

- **`hash_anterior`** = `content_hash` del predecesor (misma `entity_id`). Ancla el diff y
  encadena la historia (invariante: `hash_anterior[N] = content_hash[N+1]`).
- **`magnitud_cambio`** (`cosmetico|firma|logica|mixto|eliminado`) la decide
  [`magnitud.ts`](../packages/indexer/src/magnitud.ts), heurística pura sobre la firma, las
  `librerias`/`dependencias` y un diff textual de líneas. Es **conservadora**: ante la duda NO
  marca cosmético.
- **`cambio`** = resumen en lenguaje natural del delta. Los **cosméticos** (y el caso sin cuerpo
  previo) usan una **plantilla determinista** (cero LLM, gate de costo); el resto lo redacta el
  `Describer` (`describeChange`) sobre el **diff de los cuerpos**, no sobre las descripciones.
- **`cuerpo`** = el cuerpo de la entidad, **enmascarado** (`maskSecrets`) y acotado, que se
  persiste como base del diff de la **siguiente** versión. Es server-side: NO viaja en las tools.

En **altas** (`created`) los tres (`cambio`/`hash_anterior`/`magnitud_cambio`) quedan `null`. Un
**tombstone** se registra como evento de la traza: `magnitud_cambio = 'eliminado'`,
`cambio = 'Entidad eliminada'`, `hash_anterior` al último contenido vigente.

`pm_traza(entity_id, incluir_cuerpo=true)` devuelve además el `cuerpo` de cada versión: así un
consumidor (p. ej. el reporte `/pm-trace`) puede calcular el diff `+N −M` línea a línea entre
versiones consecutivas sin leer git. El tool `pm_commit(project_id, commit_sha)` lista las
entidades tocadas por un commit (resuelve el input "commit" de `/pm-trace`).

### 3.3.1 Búsqueda: híbrida (vector + léxico) sobre HNSW

`pm_buscar` fusiona dos rankings con **Reciprocal Rank Fusion**: el **vectorial** (coseno, índice
**HNSW** `idx_embed` — antes IVFFLAT, que sobre cientos de filas destruía el recall) y el **léxico**
(`tsvector 'simple'` + GIN `idx_lexico` sobre `texto_busqueda`, tsquery en modo OR). El vector
resuelve paráfrasis; el léxico rescata identificadores/valores exactos. Es retrocompatible: sin
`p_query_text` (texto crudo de la consulta) degrada a vector puro.

### 3.4 Versionado atómico SCD-2 — `packages/core/src/schema.sql`

Cada `toUpsert` llama al RPC **`pm_upsert_version`**, que de forma atómica:
- si no existe el `entity_id` → inserta fila `is_current=true` → devuelve `'created'`.
- si existe pero cambió el `content_hash` **o** el `tipo` → marca la vieja `is_current=false`
  e inserta la nueva como vigente → devuelve `'versioned'`.
- si coinciden hash **y** tipo → no hace nada → `'unchanged'`.

> El gate del RPC incluye `tipo` además de `content_hash` (coherente con `reconcile`): una
> reclasificación con cuerpo idéntico también amerita una nueva versión.

Cada `toTombstone` llama a **`pm_tombstone`** (marca `deleted=true`, cierra la versión
vigente). El modelo es **append-only**: nunca se hace UPDATE destructivo ni DELETE, así
`pm_traza` puede reconstruir toda la historia de un símbolo.

```
pm_index (una fila = una versión de una entidad)
  id, project_id, entity_id, is_current, deleted,
  tipo, commit_sha, content_hash,
  nombre, descripcion, librerias[], dependencias[], archivo, ruta,
  created_at, embedding vector(1536),
  detalles jsonb,        -- firma/contenedor/constantes(+valores)/pares y resumen de config
  cobertura real,        -- ratio de líneas del archivo cubiertas por símbolos (solo código)
  texto_busqueda text,   -- texto compuesto que se embebe; alimenta el canal léxico (GIN)
  cambio text,           -- changelog: qué cambió vs. la versión anterior (null en altas)
  hash_anterior text,    -- content_hash del predecesor; encadena la traza
  magnitud_cambio text,  -- cosmetico|firma|logica|mixto|eliminado
  cuerpo text            -- cuerpo enmascarado/acotado, base del diff; NO viaja en las tools
índices: idx_embed (HNSW, coseno) · idx_lexico (GIN, tsvector) · idx_current · idx_entity
```

---

## ④ El proceso completo de un commit: de git a la base de datos

Las etapas ①–③ describen **un archivo**. Un commit normalmente toca **varios**, y hay
dos formas de llegar a la DB (los dos casos de uso de `prompt.md §3`). Ambas terminan
en el mismo orquestador `applyCommit()`; lo único que cambia es **qué conjunto de
archivos** se le pasa.

### 4.1 Lado git — de dónde sale la metadata del commit

El indexador no commitea en git; **lee** el estado de git para sellar cada fila. En
`cli.ts` (`gitMeta`) se obtiene:
- **`commit_sha`** = `git rev-parse HEAD` (o el valor de `--commit`, o `"initial"` si
  no hay repo git).
- **`created_at`** = fecha del commit (`git show -s --format=%cI HEAD`).

Esos dos valores se estampan en **todas** las filas nuevas que produzca este pase, de
modo que cada versión queda atada al commit que la originó (trazabilidad, D5).

### 4.2 Determinar el conjunto de archivos cambiados

| Caso de uso | Conjunto de archivos | Cómo se obtiene hoy |
|---|---|---|
| **CU-1/CU-2 — bootstrap** (mapear un repo nuevo o ya existente) | **todo** el árbol indexable **no ignorado por git** | `discoverFiles()` en `cli.ts` usa `git ls-files --cached --others --exclude-standard` (versionados + no-versionados-no-ignorados), filtra por indexabilidad y tamaño ≤ 1 MB. Si no es repo git, cae al `walk()` con el `IGNORE` mínimo hardcodeado |
| **Commit incremental** (solo el diff de un push) | **solo** los archivos tocados por el commit | Se le pasa a `applyCommit` la lista de `FileChange` del diff. **El cómputo del diff aún NO está automatizado** (ver 4.5) |

> **Esencia del proyecto: nunca se leen archivos ignorados por `.gitignore`.** Por eso el
> bootstrap se apoya en `git ls-files --exclude-standard` en vez de recorrer el disco a
> ciegas. La ruta incremental no necesita filtro extra: un diff de git nunca incluye
> archivos ignorados. Los ejecutables **sin extensión** se detectan leyendo solo el primer
> renglón (shebang), sin abrir el archivo entero.

La maquinaria de versionado es idéntica en ambos casos; el bootstrap es simplemente el
caso degenerado donde el "diff" es el repo completo. Re-correr el bootstrap es seguro e
idempotente: lo que no cambió cae en `unchanged` y no se re-embebe.

### 4.3 Cómo se representa cada cambio — `FileChange`

Cada archivo del conjunto se modela como un `FileChange` (`apply.ts`):

```ts
interface FileChange {
  ruta: string;
  contenido: string | null; // null  ⇒  el archivo fue ELIMINADO en este commit
}
```

- **Añadido / modificado** → `contenido` = texto nuevo.
- **Eliminado** → `contenido = null`. En `applyFile`, esto hace que `entries = []`, así
  que **todas** las entidades vigentes de ese archivo quedan en `toTombstone`.
- **Renombrado** → llega como dos `FileChange`: el viejo con `contenido=null` (sus
  entidades se tumban) y el nuevo con el texto (altas con `entity_id` distinto, porque
  el `entity_id` depende de la `ruta`). Es decir, *rename = borrado + alta* (D9).

### 4.4 Aplicación atómica — recorrido completo

`applyCommit()` itera `applyFile()` sobre cada `FileChange`. Por cada archivo se ejecuta
exactamente el ciclo de las etapas ②–③:

```
para cada FileChange del commit:
  ① clasificar (extractFile)               → ¿code / md / html / ejecutable / config / ignorado?
  ② extraer entidades                       → IndexEntry[]   (o [] si fue borrado)
  ③ currentEntitiesForFile(project, ruta)   → estado vigente en DB
     reconcileFile(...)                      → { toUpsert, toTombstone, unchanged }
     para cada toUpsert:  describir → embeber → pm_upsert_version  ('created'|'versioned')
     para cada toTombstone:                    pm_tombstone        (borrado lógico)
acumular stats: { created, versioned, unchanged, tombstoned }
```

Puntos clave del alta en DB:
- **Atomicidad por entidad:** cada alta/versión pasa por el RPC `pm_upsert_version`,
  que decide dentro de la transacción de Postgres si inserta, versiona o no hace nada.
  No hay estado intermedio inconsistente.
- **Append-only:** nunca se hace UPDATE destructivo ni DELETE. Versionar = marcar la
  vieja `is_current=false` + insertar la nueva; borrar = `pm_tombstone` (`deleted=true`).
  Por eso `pm_traza` puede reconstruir la historia completa.
- **Gate de costo:** lo `unchanged` no se describe ni se embebe (0 llamadas al LLM /
  al embedder). Verificado: re-indexar sin cambios = 0 llamadas a OpenAI.
- **Reporte final:** el CLI imprime `altas / versiones / sin-cambio / tombstones` y, si hubo
  HTMLs ambiguos, los lista como **pendientes** con el snippet de `pm-ai.overrides.json` a
  rellenar (no se indexan hasta que el dev decida `pagina`/`reporte`).

### 4.5 Disparo del proceso (estado actual y pendiente)

- **Hoy (manual):** se lanza el CLI `pm-index <project_id> <ruta-repo> [--commit <sha>]`.
  Registra el proyecto en `pm_projects` (no crea una tabla por proyecto) y corre el
  bootstrap completo. Sirve para el mapeo inicial y para re-indexar.
- **Pendiente (incremental automático, D6):** un **webhook de GitHub** (orquestado con
  n8n) que, en cada push, calcule el diff del commit y llame al indexador **solo con los
  archivos cambiados** (incluyendo los borrados como `contenido=null`). La función
  `applyCommit` ya acepta esa forma; lo que falta es el disparador que arme el
  `FileChange[]` desde el diff de git. Mientras tanto, el commit incremental se simula
  corriendo el bootstrap (idempotente, pero recorre todo el árbol).

---

## Mapa de archivos (dónde vive cada parte de la lógica)

| Etapa | Responsabilidad | Archivo |
|---|---|---|
| Orquestación | encadena las 3 etapas por archivo y por commit | `packages/indexer/src/apply.ts` |
| ① Clasificación | nombre/contenido → extractor; config/ejecutable/exclusiones | `apply.ts` (`extractFile`), `classify.ts`, `extract_code.ts` (`languageForFile`) |
| ② Código | parseo tree-sitter → símbolos; `funcion`/`endpoint` | `packages/indexer/src/extract_code.ts` |
| ② Markdown | chunks por encabezado + breadcrumb | `packages/indexer/src/chunk_markdown.ts` |
| ② HTML | `reporte`/`pagina` (clasificación + overrides) | `packages/indexer/src/extract_html.ts` |
| ② Config | mini-manifiesto (`json`/`yaml`/`config`) | `packages/indexer/src/extract_config.ts` |
| ② Ejecutable | qué hace el script (`ejecutable`) | `packages/indexer/src/extract_executable.ts` |
| ② SQL | resumen de queries (`query`) | `packages/indexer/src/extract_sql.ts` |
| ② Estilos | qué define la hoja (`estilos`) | `packages/indexer/src/extract_styles.ts` |
| ③ Identidad/hash | `entity_id` y `content_hash` | `packages/core/src/hash.ts` |
| ③ Reconciliación | upsert / tombstone / unchanged | `packages/indexer/src/reconcile.ts` |
| ③ Descripción | descripción ≤2 oraciones + `describeChange` (delta) (LLM/fallback) | `packages/indexer/src/describe.ts` |
| ③ Magnitud del cambio | clasifica el delta (cosmetico/firma/logica/mixto) + plantilla | `packages/indexer/src/magnitud.ts` |
| ③ Embeddings | vectorización del texto compuesto (`embed_text.ts`) | `packages/core/src/embeddings.ts` |
| ③ Persistencia | tabla, RPCs SCD-2 (`pm_upsert_version`, `pm_tombstone`) | `packages/core/src/schema.sql`, `packages/core/src/db.ts` |
| Entrada CLI | recorre repo, registra proyecto, lanza `applyCommit` | `packages/indexer/src/cli.ts` |
