<!-- ============================================================================
     PLANTILLA — PRD (Product Requirements Document) — Engine
     ============================================================================
     FUENTE DE VERDAD: esta plantilla y el prompt entrevistador
     `plantillas/prompt-asistente-prd.md` definen TODA la función de PRD de PM·AI.
     El comando /pm-prd se limita a orquestar (modo, tipo de proyecto, carpetas) y
     delega la entrevista y la redacción a estos dos documentos.

     El PRD define QUÉ se construye y POR QUÉ (output funcional, no la solución
     técnica). El CÓMO/cronograma vive en el Gantt (`/pm-gantt`).

     Convenciones:
       • El PRD vive en `manager/PRD.md` (UN solo PRD por proyecto).
       • 14 secciones + tabla de encabezado. Las secciones marcadas
         **(condicional)** solo se incluyen si aplican al tipo de proyecto; si no
         aplican, ELIMINA la sección completa (no la dejes vacía ni como "N/A").
       • Sin filas vacías ni placeholders `[ ]`. Lo que falte por definir va en la
         sección 14 (Preguntas abiertas), no se inventa.
       • Este plugin TRABAJA CON FECHAS: el encabezado lleva Fecha y se permiten
         fechas donde aporten (fases, hitos). El cronograma detallado vive en el Gantt.
     ============================================================================ -->

# PRD - [Nombre del proyecto]

| **Campo** | **Detalle** |
| --- | --- |
| **Proyecto** | |
| **Área / empresa** | (GarantiPlus México/Chile/Colombia, GPLUS Seguros, Invarat, Engine, Go Virtual) |
| **Versión** | v0.1 |
| **Fecha** | |
| **Autores** | |
| **Revisión / liderazgo** | |
| **Tipo de proyecto** | (Agente conversacional / Feature web o API / Integración / Migración / Automatización) |

## 1. Resumen ejecutivo

Resumen de 3-5 párrafos que cubra:
- Qué es el proyecto y para quién (usuarios/área beneficiada).
- Cuál es el problema u oportunidad actual (1-2 párrafos de contexto resumido).
- Qué cubrirá el MVP en una frase y qué quedará para fases posteriores (si aplica).
- Resultado esperado / impacto (operativo, de negocio, técnico).

Cierra con un diagrama de flujo resumido en una línea, por ejemplo:

**[paso 1]** → **[paso 2]** → **[paso 3]** → **[paso 4]**

## 2. Contexto y problema

- ¿Cómo funciona el proceso/sistema actual hoy? (flujo actual, herramientas usadas, % de canales si aplica)
- ¿Cuál es el dolor concreto? (pérdida de trazabilidad, dependencia de herramientas externas, fricción operativa, riesgo, costo, etc.)
- ¿Por qué resolverlo ahora? (driver de negocio, riesgo, deadline contractual, etc.)
- Si aplica: separación de conceptos clave del dominio (p. ej. "incidencia" vs. "avería formal" en el ejemplo) — definir cualquier distinción crítica que el equipo dev deba entender desde el inicio.

## 3. Objetivo del producto

Objetivo general en 1-2 párrafos: qué debe lograr el producto, para quién, con qué canal/tecnología principal, y qué mejora medible se espera.

### 3.1 Estrategia de implementación por fases **(condicional)**

Solo si el proyecto se planea por fases (MVP + evolución futura).

| **Fase** | **Nombre** | **Descripción** |
| --- | --- | --- |
| Fase 1 | | |
| Fase 2 | | |
| Fase 3 | | |

Indicar explícitamente cuál fase corresponde al MVP de este PRD.

## 4. Usuarios y actores

Tabla de todos los roles que interactúan con el sistema (directos e indirectos: usuarios finales, operación, BI, TI, equipos internos).

| **Usuario / Actor** | **Rol en el proceso** |
| --- | --- |
| | |

## 5. Alcance MVP y funcionalidades

Lista de funcionalidades que SÍ entran en el MVP, con descripción suficiente para que dev entienda el comportamiento esperado (no solo el nombre de la feature).

