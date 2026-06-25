# PM·AI — Documento de desarrollo para Claude Code

> **Propósito de este archivo.** Este es el documento maestro de construcción del sistema **PM·AI** de Engine CX. Condensa todas las decisiones de arquitectura tomadas en la sesión de alineación del 16/06/2026 y las conversaciones posteriores. Claude Code debe leer este documento completo antes de escribir una sola línea de código, y debe respetarlo como fuente de verdad. Cualquier desviación se discute, no se asume.

---

## 1. ¿Qué vamos a desarrollar?

Un **asistente de IA que funciona como Project Manager**, acompañante de principio a fin de todos los proyectos de la empresa (enfocado por ahora a **desarrollo de software**). El sistema concentra toda la información de cada proyecto —PRD, plan de desarrollo, estado actual, avances diarios, transcripts de reuniones, updates manuales y la propia base de código— y permite consultarla y mantenerla con lenguaje natural, **sin que el agente tenga que leer documentos ni repositorios completos**.

El sistema resuelve cuatro dolores reales:

1. **Información dispersa** entre reuniones, correos y chats que nadie vuelve a ver.
2. **Actualizaciones manuales** costosas para reportar avances.
3. **Falta de trazabilidad** sobre por qué y cuándo se tomó una decisión o se comprometió una fecha.
4. **Reportes que toman horas** y que podrían generarse solos si la información estuviera bien organizada.

### El principio rector

> El agente nunca lee todo. Navega una capa de metadata e índices, decide qué necesita, y solo entonces recupera el fragmento exacto.

Esto aplica por igual a la **documentación** (recuperación semántica) y a la **base de código** (recuperación estructural por símbolos). Es lo que mantiene el consumo de tokens bajo y controlable.

---

## 2. Decisiones de arquitectura (cerradas)

Estas decisiones ya están tomadas. No re-litigar; ejecutar.

| # | Decisión | Razón |
|---|----------|-------|
| D1 | **El entregable es un Plugin de Claude Code**, no una skill suelta ni un CLI propio. | Es la unidad instalable, versionada y repartible a toda la organización. Reutiliza Claude Code como runtime (sesiones, tools, permisos, multiplataforma). |
| D2 | **El RAG vive en un backend externo: Supabase (Postgres + pgvector).** | Externo, administrado, ya en uso en la empresa. pgvector da embeddings + metadata jerárquica en la misma DB. |
| D3 | **Una sola tabla unificada** contiene tanto símbolos de código como chunks de documentación, discriminados por la columna `tipo`. | Una sola interfaz de recuperación; el agente filtra qué busca. |
| D4 | **Código → recuperación estructural (tree-sitter + índice de símbolos). Documentación → recuperación semántica (chunks + embeddings).** No se embeben los cuerpos de código. | El código cambia a diario (churn), la similitud vectorial es imprecisa para código, y embeber todo es caro. |
| D5 | **Versionado append-only con identidad lógica estable** (`entity_id`), bandera `is_current` (SCD Type 2) y detección de cambio por `content_hash`. | Da traza/historia limpia y re-indexa solo lo que cambió. |
| D6 | **Indexado incremental por push** (webhook de GitHub orquestado con n8n): solo se re-procesan los archivos que cambiaron. | Nada de re-indexar todo el repo en cada commit. |
| D7 | **Carpeta de guías/criterios de la organización, versionada en GitHub**, de lectura obligatoria antes de generar o modificar código. | Estandarización; evitar "satélites" (cada proyecto haciendo lo suyo). |
| D8 | **Archivo de estado por proyecto (`ESTADO.md`)** que el agente mantiene al día bajo el flujo propuesta → revisión → confirmación. | Memoria entre sesiones; el humano siempre confirma. |
| D9 | **Renombrar/mover una función se trata como borrado + alta nueva.** No se invierte en detección de renames de git para la v1. | Simplicidad para el MVP. |
| D10 | **Se eliminan los campos de línea de inicio/fin.** El agente localiza el símbolo por nombre dentro del archivo (grep/lectura dirigida). | Los números de línea se vuelven stale al instante; grep por nombre es robusto. |
| D11 | **Capa proxy/adaptador para el LLM** (OpenRouter + fallback directo a un proveedor). | Poder migrar entre Claude/Gemini/GPT cambiando una API key; resiliencia si OpenRouter cae. |
| D12 | **Scope por proyecto** (`project_id`) y repos separados por unidad de negocio (Engine vs Go Virtual). | GitHub no hereda permisos por carpeta; la separación por repo es la única forma de aislar accesos. |

