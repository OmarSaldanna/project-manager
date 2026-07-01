# Spec — Integración con `enginecx_prd` (repo central de PRDs de la empresa)

**Fecha:** 2026-06-30
**Estado:** Aprobado para planeación
**Autor:** PM·AI + Omar (Engine CX)

## Contexto

Engine CX mantiene un repositorio central de PRDs en
`https://github.com/garantiplusmexico/enginecx_prd.git`. Queremos que cada proyecto
gestionado por PM·AI publique automáticamente su estado (`manager/`) en ese repo central,
bajo una carpeta con nombre canónico por proyecto, para tener todos los PRDs (y su contexto)
en un solo lugar versionado.

El repo central vive **una sola vez**, en la instalación del plugin, como
`${CLAUDE_PLUGIN_ROOT}/enginecx_prd/` (un clon que no se distribuye ni se versiona dentro del
repo del plugin). Cada proyecto que adopta PM·AI obtiene ahí una subcarpeta propia que es un
**reflejo (copia sincronizada)** de su `manager/`.

### Restricción técnica que define el diseño

Una **liga/symlink del SO** NO sirve: git no sigue symlinks al commitear (guarda el puntero,
no el contenido), y en Windows requiere privilegios. Por eso el reflejo se materializa como
una **carpeta real sincronizada por copia**, no como symlink. El "tiempo real" se vuelve un
paso de **sync explícito** disparado por el flujo del PM.

## Decisiones (cerradas en brainstorming)

1. **Reflejo = copia sincronizada** en carpeta real (no symlink). Git captura el contenido →
   pushea y clona bien en cualquier SO.
2. **Se sincroniza todo `manager/`** (PRD, gantt, traces, transcripts, transcripts-procesados,
   config.json), no solo el PRD.
3. **id de 4 dígitos** con hash **determinista** (`sha256`), no el `hash()` integrado de Python.
4. **Mapeo unidad → empresa** colapsa Garantiplus México y Colombia a `garantiplus`.
5. **Entrada del hash = `project_id`** (kebab estable), y se **persiste** el resultado en
   `manager/config.json`.
6. **Clonado:** bootstrap automático si `enginecx_prd/` no es un repo válido.
7. **Push:** commit local + push **bajo confirmación** (`pull --rebase` antes).
8. **Disparadores:** `/pm-init` (alta) + cada actualización de PRD (`/pm-prd` y cierre de
   `/pm-commit`).
9. **Helper en Node/TS** (no Python): el `sha256 % 10000` da el mismo número en cualquier
   lenguaje, así que se respeta la intención de "hash determinista del nombre" sin introducir
   un runtime nuevo.

## Arquitectura

### Componente nuevo: `packages/prd-sync` (bin `pm-prd-sync`)

Paquete aislado en el monorepo (igual patrón que `packages/mcp` y `packages/indexer`, que ya
exponen `bin`). Responsabilidad única: derivar identidad, espejar `manager/` y operar git
sobre `enginecx_prd/`. Se compila y testea con el resto (`pnpm -r build/test`). Los comandos
`.md` solo lo invocan vía `node ${CLAUDE_PLUGIN_ROOT}/packages/prd-sync/dist/cli.js <sub>`; no
contienen shell específico de SO.

**Resolución de rutas:** el helper resuelve `enginecx_prd/` relativo a la raíz del plugin
(`CLAUDE_PLUGIN_ROOT`, con fallback a la ubicación del propio script). El `manager/` objetivo
se pasa por argumento (`--manager`), porque vive en el repo del proyecto, no en el del plugin.

### Superficie del CLI

| Subcomando | Qué hace |
|---|---|
| `ensure-repo` | Si `enginecx_prd/` no es un repo git válido (o falta), lo clona desde `ENGINECX_PRD_REPO` usando el token. Idempotente: si ya es un clon del remote correcto, no hace nada. |
| `resolve-id --project-id <pid> --unidad "<unidad>" --config <ruta>` | Calcula `prd_id` (4 díg.) y `prd_dir` (`{id}_{empresa}`); aplica anti-colisión; **persiste** `prd_id`/`prd_dir` en el `manager/config.json` indicado por `--config`. Imprime el `prd_dir` resuelto. |
| `mirror --manager <ruta> --dir <prd_dir>` | Espejo de `manager/` → `enginecx_prd/<prd_dir>/`: copia todo y **borra** en destino lo que ya no exista en origen. |
| `commit --dir <prd_dir> --message "…"` | `git add <prd_dir>` + `git commit` dentro de `enginecx_prd/`, con identidad de committer del `.env`. No-op si no hay cambios. |
| `push` | `git pull --rebase` y luego `git push` al remote autenticado. Se invoca **solo tras confirmación** del usuario. |

> Nota de cohesión: `/pm-init` encadena `ensure-repo → resolve-id → mirror → commit`;
> `/pm-prd` y `/pm-commit` encadenan `mirror → commit`. El `push` siempre es un paso aparte,
> posterior a la confirmación humana.

## Modelo de identidad

- **id de 4 dígitos:** `int(sha256(project_id).hexdigest(), 16) % 10000`, con padding a 4
  dígitos (`0042`). Determinista y reproducible para el mismo `project_id`.
