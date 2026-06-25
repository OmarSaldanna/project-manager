# Reporte técnico — Implementación de PM·AI como plugin de Claude Code

**Fecha:** 2026-06-22
**Autor:** Omar Lara (Engine CX) + asistencia del agente
**Alcance:** Puesta en marcha del plugin **PM·AI** dentro de Claude Code: registro
persistente, servidor MCP, comandos `/pm-*` y manejo de secretos. Documenta el camino
real (problemas → causa → solución), no solo el resultado.

---

## 1. Objetivo

Dejar el plugin **dado de alta de forma persistente** en Claude Code, de modo que en
cualquier sesión (en cualquier proyecto) estén disponibles:

- Los 4 comandos slash: `/pm-init`, `/pm-prd`, `/pm-gantt`, `/pm-commit`.
- El servidor **MCP `pm-ai`** con sus tools (`pm_proyectos`, `pm_navegar`, `pm_buscar`,
  `pm_recuperar`, `pm_traza`, `pm_indexar`).

Sin tener que lanzar Claude con `--plugin-dir` cada vez ni exportar variables de entorno
manualmente en cada shell.

## 2. Punto de partida

- Monorepo pnpm con 3 paquetes (`@pm-ai/core`, `@pm-ai/indexer`, `@pm-ai/mcp`) ya
  compilados (`dist/` presente) y MCP que arrancaba con `node --env-file=.env`.
- `.claude-plugin/plugin.json` con el bloque `mcpServers` **embebido** y variables en
  forma `${SUPABASE_URL}`, etc.
- `commands/*.md` con frontmatter (`description`, `argument-hint`, `allowed-tools`).
- Secretos reales en `.env` (gitignored).

---

## 3. Cronología de problemas y soluciones

### 3.1 Bloqueo de permisos de macOS (TCC)

- **Síntoma:** todo acceso a `~/Downloads` (incluida la carpeta del propio plugin) devolvía
  `Operation not permitted`, incluso con el sandbox desactivado. `git rev-parse` fallaba con
  `Unable to read current working directory`.
- **Causa:** **TCC** (Transparency, Consent & Control) de macOS protege `Downloads`,
  `Desktop` y `Documents`. La app que hospeda Claude Code no tenía permiso de acceso.
- **Solución:** **Ajustes del Sistema → Privacidad y Seguridad → Acceso total al disco**,
  habilitar la terminal/app y reiniciarla. (Alternativa más robusta a futuro: mover los
  proyectos fuera de `Downloads`, p. ej. a `~/dev`).

### 3.2 Mecanismo de registro persistente

- **Decisión:** registrar un **marketplace local** que apunta al directorio del plugin y
  luego instalar desde él, a scope **user** (disponible en todos los proyectos).
- **Acciones:**
  - Se creó `.claude-plugin/marketplace.json` (manifiesto del marketplace, con `name`,
    `description`, `owner` y un `plugins[]` cuyo `source` es `"."`).
  - `claude plugin marketplace add <ruta-absoluta>` — **ojo:** `add .` falla
    (`Invalid marketplace source format`); requiere ruta absoluta o `./ruta`.
  - `claude plugin install pm-ai@engine-cx-local`.

### 3.3 Manejo de secretos del MCP (el punto crítico)

- **Síntoma/Riesgo:** en `plugin.json` las variables `${SUPABASE_URL}`, `${SUPABASE_SERVICE_KEY}`,
  etc. se resuelven desde el **entorno del shell** que lanzó `claude`, **no** desde el `.env`
  del proyecto (Claude Code no carga `.env` automáticamente). Si faltan → cadena vacía →
  el MCP arranca con credenciales vacías y falla.
- **Solución elegida:** **`userConfig`** en `plugin.json`. Cada secreto se declara con
  `"sensitive": true` (se guarda en el **llavero del sistema**, nunca en git ni en
  `settings.json`) y se interpola en el `env` del MCP como **`${user_config.<clave>}`**.
  Se resuelve **antes** de arrancar el subproceso del MCP.