### Alcance del MVP (julio)

- **SÍ hace:** mapear proyectos nuevos y existentes, indexar código y docs, mantener el estado al día, responder consultas en lenguaje natural, proponer actualizaciones de estado, seguir las guías de la organización.
- **NO hace (todavía):** front amigable para usuarios no técnicos, roles/permisos de escritura granulares, bot de Telegram para consulta de seguros, generación automática de decks ejecutivos. Eso es **fase 2**.
- **Usuarios del MVP:** perfil técnico medio-alto (Dani, Tony, Yari, + equipo TI), operando en Claude Code (VS Code / Desktop / CLI).

---

## 3. Casos de uso

### CU-1 — Arranque de proyecto nuevo con el PM
El PM inicializa el proyecto: genera la estructura base **siguiendo las guías de la organización** (stack, gestión de paquetes, convenciones), crea el PRD y el plan de desarrollo a partir de plantillas, e inicia el `ESTADO.md`. A partir de aquí, todo crece bajo el control del PM.

### CU-2 — Inicialización del PM en proyecto ya empezado (`/pm-init`)
El PM se introduce en un proyecto existente y, con algo semejante a `claude init`, **mapea todo**: qué funciones hay, qué documentación existe, qué falta documentar. Genera:
- La **base simbólica del código** (poblando la tabla unificada vía tree-sitter).
- El **RAG de la documentación** existente (chunking + embeddings).
- El **mapa del repo** (`code-map.md`, la "brújula").
- Documenta lo que haga falta y crea el `ESTADO.md` inicial.

Una vez inicializado, el proyecto continúa como de costumbre (CU-3).

### CU-3 — Operación continua (mantenimiento de la memoria)
Conforme el proyecto crece, el PM mantiene la documentación y el índice **al día**: maneja modificaciones, eliminaciones y nuevas entradas de código y de documentación correctamente, re-versionando solo lo que cambió en cada commit.

### CU-4 — Procesar un transcript / update y proponer estado
Llega un transcript de reunión o un update manual del PM. El agente lo lee, extrae highlights por proyecto (fechas comprometidas, responsables, blockers, próximos pasos), y **propone** una actualización del `ESTADO.md`. El humano revisa, corrige y confirma. Nunca se actualiza sin confirmación.

### CU-5 — Consulta en lenguaje natural
"¿Cuál es el estado del proyecto X, qué bloqueadores tiene y qué sigue?" / "¿Qué proyectos tienen blockers esta semana?" El agente navega metadata e índices, recupera solo lo relevante y responde con información real.

### CU-6 — Traza de un cambio de código
"¿Cómo ha cambiado la función `crear_tabla()` y en qué commits?" El agente consulta la historia de ese `entity_id` y devuelve un **changelog por entidad**: cada versión con su `commit_sha`, fecha, **qué cambió** (`cambio`), la **magnitud** del cambio (`cosmetico|firma|logica|mixto|eliminado`) y el `hash_anterior` que encadena la historia. Con el comando **`/pm-trace`** (pasando una entidad, un archivo o un commit) genera además un **reporte HTML tipo bitácora** en `manager/traces/` con la línea de tiempo y el **diff por versión** (estilo git, `+N −M` con modal de rojo/verde). El `cambio`/diff se puebla de aquí en adelante (las versiones previas a esta capacidad no guardan el cuerpo para diffear).

### CU-7 — Auditoría de portfolio (gobernanza)
Cada cierto tiempo el PM revisa todos los proyectos activos + planeados y detecta **redundancias, contradicciones y dependencias cruzadas** entre proyectos (punto de Iván). Esto puede modificar los planes de desarrollo.