- **mapeo unidad → empresa** (cerrado; cualquier otro valor es error explícito):

  | Unidad (config.json) | Empresa (sufijo) |
  |---|---|
  | Go Virtual | `govirtual` |
  | Gplus Seguros | `gplusseguros` |
  | Invarat | `invarat` |
  | EngineCX | `enginecx` |
  | Garantiplus México | `garantiplus` |
  | Garantiplus Colombia | `garantiplus` |

- **carpeta:** `{prd_id}_{empresa}/` → p. ej. `0042_garantiplus/`.
- **persistencia:** `manager/config.json` pasa de
  `{ project_id, nombre, unidad, repo_url }` a
  `{ project_id, nombre, unidad, repo_url, prd_id, prd_dir }`. La carpeta es inmutable aunque
  cambie `nombre`.
- **anti-colisión:** si `enginecx_prd/<prd_dir>/` ya existe y su `config.json` interno tiene
  **otro** `project_id`, se prueba el siguiente id libre (sondeo lineal `(id+1) % 10000`) hasta
  encontrar uno disponible; se persiste el elegido. Si el `prd_dir` ya existe y pertenece al
  **mismo** `project_id` (re-init), se reutiliza.

## Flujo de datos (una sola dirección)

```
manager/  ──(mirror: copia + borra sobrantes)──▶  enginecx_prd/{prd_dir}/
```

- Es **espejo unidireccional**: nunca se escribe de vuelta a `manager/`.
- `enginecx_prd/` se mantiene **gitignored en `project-manager`** (repo anidado, vive solo
  local); se agrega `enginecx_prd/` al `.gitignore` del plugin.

## Git y credenciales

- **`.env`** (raíz del plugin, ya gitignored) lleva:
  ```
  ENGINECX_PRD_REPO=https://github.com/garantiplusmexico/enginecx_prd.git
  ENGINECX_PRD_GIT_USER=omarlaraenignecx
  ENGINECX_PRD_GIT_EMAIL=omar.lara@enginecx.com
  ENGINECX_PRD_GIT_TOKEN=
  ```
  Se anexan con `echo >>` (email y user pre-llenados; token vacío para que lo complete Omar).
- **Auth sin filtrar el token:** clone/push usan una URL autenticada
  `https://USER:TOKEN@github.com/…` construida en memoria al vuelo y pasada a git por
  subprocess; **nunca** se escribe el token en `.git/config` ni en el `remote`.
- **Identidad del committer:** `git -c user.name=… -c user.email=…` desde el `.env`.
- **Push bajo confirmación** siempre (repo compartido): `pull --rebase` antes de `push` para
  minimizar conflictos entre proyectos concurrentes.

## Errores / casos borde

- `.env` sin `ENGINECX_PRD_GIT_TOKEN` → `ensure-repo`/`push` fallan con mensaje claro (no
  intentan auth anónima ni dejan el token a medias).
- `enginecx_prd/` existe pero apunta a otro remote → se avisa y se detiene (no se sobrescribe).
- `unidad` que no mapea a las 5 empresas → error explícito (no inventa sufijo).
- `push` rechazado por conflicto tras `rebase` → se reporta y se deja el commit local para
  resolución manual.
- `mirror` cuando `manager/` no existe → error claro (el proyecto debe estar inicializado).

## Testing (vitest, como el resto del monorepo)

- **Hash determinista:** mismo `project_id` → mismo id en corridas distintas; padding a 4
  dígitos; cobertura de un par de nombres conocidos.
- **Mapeo unidad → empresa:** las 6 unidades, incluyendo México y Colombia → `garantiplus`;
  unidad inválida lanza error.
- **Anti-colisión:** dos `project_id` que caen en el mismo id → sondeo lineal asigna el
  siguiente libre; re-init del mismo proyecto reutiliza su `prd_dir`.
- **Mirror:** copia archivos nuevos/modificados y **borra** en destino los que ya no están en
  origen; opera sobre un directorio temporal.
- **URL autenticada:** se construye con USER:TOKEN y **no** se persiste el token (assertion
  sobre que `.git/config`/remote no lo contienen). Git y red se mockean.

## Fuera de alcance (YAGNI)

- Sincronización bidireccional o resolución automática de conflictos de `push`.
- Multi-usuario / multi-token (de momento, un solo conjunto de credenciales en `.env`).
- UI o reporte del estado del repo central.
- Migrar el catálogo de 6 unidades del plugin (se conserva; solo se mapea a 5 empresas).

## Archivos que toca la implementación

- **Nuevo:** `packages/prd-sync/` (`package.json` con `bin`, `tsconfig.json`, `src/` con la
  lógica + CLI, `src/*.test.ts`).
- **Editar:** `commands/pm-init.md` (encadenar `ensure-repo → resolve-id → mirror → commit` y
  ampliar el Paso 3 para que `config.json` incluya `prd_id`/`prd_dir`).
- **Editar:** `commands/pm-prd.md` y `commands/pm-commit.md` (encadenar `mirror → commit` +
  proponer `push`).
- **Editar:** `.gitignore` (añadir `enginecx_prd/`).
- **Editar:** `.env` (anexar las 4 entradas).
