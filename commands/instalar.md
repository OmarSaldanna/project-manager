---
description: "Instala PM·AI por primera vez tras añadir el plugin: coloca el .env en la raíz del plugin, resuelve las credenciales de GitHub del desarrollador (para no suplantar su cuenta), compila los paquetes del MCP y verifica que la conexión a la base de datos funcione. Se corre UNA sola vez, justo después de instalar el plugin."
argument-hint: "(sin argumentos)"
allowed-tools: Read, Write, Edit, Bash, mcp__pm-ai__pm_proyectos
---

Eres el **Project Manager con IA** ejecutando la **instalación de una sola vez** de PM·AI en la
máquina del desarrollador. Este comando se corre **una vez**, justo después de añadir el plugin,
para dejar el entorno listo: `.env` colocado, credenciales de GitHub **propias** del
desarrollador, paquetes compilados y conexión al índice (Supabase/MCP) verificada. Después de
esto, el flujo diario empieza en **`/pm-prd`**.

> **Por qué existe este comando.** `prd-sync` publica al repo central usando la **identidad y
> las credenciales de git YA configuradas en el equipo** (credential helper / `gh` / SSH); el
> `.env` **no** lleva credenciales de GitHub. Así nunca se distribuye ni se cachea el token de
> otra persona (la causa de la suplantación que veíamos antes). El Paso 2 solo **verifica** que
> el equipo tenga usuario git y acceso al repo, y si falta algo, guía al desarrollador a
> resolverlo por fuera (crear cuenta/token, pedir acceso).

## Reglas transversales (de CLAUDE.md — OBLIGATORIAS)

- **Toda solicitud de autorización o confirmación se hace SIEMPRE con un selector**
  (AskUserQuestion), nunca pidiendo texto libre. La pregunta del selector va **corta**; cualquier
  detalle va en un mensaje normal **antes** del selector.
- **NUNCA imprimas los valores de las credenciales.** Los chequeos reportan solo el **nombre** de
  cada clave (✓/✗), jamás su contenido.

## Paso 1 — Colocar el `.env` en la raíz del plugin

El `.env` vive en la **raíz del plugin** (`${CLAUDE_PLUGIN_ROOT}/.env`) y lo cargan el servidor
MCP y los CLIs (`prd-sync`) por su cuenta (Node lo lee, no Claude Code).

1. Si **ya existe** `${CLAUDE_PLUGIN_ROOT}/.env`, sáltate la copia y ve al chequeo.
2. Si **no existe**, copia la plantilla y pide al desarrollador que pegue/llene los valores que
   le compartieron (los 7 requeridos, ver abajo):
   ```bash
   cp "${CLAUDE_PLUGIN_ROOT}/.env.example" "${CLAUDE_PLUGIN_ROOT}/.env"
   echo "Creado ${CLAUDE_PLUGIN_ROOT}/.env — edítalo con tus valores."
   ```
   Indícale la **ruta exacta** del archivo y espera a que lo complete.

3. Verifica que estén **todas** las claves requeridas (reporta ✓/✗ por nombre, **sin** valores):

   ```bash
   ENV="${CLAUDE_PLUGIN_ROOT}/.env"
   [ -f "$ENV" ] || { echo "✗ No existe $ENV — copia .env.example a la raíz del plugin y complétalo"; exit 1; }
   miss=0
   for k in SUPABASE_URL SUPABASE_SERVICE_KEY PM_EMBEDDINGS_KEY ENGINECX_PRD_REPO; do
     v=$(grep -E "^${k}=" "$ENV" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^[[:space:]]*//; s/[[:space:]]*$//')
     case "$v" in
       ""|*...|"https://TU-PROYECTO.supabase.co"|*"/ORG/"*)
         echo "✗ $k — falta o sigue con valor de ejemplo"; miss=1 ;;
       *) echo "✓ $k" ;;
     esac
   done
   [ "$miss" -eq 0 ] && echo "OK: .env completo" || { echo "INCOMPLETO — completa las claves ✗ antes de seguir"; exit 1; }
   ```

   Claves requeridas: **Índice/MCP** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `PM_EMBEDDINGS_KEY`. **Repo central** — `ENGINECX_PRD_REPO` (solo la ubicación del repo; el
   `.env` **ya no lleva** credenciales de GitHub — esas las aporta el git del equipo, ver Paso 2).
   Si el chequeo falla, dile **qué claves** faltan (por nombre) y **no avances** hasta que pase.

## Paso 2 — Verificar el git del equipo (identidad + acceso al repo central)

`prd-sync` clona/commitea/pushea a `enginecx_prd` con la **identidad y credenciales de git ya
configuradas en el equipo** — NO con datos del `.env`. Aquí solo **verificas** que todo esté
listo; nunca escribes credenciales en ningún lado.