---

## 4. Funciones del sistema

1. **Mapeo / inicialización** de proyectos nuevos y existentes.
2. **Indexación estructural de código** (símbolos, dependencias, firmas) vía tree-sitter.
3. **Indexación semántica de documentación** (chunks + embeddings).
4. **Indexado incremental** disparado por commits (solo cambios).
5. **Navegación de código en tres niveles** sin leer archivos completos.
6. **Recuperación unificada** (código + docs) a través del MCP server.
7. **Mantenimiento del estado del proyecto** (`ESTADO.md`) bajo propuesta → revisión → confirmación.
8. **Extracción de highlights** de transcripts y updates.
9. **Consulta en lenguaje natural** multi-proyecto.
10. **Traza histórica y changelog por entidad** de cualquier símbolo o documento (qué cambió, magnitud y diff), con reporte HTML de bitácora vía `/pm-trace`.
11. **Aplicación de guías de la organización** en toda generación/modificación de código.
12. **Auditoría de portfolio** (redundancias / dependencias cruzadas).
13. **Capa proxy de LLM** intercambiable.

---

## 5. Esqueleto del sistema

```
pm-ai/                              # repositorio del plugin (versionado en GitHub)
├─ prompt.md                        # este documento
├─ CLAUDE.md                        # brújula raíz: apunta a guías, estado y convenciones
├─ .claude-plugin/
│  └─ plugin.json                   # manifiesto del plugin (skills, MCP, comandos)
│
├─ mcp/                             # MCP server: la capa RAG (código + docs)
│  ├─ src/
│  │  ├─ server.ts                  # registro de tools MCP
│  │  ├─ tools/
│  │  │  ├─ navegar_indice.ts       # devuelve el árbol de metadata de un proyecto
│  │  │  ├─ buscar.ts               # búsqueda híbrida (vector + filtros por tipo)
│  │  │  ├─ recuperar.ts            # trae filas/chunks específicos por id
│  │  │  ├─ traza.ts                # historia de un entity_id
│  │  │  └─ escribir_estado.ts      # propone cambios al ESTADO.md
│  │  ├─ db/
│  │  │  ├─ schema.sql              # tabla unificada + índices pgvector
│  │  │  └─ client.ts               # cliente Supabase
│  │  └─ index.ts
│  └─ package.json
│
├─ indexer/                         # ingesta e indexación
│  ├─ extract_code.ts               # tree-sitter → símbolos, firmas, dependencias
│  ├─ chunk_markdown.ts             # markdown → markdown_chunk por sección
│  ├─ extract_html.ts               # HTML → tipo=reporte
│  ├─ diff_commit.ts                # qué archivos/símbolos cambiaron (content_hash)
│  ├─ upsert.ts                     # versionado append-only + is_current + tombstones
│  └─ webhook_handler.ts            # entrada desde n8n / GitHub webhook
│
├─ skills/                          # flujos PM (skills de Claude Code)
│  ├─ pm-init/SKILL.md              # CU-1, CU-2: mapeo e inicialización
│  ├─ procesar-transcript/SKILL.md  # CU-4
│  ├─ consultar-proyecto/SKILL.md   # CU-5
│  ├─ mantener-docs/SKILL.md        # CU-3
│  └─ auditar-portfolio/SKILL.md    # CU-7
│
├─ commands/                        # slash commands
│  ├─ pm-init.md
│  ├─ estado.md
│  ├─ nuevo-prd.md
│  ├─ consultar.md
│  └─ auditar.md
│
├─ guias/                           # GUÍAS / CRITERIOS de la organización (D7)
│  ├─ README.md                     # índice y precedencia
│  ├─ stack.md
│  ├─ backend.md
│  ├─ frontend.md
│  ├─ gestion-paquetes.md
│  ├─ documentacion.md
│  └─ codigo.md
│
├─ plantillas/                      # templates que usan los PMs
│  ├─ PRD.md
│  ├─ plan-desarrollo.md
│  ├─ transcript.md
│  ├─ update.md
│  └─ ESTADO.md
│
└─ tests/                           # unit + integración (ver §11)
   ├─ indexer/
   ├─ mcp/
   └─ flujos/
```

