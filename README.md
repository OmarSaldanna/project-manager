# PM·AI — Project Manager con IA (Engine CX)

Plugin de **Claude Code** que actúa como **Project Manager con IA**: acompaña proyectos de
software de principio a fin con un **índice simbólico del código + RAG**, de modo que el
agente navega y mantiene el proyecto **sin leer repositorios completos**.

## Qué hace

- **Índice navegable** del código y la documentación (símbolos, chunks de markdown, etc.) en
  una base de datos externa, con **versionado por entidad** (changelog y diffs).
- **PRD** del proyecto (`manager/PRD.md`) construido siguiendo la entrevista estándar de Engine.
- **Gantt general** de planes de desarrollo (`pm_plan_desarrollo`, cross-proyecto y por
  responsable): consulta estados y programa fechas por PRD. El gantt particular por proyecto
  queda para una fase posterior.
- **Commits consistentes**: git + índice siempre sincronizados.
- **Bitácoras de trazabilidad** en HTML.

## Comandos

| Comando | Para qué |
|---|---|
| `/instalar` | Instalación de una sola vez tras añadir el plugin: coloca el `.env`, resuelve credenciales de GitHub propias, compila los paquetes y verifica la conexión. |
| `/pm-prd` | **Punto de entrada del día a día.** Construye/mantiene el PRD (`manager/PRD.md`); si el proyecto aún no tiene `manager/`, la levanta por su cuenta. |
| `/pm-init` | Arma la estructura `manager/` del proyecto (lo invoca `/pm-prd` la primera vez; también puede correrse directo). |
| `/pm-gantt` | Gantt general de planes de desarrollo (consulta estados; programa fechas). |
| `/guardar-cambios` | Guarda tu avance: registro en el historial (git) + actualización de la memoria del proyecto (índice). |
| `/reporte-cambios` | Reporte HTML del histórico de cambios (por defecto `manager/PRD.md`; también entidad/archivo/commit). |

## Primeros pasos (flujo)

1. **Una sola vez, al añadir el plugin:** corre **`/instalar`**. Coloca el `.env` en la raíz del
   plugin, te ofrece poner **tus propias credenciales de GitHub** (para no suplantar tu cuenta al
   publicar al repo central), compila los paquetes y verifica la conexión al índice.
2. **El día a día arranca en `/pm-prd`.** No necesitas correr `/pm-init` a mano: si el proyecto
   aún no tiene la estructura `manager/`, `/pm-prd` la levanta por su cuenta antes de trabajar el
   PRD.

## Arquitectura

Monorepo `pnpm` con los paquetes en `packages/` (core, indexer, mcp). La arquitectura
completa y las decisiones de diseño viven en [`prompt.md`](prompt.md); las instrucciones del
agente, en [`CLAUDE.md`](CLAUDE.md).

## Configuración

Instalar el plugin **no pide credenciales**. El servidor MCP necesita credenciales (Supabase +
proveedor de embeddings/LLM) que lee de un `.env` en la **raíz del plugin**: lo carga el propio
proceso Node del MCP (`process.loadEnvFile`), no Claude Code. **El comando `/instalar` coloca ese
`.env`** (a partir de `.env.example`) y te guía para completarlo. Para el repo central de PRDs, el
`.env` solo lleva `ENGINECX_PRD_REPO` (la ubicación del repo) — **no** guarda credenciales de
GitHub: `prd-sync` publica con la **identidad y credenciales de git ya configuradas en tu equipo**
(`user.name`/`user.email` + credential helper / `gh` / SSH), así los commits quedan a tu nombre y
nunca se distribuye ni se suplanta el token de otra persona. `/instalar` verifica que tengas
identidad git y acceso al repo. **Nunca** subas tu `.env`.