Corre este preflight (no revela secretos: `ls-remote` usa el credential helper/SSH del equipo):

```bash
ROOT="${CLAUDE_PLUGIN_ROOT}"
echo "— git instalado —"; git --version || { echo "✗ git no está instalado"; }
echo "— identidad git —"
n=$(git config --get user.name); e=$(git config --get user.email)
[ -n "$n" ] && echo "✓ user.name: $n" || echo "✗ user.name sin configurar"
[ -n "$e" ] && echo "✓ user.email: $e" || echo "✗ user.email sin configurar"
echo "— acceso al repo central —"
REPO=$(grep -E "^ENGINECX_PRD_REPO=" "$ROOT/.env" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^[[:space:]]*//; s/[[:space:]]*$//')
if [ -z "$REPO" ]; then echo "✗ falta ENGINECX_PRD_REPO en .env";
elif GIT_TERMINAL_PROMPT=0 git ls-remote "$REPO" -h >/dev/null 2>&1; then echo "✓ acceso OK a $REPO";
else echo "✗ sin acceso a $REPO con las credenciales actuales del equipo"; fi
```

Interpreta el resultado y **actúa según lo que falte** (ofrece ayuda desde la terminal en lo que
puedas; lo que sea de GitHub, guía al desarrollador a hacerlo por fuera):

- **`git` no instalado** → indícale instalarlo (p. ej. `git-scm.com` o el gestor de su SO).
- **`user.name`/`user.email` sin configurar** → ofrécete a configurarlos tú:
  `git config --global user.name "Su Nombre"` y `git config --global user.email "su-correo"`.
  Estos son la **autoría** de sus commits al repo central; que sean sus datos reales.
- **Sin cuenta de GitHub** → guíalo a crearla en `github.com`.
- **Sin credenciales / token** → guíalo a autenticarse con **`gh auth login`** (recomendado) o a
  crear un **PAT** y guardarlo en el credential helper del SO. No pongas el token en el `.env`.
- **Sin acceso al repo `enginecx_prd`** → dile que solicite acceso al owner del repo; no puede
  publicar PRDs hasta tenerlo.

Cuando algo falte, **no avances**: usa un **selector** de dos opciones — **«Listo, ya lo
resolví»** / **«Necesito ayuda»** — y **re-corre el preflight** hasta que los tres chequeos
(identidad + acceso) salgan ✓. Si todo salió ✓ a la primera, continúa al Paso 3.

## Paso 3 — Compilar los paquetes y verificar la conexión

1. **Compila** en la raíz del plugin (requiere `Node ≥22` y `pnpm ≥11`; el `preinstall` fuerza
   pnpm). Reporta el resultado:
   ```bash
   ROOT="${CLAUDE_PLUGIN_ROOT}"
   (cd "$ROOT" && pnpm install && pnpm build)
   ```
2. Confirma que quedaron los bins compilados:
   ```bash
   for f in packages/mcp/dist/index.js packages/prd-sync/dist/cli.js \
            packages/indexer/dist/index.js packages/core/dist/index.js; do
     [ -f "${CLAUDE_PLUGIN_ROOT}/$f" ] && echo "✓ $f" || echo "✗ $f (falta build)"
   done
   ```
3. **Smoke-test de la base de datos / MCP.** Verifica que el servidor MCP arranca y conecta a
   Supabase invocando la tool **`mcp__pm-ai__pm_proyectos`** (lista proyectos; con la DB vacía
   devuelve una lista vacía, lo cual **también** cuenta como éxito: lo que importa es que
   responda sin error de conexión).
   - Si la tool **no está disponible** o falla porque el MCP no tomó el `.env` recién colocado
     (gotcha conocido en dev): pídele al desarrollador **recargar el plugin/sesión de Claude
     Code** y volver a correr esta verificación. No des la infra por buena hasta que
     `pm_proyectos` responda.

## Paso 4 — Cierre

Resume el resultado de la instalación:
- `.env` colocado y completo (4 claves ✓: Supabase URL/key, embeddings key, `ENGINECX_PRD_REPO`).
- git del equipo verificado: identidad (`user.name`/`user.email`) y acceso a `enginecx_prd` ✓
  (sin credenciales de GitHub en el `.env`).
- `pnpm build` OK y bins presentes.
- Conexión MCP/Supabase verificada (`pm_proyectos` respondió).

Indícale que ya puede trabajar: **el flujo diario arranca con `/pm-prd`** (que crea la estructura
`manager/` por su cuenta la primera vez). Este comando `/instalar` no hace falta volver a correrlo
salvo que cambie el `.env` o se reinstale el plugin.