> **Por proyecto gestionado** (no en este repo, sino en cada repo de proyecto que el PM acompaña) viven, bajo `manager/`:
> - `PRD.md` — el **PRD** (único por proyecto), siguiendo la estructura de Engine. Qué se construye y por qué.
> - `gantt/` — el **plan de desarrollo con fechas** (Gantt). Cómo se descompone y ejecuta; se deriva del PRD con la skill de planeación de superpowers (documento **distinto** del PRD).
> - `transcripts/` — transcripts/documentos **originales** de reuniones asociados al proyecto.
> - `transcripts-procesados/` — **condensados** de cada transcript (solo lo relevante para el PRD).
> - `ESTADO.md` — estado vivo del proyecto (§10).
> - `code-map.md` — brújula del repo.
> - `updates/` — updates manuales del PM.

---

## 6. Modelo de datos — la tabla unificada

Una sola tabla en Supabase (Postgres + pgvector). Cada fila es **una versión** de un símbolo de código o un chunk de documentación.

```sql
create extension if not exists vector;

create type pm_tipo as enum (
  'funcion',          -- función / método de código
  'endpoint',         -- ruta de API
  'reporte',          -- archivo HTML plano
  'markdown_chunk',   -- fragmento de un markdown (PRD, transcript, update, doc)
  'json',
  'yaml',
  'config',           -- otros archivos de configuración
  'ejecutable'        -- main.py, index.*, .sh y otros ejecutables
);

create table pm_index (
  id            bigint generated always as identity primary key,
  project_id    text        not null,           -- scope por proyecto (D12)
  entity_id     text        not null,           -- identidad lógica estable: hash(project_id + ruta + nombre)
  is_current    boolean     not null default true, -- SCD Type 2 (D5)
  tipo          pm_tipo     not null,            -- discriminador (D3)
  commit_sha    text        not null,           -- commit que introdujo esta versión
  content_hash  text        not null,           -- hash del cuerpo; gate de re-versionado (D5)
  nombre        text        not null,            -- nombre de función/archivo/endpoint
  descripcion   text        not null,            -- código: ≤2 oraciones (qué hace + qué requiere)
                                                 -- markdown_chunk: el contenido del chunk
  librerias     text[]      not null default '{}', -- requirements externos
  dependencias  text[]      not null default '{}', -- funciones internas, formato {archivo}.{funcion}
  archivo       text        not null,            -- nombre del archivo
  ruta          text        not null,            -- ruta relativa desde la raíz del proyecto
  created_at    timestamptz not null,           -- fecha del commit
  deleted       boolean     not null default false, -- tombstone (D9: renames = borrado + alta)
  embedding     vector(1536)                     -- embedding de `descripcion`
);

-- Índices para el patrón de acceso dominante (estado actual por proyecto)
create index idx_current  on pm_index (project_id, tipo) where is_current and not deleted;
create index idx_entity   on pm_index (entity_id, created_at desc);     -- traza histórica
create index idx_embed    on pm_index using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

### Reglas de las columnas

- **`tipo`**: el agente filtra por aquí. `reporte` = **solo HTML**. Cualquier markdown se parte en `markdown_chunk` (uno por sección/fragmento), donde `descripcion` = contenido del chunk y `embedding` = embedding del chunk.
- **`entity_id`**: identidad lógica estable = `hash(project_id + ruta + nombre)`. Es la clave de agrupación, **no** el nombre crudo (los nombres no son únicos).
- **`dependencias`**: en formato `{archivo}.{funcion}` (como se importa; ej. en Python `usuarios.crear_tabla`). **Es el grafo de código**, guardado como listas de adyacencia; se navega con `RECURSIVE CTE` en SQL puro, sin graph DB aparte.
- **`embedding`**: solo sobre `descripcion`. Para código eso es la descripción de ≤2 oraciones; para `markdown_chunk` es el contenido del chunk.
- **Sin líneas de inicio/fin** (D10): el agente localiza el símbolo por nombre dentro del archivo.

### Versionado y traza (el ejemplo de `crear_tabla()`)

1. `crear_tabla()` existe, indexada con su `commit_sha`, `content_hash` y `is_current = true`.
2. Llega un commit donde la query del `CREATE TABLE` cambió. El indexador calcula el nuevo `content_hash`:
   - Si **es igual** → no se toca nada (no cambió de verdad).
   - Si **cambió** → se inserta una **fila nueva** (misma `entity_id`, nuevo `commit_sha`, nuevo `content_hash`, nueva `descripcion`/`embedding`, `is_current = true`) y se marca la versión anterior `is_current = false`.
3. **Navegar (estado actual):** `WHERE project_id = ? AND is_current AND NOT deleted AND tipo = 'funcion'`.
4. **Traza (historia):** `WHERE entity_id = ? ORDER BY created_at` → cada versión con su `commit_sha`.
5. **Borrado / rename:** se inserta un tombstone (`deleted = true`) para el `entity_id` viejo y, si es rename, un alta nueva con el nuevo `entity_id`.

---

## 7. Navegación de código — tres niveles

El agente baja de barato a caro y **se detiene en cuanto tiene lo que necesita**:

1. **Mapa del repo** (`code-map.md`, la brújula) → qué módulos existen y de qué se encarga cada uno. Una pantalla.
2. **Índice de símbolos en Supabase** (`buscar` / `navegar_indice`) → `nombre · descripcion · librerias · dependencias · archivo · ruta`. El agente sabe **exactamente dónde** está cada cosa sin leer nada.
3. **Lectura quirúrgica** → el agente abre solo ese archivo y localiza el símbolo por nombre (grep/lectura dirigida).

Para documentación el flujo es análogo: `navegar_indice` (jerarquía de secciones) → `buscar` (vector + filtro) → `recuperar` (el chunk exacto).

---

## 8. Ingesta e indexación

- **Código → tree-sitter.** Parseo determinista y cross-lenguaje (cubre .NET/C#, React/TS, Python, shell). Extrae funciones/métodos/endpoints, firmas, librerías importadas y dependencias internas. **Barato; sin embeddings de cuerpos.** Solo se embebe la `descripcion` generada.
- **Markdown → chunker por sección/título.** Una fila `markdown_chunk` por fragmento, con su jerarquía. Aprovecha que el markdown es trivial de partir por encabezados.
- **HTML → `tipo=reporte`** (archivo plano).
- **Incremental (D6):** el webhook de GitHub (orquestado con n8n) entrega el diff del commit. El indexador:
  1. Identifica archivos tocados.
  2. Re-parsea solo esos archivos.
  3. Recalcula `content_hash` por símbolo/chunk; re-versiona **solo** los que cambiaron.
  4. Emite tombstones para lo eliminado.
- **Descripción de símbolos:** se genera con el LLM **solo para símbolos cuyo `content_hash` cambió** (gate de costo).

---

## 9. Prompt engineering — Archivos de guía (`guias/`)

> Esta es una de las dos piezas de prompt engineering más importantes del sistema. El objetivo: que Claude Code **nunca** genere código con el stack que "se le antoje", sino siguiendo los criterios de la organización. Evita los "satélites".

### 9.1 Mecanismo de aplicación

La adherencia se fuerza en tres capas:

1. **`CLAUDE.md` raíz** (cargado en cada sesión) incluye un bloque imperativo:

   ```markdown
   ## Guías de la organización — LECTURA OBLIGATORIA
   Antes de generar o modificar CUALQUIER código, DEBES leer las guías en `guias/`
   relevantes a la tarea. Estas guías tienen PRECEDENCIA sobre tus defaults y sobre
   patrones que conozcas de tu entrenamiento.

   Precedencia (de mayor a menor):
   1. Instrucción explícita del usuario en esta sesión.
   2. Guías de `guias/`.
   3. Tus defaults.

   Si una instrucción del usuario CONTRADICE una guía, DETENTE y señálalo antes de
   continuar. No resuelvas el conflicto en silencio.
   ```

2. **La skill `mantener-docs` / `pm-init`** incluye en su descripción el trigger de carga de guías, de modo que se activen cuando se va a tocar código.

3. **Checklist de cierre**: antes de proponer un cambio de código, el agente verifica contra la guía y reporta explícitamente "Cumple `guias/stack.md`, `guias/gestion-paquetes.md`".

### 9.2 Contenido concreto de las guías (estado inicial, debatido en la sesión)

**`guias/stack.md`**
```markdown
# Stack estándar de Engine CX
- Toda arquitectura cliente-servidor SEPARA frontend de backend.
- Backend: .NET Core 8 con C#. Razón: aprovechamos los mecanismos de seguridad
  y autenticación que Microsoft ya implementa en el framework.
