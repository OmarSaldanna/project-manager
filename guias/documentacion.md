# Documentación

## PRD y Plan de desarrollo son documentos DISTINTOS
**Regla:** el **PRD** define *qué* se construye y *por qué* (objetivo, criterios de
aceptación, features, cuándo se da por terminado). Vive en `manager/PRD.md` (**uno solo** por
proyecto) y sigue la estructura de Engine (`/pm-prd`, basado en los prompts de Dani).
El **Plan de desarrollo** define *cómo* se descompone y se ejecuta **con fechas**: vive en el
Gantt (`/pm-gantt`, `manager/gantt/`), que se deriva del PRD con la skill de planeación de
superpowers. No los fusiones.
**Razón:** mezclarlos hace al PRD inestable y difícil de versionar.

## Formato
**Regla:** todo se escribe en **Markdown**. La salida a PDF/Word/HTML se genera bajo demanda.
**Razón:** el markdown se parte limpio por secciones (chunking del RAG) y versiona bien en Git.

## Avances
**Regla:** los avances no se redactan a mano costosamente: salen de transcripts/updates que
el PM procesa hacia el `ESTADO.md`, bajo el flujo **propuesta → revisión → confirmación**.
El humano siempre confirma antes de fijar fechas, entregables o responsables.

## Criterios
**Regla:** los archivos markdown necesitamos que sigan una estructura de títulos definida: usando # para el título principal, ## para cada capítulo y ### para cada apartado de cada capítulo.
**Razón:** se extraerán chunks por cada **capítulo** ## para crearles embeddings en un sistema RAG, por eso necesotamos capitulos bien definidos.

## Ejemplos
- ✅ `manager/PRD.md` (qué/por qué) + Gantt con fechas (`manager/gantt/`, el cómo) + `ESTADO.md` (estado vivo).
- ❌ Un solo documento que es PRD y plan a la vez.
