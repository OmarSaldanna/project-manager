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

> **Por qué existe este comando.** El `.env` del plugin lleva la identidad git que usa
> `prd-sync` para publicar al repo central. Si un desarrollador con cuenta de GitHub propia usa
> el `.env` de otra persona tal cual, sus credenciales pueden quedar suplantadas/cacheadas por el
> gestor de credenciales de git de su sistema. Por eso el Paso 2 le ofrece poner **sus** datos.

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
   for k in SUPABASE_URL SUPABASE_SERVICE_KEY PM_EMBEDDINGS_KEY \
            ENGINECX_PRD_REPO ENGINECX_PRD_GIT_USER ENGINECX_PRD_GIT_EMAIL ENGINECX_PRD_GIT_TOKEN; do
     v=$(grep -E "^${k}=" "$ENV" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^[[:space:]]*//; s/[[:space:]]*$//')
     case "$v" in
       ""|*...|"https://TU-PROYECTO.supabase.co"|"tu-usuario"|"tu-correo@enginecx.com"|*"/ORG/"*)
         echo "✗ $k — falta o sigue con valor de ejemplo"; miss=1 ;;
       *) echo "✓ $k" ;;
     esac
   done
   [ "$miss" -eq 0 ] && echo "OK: .env completo" || { echo "INCOMPLETO — completa las claves ✗ antes de seguir"; exit 1; }
   ```

   Claves requeridas: **Índice/MCP** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `PM_EMBEDDINGS_KEY`. **Repo central** — `ENGINECX_PRD_REPO`, `ENGINECX_PRD_GIT_USER`,
   `ENGINECX_PRD_GIT_EMAIL`, `ENGINECX_PRD_GIT_TOKEN`. Si el chequeo falla, dile **qué claves**
   faltan (por nombre) y **no avances** hasta que pase.

## Paso 2 — Credenciales de GitHub del desarrollador

El `.env` trae una identidad git (`ENGINECX_PRD_GIT_USER`, `ENGINECX_PRD_GIT_EMAIL`,
`ENGINECX_PRD_GIT_TOKEN`) que `prd-sync` usa para publicar al repo central `enginecx_prd`.

Pregunta con un **selector** (AskUserQuestion), pregunta **corta** («¿Tienes cuenta de GitHub
propia?») y EXACTAMENTE estas dos opciones:

- **A — No tengo cuenta de GitHub, usa la del `.env`.** → No cambies nada; continúa al Paso 3.
- **B — Sí tengo cuenta de GitHub.** → En un mensaje normal, muéstrale la **ruta exacta**
  `${CLAUDE_PLUGIN_ROOT}/.env` e indícale reemplazar **sus** valores en estas tres claves:
  - `ENGINECX_PRD_GIT_USER` — tu usuario de GitHub.
  - `ENGINECX_PRD_GIT_EMAIL` — tu correo de GitHub.
  - `ENGINECX_PRD_GIT_TOKEN` — un **token propio** con acceso al repo `enginecx_prd`.

  Recuérdale que así los commits al repo central quedan a **su** nombre y no se suplanta ninguna
  cuenta. Luego, con **otro selector** de dos opciones, **espera su confirmación** antes de
  seguir: **«Listo, ya edité el `.env`»** / **«Necesito ayuda»**. No avances hasta el «Listo»
  (con «Necesito ayuda», abre conversación para apoyarlo y vuelve a este selector).

Tras confirmar, re-corre el chequeo del Paso 1.3 para asegurar que las tres claves siguen
completas (no quedaron con el valor de ejemplo).

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
- `.env` colocado y completo (7 claves ✓).
- Credenciales de GitHub: opción **A** (compartidas del `.env`) u opción **B** (propias del
  desarrollador).
- `pnpm build` OK y bins presentes.
- Conexión MCP/Supabase verificada (`pm_proyectos` respondió).

Indícale que ya puede trabajar: **el flujo diario arranca con `/pm-prd`** (que crea la estructura
`manager/` por su cuenta la primera vez). Este comando `/instalar` no hace falta volver a correrlo
salvo que cambie el `.env` o se reinstale el plugin.