- Frontend: React (preferido). Vue permitido.
- PROHIBIDO: Laravel (incompatibilidades entre versiones mayores), HTML puro
  (estamos en época de frameworks, no en los 90).
```

**`guias/gestion-paquetes.md`**
```markdown
# Gestión de paquetes
- Usa SIEMPRE pnpm. NUNCA npm ni yarn.
- Si encuentras package-lock.json, conviértelo a pnpm-lock.yaml y elimínalo.
```

**`guias/backend.md`**
```markdown
# Backend
- .NET Core 8 + C#. Usa el framework de autenticación/seguridad nativo de Microsoft.
- Capa proxy/adaptador para el LLM: toda comunicación con modelos pasa por un
  adaptador único. Por defecto OpenRouter (cambiar de modelo = cambiar API key).
  Mantener un fallback directo a un proveedor por si OpenRouter cae. NUNCA acoples
  el código directamente a un SDK de un proveedor específico.
```

**`guias/frontend.md`**, **`guias/documentacion.md`**, **`guias/codigo.md`**: análogos, con convenciones de documentación de avances y estándares de código.

### 9.3 Formato de cada guía

Cada guía debe tener: **regla** (imperativa), **razón** (por qué), y **ejemplos** (✅ correcto / ❌ incorrecto). La razón importa: permite al agente decidir bien en casos no contemplados.

---

## 10. Prompt engineering — Archivo de estado (`ESTADO.md`)

> La segunda pieza crítica de prompt engineering. Inspirada en el patrón *session state*: el agente no se avienta toda la construcción de una sentada; documenta dónde quedó para retomar sin perder contexto.

### 10.1 Protocolo (imperativo, va en `CLAUDE.md` y en las skills)

```markdown
## Protocolo del archivo de estado (ESTADO.md)
1. AL INICIAR cualquier sesión de trabajo sobre un proyecto, tu PRIMERA acción es
   LEER el ESTADO.md de ese proyecto. Obligatorio, sin excepción.
