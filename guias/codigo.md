# Estándares de código

## Estandarización ("no satélites")
**Regla:** cuando un proyecto adopte un lenguaje/framework del stack, lo usa **de la manera
acordada**, no de una forma distinta en cada proyecto.
**Razón:** evitar que cada desarrollo sea un "satélite" que solo su autor entiende; el
equipo debe poder tomar cualquier proyecto.

## Testing
**Regla:** cada etapa de desarrollo entrega sus **unit tests** y no se da por exitosa hasta
que pasan en verde. La lógica pura se separa de la I/O para poder testearla sin servicios.
**Razón:** verificación objetiva del avance (prompt.md §11–§12).

## Seguridad de dependencias
**Regla:** dependencias nuevas se justifican; los build scripts se aprueban explícitamente
(ver [gestion-paquetes.md](gestion-paquetes.md)).

## Comentarios y nombres
**Regla:** el código nuevo imita el estilo del código que lo rodea (densidad de comentarios,
nombres, idioma). Comentar el *por qué*, no el *qué*.

## Ejemplos
- ✅ Función pura `reconcileFile()` testeada sin DB; orquestación I/O aparte.
- ❌ Lógica de negocio entrelazada con llamadas a la DB, imposible de testear en aislamiento.
