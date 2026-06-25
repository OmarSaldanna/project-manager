/* ============================================================================
   PLANTILLA DE CONTENIDO — gantt.js
   ============================================================================
   Este archivo define TODO el contenido que muestra la plantilla de reporte
   (index.html): el tablero de tareas (línea de tiempo + avance) y la bitácora
   de sprints. El diseño, los estilos y la lógica viven en index.html; aquí solo
   van los DATOS.

   CÓMO SE USA
   -----------
   index.html carga el contenido desde la variable global `window.PROJECT_DATA`.
   Al abrirse con doble clic (sin servidor) el navegador lee este .js como un
   <script>, por eso el contenido se asigna a una variable y NO se usa fetch.

   FORMATO
   -------
   Es un objeto JavaScript (no JSON estricto): se permiten comentarios //, pero
   conviene mantener comillas en las claves y comas entre elementos.

   CON FECHAS (decisión de diseño)
   -------------------------------
   La planeación SE BASA EN FECHAS reales. Cada tarea trae `start` y `end` en
   formato ISO "YYYY-MM-DD"; el tablero se dibuja como una línea de tiempo sobre
   un eje de meses, con una marca del día de hoy. El avance se expresa con
   `progress` (0–100) y `finished`; los sprints son una agrupación SECUNDARIA
   (etiqueta + bitácora de objetivos), no posicionan las barras.
   ============================================================================ */