2. Trabajas la sesión apoyándote en el plan de desarrollo y el estado.
3. AL CERRAR la sesión, ACTUALIZAS ESTADO.md: qué pasó, qué quedó hecho, qué falta,
   el próximo paso y cualquier decisión tomada.
4. NUNCA cambias fechas comprometidas, entregables o responsables sin confirmación
   explícita del humano. Flujo SIEMPRE: propones → el humano revisa → confirma.
5. Cada decisión que registres lleva fecha y razón (para trazabilidad).
```

### 10.2 Estructura de `ESTADO.md`

```markdown
# ESTADO — <Proyecto>
- Última actualización: <fecha> · Commit: <sha>
- Estado: On track | En riesgo | Bloqueado
- Responsable: <nombre>

## Resumen ejecutivo
<2-4 líneas: dónde está el proyecto hoy>

## Plan de desarrollo (fases y fechas tentativas)
- [x] Fase 1 — ... (entregado <fecha>)
- [ ] Fase 2 — ... (compromiso <fecha>)

## Hecho
- ...
## En progreso
- ...
## Pendiente / próximos pasos
- ...

## Bloqueadores
- <blocker> · responsable · desde <fecha>

## Fechas compromiso
| Entregable | Responsable | Fecha | Estado |

## Bitácora de decisiones (trazabilidad)
- <fecha> — <decisión> — <razón> — <quién>