- **Clasificación de variables** (tras leer `packages/core/src/env.ts` y `packages/mcp/src/index.ts`):

  | Variable | Tipo | Trato |
  |---|---|---|
  | `SUPABASE_URL` | endpoint | fija en `.mcp.json` |
  | `SUPABASE_SERVICE_KEY` | **secreto** | `userConfig` (llavero) |
  | `PM_EMBEDDINGS_URL` / `_MODEL` / `_DIM` | config | fijas en `.mcp.json` |
  | `PM_EMBEDDINGS_KEY` | **secreto** | `userConfig` (llavero) |
  | `PM_LLM_URL` / `_MODEL` | config | fijas en `.mcp.json` |
  | `PM_LLM_KEY` | **secreto opcional** | `userConfig` (llavero) |

- **Carga de secretos sin teclearlos en claro:** `claude plugin install --config key=value`
  (repetible) leyendo los valores desde el `.env` vía variables de shell:
  ```bash
  set -a; . ./.env; set +a
  claude plugin install pm-ai@engine-cx-local \
    --config supabase_service_key="$SUPABASE_SERVICE_KEY" \
    --config embeddings_key="$PM_EMBEDDINGS_KEY" \
    --config llm_key="$PM_LLM_KEY"
  ```

### 3.4 LLM opcional (robustez del indexado)

- **Problema:** el describer activaba `LlmDescriber` con solo tener `PM_LLM_URL`. Si la URL
  quedaba fija pero faltaba la clave, el indexado de código tronaría (401).
- **Solución:** se condicionó a **URL *y* KEY**; si falta cualquiera, cae a
  `SignatureDescriber` (usa la firma de la función como descripción). Cambio en
  `packages/mcp/src/index.ts` + rebuild del paquete.
  ```ts
  const describer: Describer =
    process.env.PM_LLM_URL && process.env.PM_LLM_KEY
      ? new LlmDescriber({ url: process.env.PM_LLM_URL, apiKey: process.env.PM_LLM_KEY,
                           model: process.env.PM_LLM_MODEL ?? "gpt-4o-mini" })
      : new SignatureDescriber();
  ```

### 3.5 `author` debía ser objeto

- **Síntoma:** `install` fallaba con
  `author: Invalid input: expected object, received string`.
- **Causa:** `plugin.json` tenía `"author": "Engine CX"`.
- **Solución:** `"author": { "name": "Engine CX" }`.

### 3.6 Frontmatter YAML inválido en dos comandos

- **Síntoma:** `claude plugin validate` reportó en `pm-init.md` y `pm-prd.md`:
  `YAML frontmatter failed to parse … At runtime this command loads with empty metadata`.
- **Causa:** la `description` contenía `: ` (dos puntos + espacio) **sin comillas**
  (`…construido): copia…`, `…entrevistador: recolecta…`); YAML lo interpretaba como un mapa
  anidado. Efecto: se perdían `description`, `argument-hint` y **`allowed-tools`**.
- **Solución:** entrecomillar el valor de `description` en ambos comandos.

### 3.7 El servidor MCP no era reconocido

- **Síntoma:** `claude plugin details` mostraba **`MCP servers (0)`** pese a tener el bloque
  `mcpServers` en `plugin.json`.
- **Causa:** Claude Code **no carga** el `mcpServers` embebido en `plugin.json`. El patrón
  soportado (confirmado contra el plugin oficial de Vercel) es un archivo **`.mcp.json`** en
  la raíz del plugin.
- **Solución:** se movió el bloque a **`.mcp.json`** (con `${CLAUDE_PLUGIN_ROOT}` y
  `${user_config.*}`) y se eliminó `mcpServers` de `plugin.json` (el `userConfig` se quedó
  ahí). Tras reinstalar: **`MCP servers (1) pm-ai`**.

### 3.8 Recarga de cambios en desarrollo

- **Síntoma:** `claude plugin update` decía *"already at the latest version (0.1.0)"* y no
  tomaba los archivos corregidos.
- **Causa:** `update` compara **versión**, no contenido. La instalación **copia** el
  directorio a `~/.claude/plugins/cache/engine-cx-local/pm-ai/<ver>/`.
- **Solución (ciclo de dev):**
  ```bash
  claude plugin marketplace update engine-cx-local && \
  claude plugin uninstall pm-ai@engine-cx-local && \
  claude plugin install pm-ai@engine-cx-local
  ```