window.PROJECT_DATA = {

  /* --------------------------------------------------------------------------
     project — Cabecera del reporte (la primera pantalla, antes del tablero).
     Dónde aparece cada campo:
       name        -> Título grande del proyecto (<h1>) Y título de la pestaña
                      del navegador.
       code        -> Texto pequeño tipo "etiqueta" arriba del título y también
                      en el pie de página. (Aquí va la marca/firma del reporte.)
       description -> Párrafo bajo el título.
       manager     -> Celda "Responsable" del recuadro de metadatos.
       team        -> Celda "Equipo" del recuadro de metadatos.
       status      -> Etiquetas del ESTADO. NO se elige a mano: el estado se
                      calcula automáticamente según el avance (ver abajo). Aquí
                      solo defines los TEXTOS (con emoji) de cada caso:
                        done       -> se muestra cuando TODAS las tareas están
                                      terminadas (progress 100 o finished:true).
                        inProgress -> se muestra si alguna tarea no lo está.
       objective   -> Campo informativo (no se muestra hoy; útil como nota interna).
     CÁLCULOS AUTOMÁTICOS (no se escriben aquí):
       • "Avance global" = promedio simple del `progress` de TODAS las tareas.
       • "Estado" = `done` si todas las tareas están terminadas, si no `inProgress`.
       • "Periodo" y "Días totales" = se derivan del rango de fechas de las tareas.
     -------------------------------------------------------------------------- */
  "project": {
    "name": "Rediseño del Sitio Web Corporativo",
    "code": "Project Manager By EngineCX",
    "description": "Rediseño completo del sitio web público de la empresa: nueva identidad visual, gestor de contenidos, blog y formularios de contacto, con foco en velocidad de carga y posicionamiento (SEO).",
    "manager": "Nombre del Responsable",
    "team": "Equipo de TI",
    "status": {
      "done": "✅ Finalizado",
      "inProgress": "🚧 En Progreso"
    },
    "objective": "Aumentar las solicitudes de contacto desde el sitio en un 30% y mejorar la calificación de PageSpeed a más de 90."
  },

  /* --------------------------------------------------------------------------
     milestones — Hitos del proyecto.
     ACTUALMENTE NO SE DIBUJAN. Se conserva el campo por si en el futuro se
     reactivan. Puedes dejarlo vacío ([]) o borrarlo sin que se rompa nada.
     -------------------------------------------------------------------------- */
  "milestones": [],

  /* --------------------------------------------------------------------------
     gantt.tasks — Las filas del tablero de tareas. CON FECHAS.
     Cada objeto del arreglo es UNA FILA / UNA BARRA, posicionada por sus fechas
     sobre la línea de tiempo (el orden del arreglo solo decide el orden vertical
     de las filas, no la posición horizontal).

     Campos de cada tarea:
       id        -> Identificador único (texto). No se muestra; sirve de referencia.
       name      -> Nombre de la actividad (texto grande de la fila, a la izquierda).
       track     -> Categoría/equipo. Se muestra en gris bajo el nombre
                    (ej. "Backend", "Diseño"). Es solo una etiqueta de texto libre.
       start     -> Fecha de INICIO en ISO "YYYY-MM-DD". Define dónde empieza la barra.
       end       -> Fecha de FIN en ISO "YYYY-MM-DD" (inclusiva). Define dónde termina.
       progress  -> Avance 0–100. Llena la barra de azul de izquierda a derecha y
                    muestra el porcentaje. Si la tarea está terminada, la barra se
                    pinta en verde (estilo "completado").
       finished  -> true/false. Marca la tarea como terminada (barra verde) aunque
                    el progreso no sea exactamente 100.
       sprint    -> (opcional) id del sprint al que pertenece la tarea. Se muestra
                    como etiqueta junto al `track`; agrupa, no posiciona.
     -------------------------------------------------------------------------- */
  "gantt": {
    "tasks": [
      // --- Terminadas (finished:true) ---
      { "id": "g1", "name": "Descubrimiento y requerimientos", "track": "Discovery", "start": "2026-05-05", "end": "2026-05-16", "progress": 100, "finished": true,  "sprint": "s1" },
      { "id": "g2", "name": "Identidad visual y wireframes",    "track": "Diseño",    "start": "2026-05-19", "end": "2026-05-30", "progress": 100, "finished": true,  "sprint": "s1" },

      // --- En curso (finished:false, progress entre 1 y 99) ---
      { "id": "g3", "name": "Maquetado de páginas (frontend)",  "track": "Frontend",  "start": "2026-06-02", "end": "2026-06-27", "progress": 60,  "finished": false, "sprint": "s2" },
      { "id": "g4", "name": "Gestor de contenidos (CMS)",       "track": "Backend",   "start": "2026-06-09", "end": "2026-07-04", "progress": 35,  "finished": false, "sprint": "s2" },

      // --- Por iniciar (finished:false, progress 0) ---
      { "id": "g5", "name": "Blog y formularios de contacto",   "track": "Frontend",  "start": "2026-07-07", "end": "2026-07-18", "progress": 0,   "finished": false, "sprint": "s3" },
      { "id": "g6", "name": "Optimización SEO y rendimiento",   "track": "Calidad",   "start": "2026-07-21", "end": "2026-07-31", "progress": 0,   "finished": false, "sprint": "s3" },
      { "id": "g7", "name": "Pruebas y lanzamiento",            "track": "Release",   "start": "2026-08-03", "end": "2026-08-15", "progress": 0,   "finished": false, "sprint": "s3" }
    ]
  },

  /* --------------------------------------------------------------------------
     sprints — La bitácora de ejecución (debajo del tablero). Agrupación
     SECUNDARIA: derivan de las fechas (qué tareas caen en cada ventana), no
     posicionan nada. Cada sprint es UNA PESTAÑA con su meta y objetivos.

     Campos de cada sprint:
       id        -> Identificador único (texto). Coincide con el "sprint" de las
                    tareas del tablero si quieres mantenerlos relacionados.
       name      -> Texto de la PESTAÑA (ej. "Sprint 1").
       subtitle  -> Subtítulo dentro del panel (bajo el nombre).
       goal      -> Meta del sprint; párrafo descriptivo dentro del panel.
       objectives-> Lista de objetivos del sprint (ver abajo).

     COMPORTAMIENTO DE LA PESTAÑA:
       • La pestaña muestra un contador "completados/total" (ej. 2/4).
       • Si TODOS los objetivos tienen completed:true, la pestaña se pinta en
         verde con una ✓ ("Sprint completado").

     Campos de cada objetivo (dentro de objectives):
       id          -> Identificador único (texto). No se muestra.
       title       -> Título del objetivo (en negrita).
       description -> Descripción/detalle del objetivo.
       completed   -> true/false. SOLO LECTURA: refleja el estado aquí escrito.
                      Si completed:true, el objetivo aparece tachado con ✓ verde.
     -------------------------------------------------------------------------- */
  "sprints": [
    {
      "id": "s1",
      "name": "Sprint 1",
      "subtitle": "Descubrimiento y diseño",
      "goal": "Entender los objetivos del negocio y dejar definida la dirección visual del nuevo sitio.",
      "objectives": [
        // Sprint completo: todos los objetivos en true → la pestaña sale en verde.
        { "id": "s1o1", "title": "Levantamiento de requerimientos", "description": "Reunir necesidades de las áreas de marketing y ventas, y definir el mapa del sitio.", "completed": true },
        { "id": "s1o2", "title": "Identidad visual aprobada", "description": "Definir paleta de colores, tipografía y estilo, y validarlo con dirección.", "completed": true },
        { "id": "s1o3", "title": "Wireframes de páginas clave", "description": "Bocetar inicio, servicios, blog y contacto en baja fidelidad.", "completed": true }
      ]
    },
    {
      "id": "s2",
      "name": "Sprint 2",
      "subtitle": "Construcción del sitio",
      "goal": "Construir las páginas principales y el gestor de contenidos para cargar información real.",
      "objectives": [
        // Sprint en progreso: mezcla de true/false → pestaña con contador (ej. 1/3).
        { "id": "s2o1", "title": "Maquetar página de inicio", "description": "Implementar el inicio responsivo con la nueva identidad visual.", "completed": true },
        { "id": "s2o2", "title": "Integrar el CMS", "description": "Conectar el gestor de contenidos para que el equipo edite textos e imágenes sin código.", "completed": false },
        { "id": "s2o3", "title": "Páginas de servicios", "description": "Construir las páginas de servicios a partir de las plantillas del CMS.", "completed": false }
      ]
    },
    {
      "id": "s3",
      "name": "Sprint 3",
      "subtitle": "Contenido, SEO y lanzamiento",
      "goal": "Completar el contenido, optimizar el rendimiento y publicar el sitio.",
      "objectives": [
        // Sprint por iniciar: todos en false → contador 0/3.
        { "id": "s3o1", "title": "Blog y formularios de contacto", "description": "Habilitar el blog y los formularios con notificación por correo.", "completed": false },
        { "id": "s3o2", "title": "Optimización SEO y velocidad", "description": "Mejorar metadatos, imágenes y carga para superar 90 en PageSpeed.", "completed": false },
        { "id": "s3o3", "title": "Pruebas y publicación", "description": "Pruebas en navegadores, revisión final y despliegue a producción.", "completed": false }
      ]
    }
  ]

};