## Bitácora de sesiones
- <fecha> — qué se hizo — dónde quedó — próximo paso
```

### 10.3 Flujo propuesta → revisión → confirmación (CU-4)

Cuando el agente procesa un transcript/update y quiere actualizar el estado, **presenta un diff propuesto** ("encontré estas fechas, estos blockers, estos próximos pasos; ¿confirmo?") y espera la confirmación del humano. Si el humano corrige, el agente aprende del contexto adicional y reescribe la propuesta. Solo tras confirmar, escribe en `ESTADO.md`.

---

## 11. Plan de desarrollo en tres etapas

Cada etapa entrega algo funcional y verificable. **Cada etapa define su propio unit testing**, y al cierre de cada una se corre la suite completa antes de avanzar.

### Etapa 1 — Núcleo de indexación y RAG (la memoria)

**Objetivo:** que el sistema pueda mapear un proyecto y recuperar código/docs sin leer todo.

**Entregables:**
- `mcp/db/schema.sql` desplegado en Supabase (tabla + índices pgvector).
- Indexador: `extract_code.ts` (tree-sitter), `chunk_markdown.ts`, `extract_html.ts`, `diff_commit.ts`, `upsert.ts`.
- MCP server con tools: `navegar_indice`, `buscar`, `recuperar`, `traza`.
- Comando `/pm-init` que mapea un proyecto existente (CU-2).

**Diseño de unit testing (criterios de éxito):**
- `chunk_markdown`: un markdown de N secciones produce N filas `markdown_chunk` con la jerarquía correcta.
- `extract_code`: sobre un archivo de prueba (Python/C#/TS) extrae el conjunto exacto de funciones, sus `librerias` y sus `dependencias` en formato `{archivo}.{funcion}`.
- `content_hash`: re-indexar el mismo commit **no** crea filas nuevas; cambiar el cuerpo de una función **sí** crea exactamente una fila nueva y marca la anterior `is_current = false`.
- `entity_id`: estable ante cambios de cuerpo; distinto ante cambio de ruta/nombre.
- Tombstones: eliminar una función produce una fila `deleted = true` y deja de aparecer en consultas de estado actual.
- `buscar`: una consulta semántica devuelve el chunk/símbolo relevante en el top-k; filtro por `tipo` excluye los demás tipos.
- `traza`: devuelve todas las versiones de un `entity_id` ordenadas, cada una con su `commit_sha`.

**Criterio de paso de etapa:** mapear un repo real y responder "¿dónde está la función que hace X?" leyendo solo el índice + el símbolo, sin abrir el repo completo.

### Etapa 2 — Plugin PM, guías y estado (el acompañante)

**Objetivo:** convertir el núcleo en un acompañante que sigue las guías y mantiene el estado.

**Entregables:**
- Manifiesto del plugin (`plugin.json`), `CLAUDE.md` raíz, comandos.
- Carpeta `guias/` con contenido de §9.2 + plantillas (`plantillas/`).
- Skills: `pm-init` (CU-1), `procesar-transcript` (CU-4), `consultar-proyecto` (CU-5), `mantener-docs` (CU-3).
- Sistema `ESTADO.md` con el flujo propuesta → revisión → confirmación.
- Indexado incremental por webhook (`webhook_handler.ts` + n8n).

**Diseño de unit testing (criterios de éxito):**
- Adherencia a guías: pedir "crea un proyecto Node" produce configuración con **pnpm** (no npm); pedir un backend produce **.NET Core 8/C#**; intentar HTML puro o Laravel dispara una advertencia.
- Conflicto de guías: una instrucción que contradice una guía **detiene** al agente y lo reporta (no resuelve en silencio).
- Ciclo de estado: al iniciar sesión el agente lee `ESTADO.md` primero; al cerrar, lo actualiza con bitácora de sesión.
- Propuesta → confirmación: procesar un transcript de prueba genera un **diff propuesto** y **no** escribe hasta confirmar; un cambio de fecha sin confirmación es rechazado.
- Incremental: un push que toca 1 archivo re-indexa solo ese archivo.

**Criterio de paso de etapa:** Dani/Tony/Yari pueden inicializar un proyecto, subir un transcript y obtener una propuesta de estado correcta y confirmable.

### Etapa 3 — Portfolio, gobernanza y proxy (la visión)

**Objetivo:** visión transversal del portfolio y resiliencia del LLM.

**Entregables:**
- Skill `auditar-portfolio` (CU-7): detecta redundancias, contradicciones y dependencias cruzadas entre proyectos.
- Consultas multi-proyecto.
- Capa proxy/adaptador del LLM (OpenRouter + fallback directo).
- Alertas: proyectos sin update > 7 días, fechas de entrega próximas.

**Diseño de unit testing (criterios de éxito):**
- Auditoría: sobre un set con dos proyectos que duplican una función, la detecta y la reporta; detecta una dependencia cruzada declarada.
- Multi-proyecto: "¿qué proyectos tienen blockers esta semana?" cruza los `ESTADO.md` correctos.
- Proxy: cambiar la API key cambia de modelo sin tocar código; simular caída de OpenRouter activa el fallback.
- Alertas: un proyecto con `Última actualización` > 7 días genera alerta.

**Criterio de paso de etapa:** el sistema responde consultas que cruzan unidades y sobrevive a la caída del proveedor primario de LLM.

---

## 12. Estrategia de testing por función

Tras las tres etapas, **se prueba cada función del código** de forma sistemática:

1. **Cobertura por símbolo:** toda función pública del indexador y del MCP server tiene al menos un test unitario con caso feliz + un borde.
2. **Fixtures reales:** un mini-repo de prueba con código en al menos dos lenguajes del stack (C# y TS) + markdown + HTML, para validar extracción cross-lenguaje.
3. **Tests de idempotencia:** re-correr la indexación sobre el mismo commit no muta la DB.
4. **Tests de regresión de versionado:** secuencia commit A → B → C sobre la misma función produce 3 versiones con `is_current` correcto solo en la última.
5. **Tests de los flujos (e2e):** cada caso de uso (CU-1…CU-7) tiene un test de integración que ejercita el camino completo.
6. **Tests de prompt engineering:** assertions sobre que las guías se respetan y que el flujo de confirmación nunca escribe sin confirmar (se validan con transcripts/instrucciones de prueba y revisión del output).

> Regla: ninguna etapa se da por exitosa hasta que su suite de unit tests pasa en verde. El testing es parte del entregable de cada etapa, no un añadido posterior.

---

## 13. Stack tecnológico del propio sistema

| Componente | Tecnología | Nota |
|---|---|---|
| Repositorio / versionado | GitHub (repos privados, separados por unidad) | D7, D12 |
| Runtime del agente | Claude Code (plugin) | D1 |
| RAG / DB | Supabase (Postgres + pgvector) | D2 |
| MCP server + indexador | TypeScript / Node | **A confirmar con Alexis** dado el criterio de estandarización; el SDK de MCP y los bindings de tree-sitter son de primera clase en TS. |
| Parseo de código | tree-sitter | D4 |
| Orquestación de ingesta | n8n + webhook de GitHub | D6 |
| Transcripción de reuniones | Whisper (audio → texto) | fuente de entrada |
| Capa LLM | OpenRouter + adaptador con fallback | D11 |

---

## 14. Decisiones abiertas (para resolver antes/durante la construcción)

1. **Lenguaje del MCP server/indexador**: TS recomendado; confirmar con Alexis por el criterio anti-satélites.
2. **Dimensión del embedding** (1536 vs otra) según el modelo de embeddings elegido vía el adaptador.
3. **Estructura de carpetas multi-unidad en GitHub**: repos separados (Engine, Go Virtual) y cómo consulta liderazgo ambos a la vez.
4. **Migración inicial desde ClickUp**: export de actividades en curso para la carga inicial del sistema (fase posterior).
5. **Salida del Gantt**: Google Sheets para el MVP vs. ecosistema propio.

---

*Documento de desarrollo PM·AI · Engine CX · derivado de la sesión de alineación 16/06/2026 y conversaciones de arquitectura posteriores. Fuente de verdad para Claude Code.*
