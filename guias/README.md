# Guías de la organización — Engine CX

Criterios de desarrollo de la organización, **versionados en GitHub** y de **lectura
obligatoria** para el agente PM antes de generar o modificar código (prompt.md §9, D7).
Existen para evitar "satélites": que cada proyecto haga lo suyo con un stack distinto.

## Precedencia (de mayor a menor)
1. Instrucción explícita del usuario en la sesión actual.
2. Estas guías (`guias/`).
3. Los defaults del modelo.

> Si una instrucción del usuario **contradice** una guía, el agente DEBE detenerse y
> señalarlo antes de continuar. No se resuelve el conflicto en silencio.

## Cómo se aplican
- El `CLAUDE.md` raíz inyecta el bloque imperativo de lectura obligatoria.
- Antes de proponer un cambio de código, el agente verifica contra la guía relevante y
  reporta explícitamente qué guías cumple.

## Índice
| Guía | Tema |
|---|---|
| [stack.md](stack.md) | Lenguajes y frameworks obligatorios |
| [gestion-paquetes.md](gestion-paquetes.md) | pnpm (nunca npm/yarn) |
| [backend.md](backend.md) | .NET Core 8 + C#, capa proxy de LLM |
| [frontend.md](frontend.md) | React/Vue; prohibido Laravel y HTML puro |
| [documentacion.md](documentacion.md) | Documentación de avances y PRDs |
| [codigo.md](codigo.md) | Estándares de código |

## Formato de cada guía
Cada regla lleva: **Regla** (imperativa), **Razón** (por qué) y **Ejemplos** (✅/❌).
La razón importa: permite al agente decidir bien en casos no contemplados.