| **Funcionalidad** | **Descripción** |
| --- | --- |
| | |

Cerrar con un párrafo que indique el principio rector del MVP (qué prioriza y qué decisiones críticas NO toma todavía, si aplica).

## 6. Fuera de alcance

Lista explícita de lo que el MVP **no** hará, aunque parezca relacionado o "fácil de agregar". Cada punto debe tener una justificación breve (por qué se excluye, qué condición habilitaría incluirlo después).

- [Elemento fuera de alcance]: [justificación].

## 7. Flujos principales **(condicional — recomendado si hay lógica de proceso, conversación o decisión)**

Uno o más diagramas (preferentemente `mermaid` tipo `flowchart TD`) que muestren:
- Punto de entrada (canal, trigger, usuario).
- Decisiones clave (condicionales `{}`).
- Puntos de integración con sistemas (SIGA, AWS, APIs externas, etc.).
- Eventos de salida (BI, notificaciones, escalamiento).

Cada diagrama debe ir acompañado de 1-2 párrafos explicando el "por qué" del flujo, no solo repetir el diagrama en texto.

Para proyectos con escalamiento humano o manejo de excepciones, incluir un flujo transversal de "reglas de escalamiento" aplicable a todos los demás flujos.

## 8. Requerimientos funcionales

Tabla con IDs consecutivos (RF-01, RF-02, ...). Cada requerimiento debe ser una capacidad verificable por el equipo de dev/QA, no una aspiración vaga.

| **ID** | **Requerimiento** | **Descripción** |
| --- | --- | --- |
| RF-01 | | |

## 9. Requerimientos no funcionales

Tabla con IDs consecutivos (RNF-01, RNF-02, ...). Cubrir como mínimo (cuando aplique al proyecto):

- Disponibilidad / tiempos de respuesta
- Seguridad de datos y control de permisos (IAM, API keys, accesos)
- Trazabilidad / auditabilidad
- Manejo de errores
- Experiencia de usuario
- Escalabilidad / mantenibilidad
- Privacidad
- Consistencia de datos (tiempo real vs. cortes programados)
- Observabilidad (logs, métricas técnicas)
- Compatibilidad por canal/región (si hay multi-región o multi-canal)

| **ID** | **Requerimiento** | **Descripción** |
| --- | --- | --- |
| RNF-01 | | |

## 10. Integraciones y datos

Tabla de sistemas/servicios con los que se integra y qué se espera de cada integración (consulta, escritura, autenticación, eventos).

| **Integración / Fuente** | **Uso esperado** |
| --- | --- |
| | |

Lista de datos mínimos requeridos para operar el MVP (campos, entidades, identificadores).

Párrafo sobre esquema de permisos: qué puede leer, qué puede escribir/crear, qué queda bloqueado sin validación humana o de TI.

## 11. Eventos para BI **(condicional — incluir si el proyecto genera interacciones, transacciones o decisiones medibles)**

Lista de eventos con `nombre_evento` (snake_case) y descripción de cuándo se dispara. Agrupar por categoría si hay muchos (p. ej. eventos generales, eventos de [entidad principal], eventos de seguimiento).

- `evento_ejemplo`: se registra cuando [condición].

Indicar qué campos mínimos debe incluir cada evento (fecha/hora, usuario, identificadores de negocio, resultado, motivo si aplica).

## 12. Métricas de éxito

Métricas que permitirán evaluar si el MVP cumple su objetivo. Indicar cuáles dependen de validación con BI/operación para definir línea base y meta numérica.

| **Métrica** | **Descripción** |
| --- | --- |
| | |

## 13. Riesgos y supuestos

### Riesgos

| **Riesgo** | **Impacto potencial** |
| --- | --- |
| | |

### Supuestos

| **Supuesto** | **Descripción** |
| --- | --- |
| | |

## 14. Preguntas abiertas

Temas que deben resolverse antes de cerrar diseño técnico, estimar tiempos y definir el alcance final. Agrupar por tema para facilitar revisión con stakeholders.

| **Tema** | **Pregunta abierta** |
| --- | --- |
| | |
