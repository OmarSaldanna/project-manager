# PM·AI — Project Manager con IA (Engine CX)

Plugin de **Claude Code** que actúa como **Project Manager con IA**: acompaña proyectos de
software de principio a fin con un **índice simbólico del código + RAG**, de modo que el
agente navega y mantiene el proyecto **sin leer repositorios completos**.

## Qué hace

- **Índice navegable** del código y la documentación (símbolos, chunks de markdown, etc.) en
  una base de datos externa, con **versionado por entidad** (changelog y diffs).
- **PRD** del proyecto (`manager/PRD.md`) construido siguiendo la entrevista estándar de Engine.
- **Planeación con fechas** (diagrama de Gantt) derivada del PRD con apoyo de *superpowers*.
- **Commits consistentes**: git + índice siempre sincronizados.
- **Bitácoras de trazabilidad** en HTML.

## Comandos

| Comando | Para qué |
|---|---|
| `/pm-init` | Inicializa PM·AI en un repo e indexa el baseline. |
| `/pm-prd` | Construye/mantiene el PRD (`manager/PRD.md`). |
| `/pm-gantt` | Planeación con fechas (Gantt, sprints, objetivos). |
| `/pm-commit` | Cierra un avance: commit en git + indexado del cambio. |
| `/pm-trace` | Reporte HTML de la traza de cambios de una entidad/archivo/commit. |

## Arquitectura

Monorepo `pnpm` con los paquetes en `packages/` (core, indexer, mcp). La arquitectura
completa y las decisiones de diseño viven en [`prompt.md`](prompt.md); las instrucciones del
agente, en [`CLAUDE.md`](CLAUDE.md).

## Configuración

El servidor MCP necesita credenciales (Supabase + proveedor de embeddings/LLM). Copia
`.env.example` a `.env` y complétalo; en Claude Code, los secretos se inyectan vía
`userConfig` (ver `.mcp.json`). **Nunca** subas tu `.env`.