---

## 4. Verificaciones realizadas

- **Arranque del MCP desde la copia cacheada** (no solo desde el código fuente):
  `[pm-ai] MCP server listo (stdio).` — resuelve dependencias del workspace (`@pm-ai/core`,
  `@pm-ai/indexer`) y SDKs (`@supabase`, `@modelcontextprotocol`).
- **`claude plugin validate .`** → *Validation passed* (sin errores).
- **`claude plugin details pm-ai@engine-cx-local`** → `Skills (4)` + `MCP servers (1) pm-ai`.
- **`claude plugin list`** → `pm-ai@engine-cx-local … Status: ✔ enabled` (scope user).
- **`~/.claude/settings.json`** → `enabledPlugins["pm-ai@engine-cx-local"] = true`.

---

## 5. Configuración resultante

**`.claude-plugin/plugin.json`** (sin `mcpServers`; con `userConfig`):
```jsonc
{
  "name": "pm-ai",
  "version": "0.1.0",
  "author": { "name": "Engine CX" },
  "userConfig": {
    "supabase_service_key": { "type": "string", "sensitive": true, "required": true,  "title": "Supabase Service Key", "description": "…" },
    "embeddings_key":       { "type": "string", "sensitive": true, "required": true,  "title": "Embeddings API Key",   "description": "…" },
    "llm_key":              { "type": "string", "sensitive": true, "required": false, "title": "LLM API Key (opcional)","description": "…" }
  }
}
```

**`.mcp.json`** (raíz del plugin):
```jsonc
{
  "mcpServers": {
    "pm-ai": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/packages/mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://<proyecto>.supabase.co",
        "SUPABASE_SERVICE_KEY": "${user_config.supabase_service_key}",
        "PM_EMBEDDINGS_URL": "https://api.openai.com/v1/embeddings",
        "PM_EMBEDDINGS_KEY": "${user_config.embeddings_key}",
        "PM_EMBEDDINGS_MODEL": "text-embedding-3-small",
        "PM_EMBEDDINGS_DIM": "1536",
        "PM_LLM_URL": "https://api.openai.com/v1/chat/completions",
        "PM_LLM_KEY": "${user_config.llm_key}",
        "PM_LLM_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

**`.claude-plugin/marketplace.json`** — marketplace local `engine-cx-local`, con
`plugins[0].source = "."`.

---

## 6. Procedimiento de instalación reproducible

```bash
# (0) macOS: dar Acceso total al disco a la terminal y reiniciarla.

# (1) Build de los paquetes (incluye el MCP)
cd <repo-del-plugin>
pnpm install && pnpm -r build

# (2) Registrar marketplace local (RUTA ABSOLUTA)
claude plugin marketplace add <ruta-absoluta-del-repo>

# (3) Instalar con secretos desde .env (sin teclearlos en claro)
set -a; . ./.env; set +a
claude plugin install pm-ai@engine-cx-local \
  --config supabase_service_key="$SUPABASE_SERVICE_KEY" \
  --config embeddings_key="$PM_EMBEDDINGS_KEY" \
  --config llm_key="$PM_LLM_KEY"

# (4) Verificar
claude plugin details pm-ai@engine-cx-local   # Skills (4) + MCP servers (1)
# En una sesión NUEVA:  /help  y  /mcp
```

> Alternativa interactiva a (3): instalar sin `--config` y luego ejecutar
> `/plugin configure pm-ai@engine-cx-local` dentro de Claude Code (captura enmascarada).

---

## 7. Pendientes / notas de seguridad

- **Higiene de secretos:** la instalación copió el `.env` (con claves) a la caché del
  plugin (`~/.claude/plugins/cache/...`). No afecta el funcionamiento (el MCP recibe las
  claves vía `userConfig`/llavero), pero conviene evitar que se copie en futuras versiones.
- **Rotar** la `SUPABASE_SERVICE_KEY` al cerrar desarrollo (se compartió en claro durante el
  proceso).
- **Namespacing de comandos:** según colisiones, los comandos pueden aparecer como
  `/pm-init` o `pm-ai:pm-init`; verificar con `/help`.
- **Pruebas funcionales end-to-end** de los 4 comandos sobre un proyecto real (en curso).
