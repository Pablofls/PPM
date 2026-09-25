# Inventario de pantallas

Pantallas del panel, sus columnas y su comportamiento. Es la especificación de lo
que se construyó en `src/pages/`.

**Alcance actual: Módulo 1, Módulo 2 y los Apéndices A/B**, más el expediente del
alumno y el portal del alumno, donde este entrega sus dos bitácoras semanales.
No hay demo data en ninguna pantalla: lo que se ve sale de la base
(regla «Sin demo data en las pantallas» de [CLAUDE.md](../CLAUDE.md)).

## Navegación

El sidebar replica el de la plataforma actual en Apps Script para que el profesor
reconozca de inmediato dónde está.

```
PPM
├── MÓDULO 1: CONÓCETE
│   ├── 1.0 Datos Demográficos
│   ├── 1.1 Intereses Profesionales
│   ├── 1.2 Personalidad
│   ├── 1.3 Estilos de Comportamiento
│   ├── 1.4 Formulario de Habilidades
│   └── 1.5 Valores
├── MÓDULO 2: ACTÚA
│   ├── 2.1 Análisis FODA
│   ├── 2.2 Curriculum Vitae
│   ├── 2.4 Cover Letter
│   ├── 2.5 Elevator Pitch
│   └── 2.7 Indeed
├── APÉNDICE A · CARTAS REQUERIDAS
│   └── A.1 Carta Formal de Aceptación
├── APÉNDICE B · REPORTES
│   └── B.1 Formulario de Inicio
├── ENTREGAS
│   └── Estado de Entregas
├── ADMINISTRADOR
│   └── Panel de Administrador
└── PRÓXIMAMENTE  (visible pero deshabilitado)
    ├── Grupos
    └── Alumnos Registrados
```

Las secciones de «Próximamente» se muestran deshabilitadas a propósito: le comunican
al profesor el alcance completo del proyecto sin prometer que ya funcionan.
«Estado de Entregas» salió de esa lista junto con «Panel de Administrador»
(`0017`, ver [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas)):
son las dos pantallas nuevas, y a diferencia del resto de «Próximamente» sí
funcionan.

## Estructura común de una pantalla

Todas las pantallas de formulario comparten el mismo esqueleto:

1. **Encabezado** — título, subtítulo, el estado de la sincronización y las
   acciones *Procesar datos* y *Exportar datos*. En esta iteración los botones
   están deshabilitados con un tooltip que lo explica.

   El estado de la sincronización va a la izquierda de los botones y lee la
   última corrida de `sheet_sync_runs` (ver [SHEETS_SYNC.md](SHEETS_SYNC.md)).
   Dice *Sincronizado hace 12 minutos* en condiciones normales y se marca con
   el color de acento cuando pasan más de 150 minutos sin una corrida, cuando
   una corrida no cerró, o cuando nunca ha habido ninguna. No es decoración:
   sin él, un disparador muerto se ve igual que una semana sin entregas.
2. **Resumen** — contadores: respuestas recibidas, alumnos sin responder, entregas
   tarde. Sin base de datos muestran `—`.
3. **Barra de filtros** — idéntica en todas las pantallas:
   - Búsqueda por correo institucional
   - Idioma · Frecuencia · Carrera · Semestre · Período
4. **Tabla de datos** — una fila por alumno (la respuesta más reciente, vía
   `latest_submissions`). Encabezados fijos y scroll horizontal propio.
5. **Expediente del alumno** — al hacer clic en una fila se abre con todo lo que
   se sabe del alumno, sin importar desde qué pantalla se abrió.

### Estado vacío

Sin base de datos conectada, la tabla muestra su encabezado completo y un mensaje
que explica que la fuente de datos aún no está conectada. **El encabezado se
mantiene visible**: es lo que le permite al profesor evaluar si las columnas son las
correctas, que es el objetivo de esta presentación.

### Expediente del alumno

`StudentDossier` es la ventana que se abre al hacer clic en un nombre. Reemplazó
al panel lateral por formulario, que solo mostraba la pantalla en la que estabas
parado: para responder *«¿cómo va este alumno?»* había que recorrer las trece.

Es la misma idea de la tarjeta **ADN Profesional** de la plataforma anterior, con
las mismas secciones romanas. Ahí se armaba leyendo ocho hojas del Sheets en cada
clic; aquí la arma `v_student_dossier` en una sola consulta.

| Sección | De dónde sale |
|---|---|
| Identidad, edad y datos académicos | 1.0 |
| I — Intereses Profesionales | 1.1 |
| II — Personalidad · III — Comportamiento | 1.2 y 1.3 |
| IV — Valores | 1.5 |
| V — Datos de Prácticas Profesionales | B.1 |
| VI — Reporte de Búsqueda | `form_busqueda` |
| VII — Reporte de Prácticas | `form_practicas` |
| Detalle del formulario y su historial | la pantalla desde la que se abrió |

**Una sección sin datos no se dibuja.** Un alumno que no contestó el 1.2 no ve un
recuadro vacío de Personalidad; ve un expediente más corto.

#### El radar de Holland

`HollandRadar` dibuja el hexágono RIASEC en **SVG**, sin librería de gráficas.
Son seis ejes fijos y una sola serie: unas coordenadas polares. Chart.js pesa
unos 70 KB comprimido; el radar completo agregó **2.5 KB** al bundle. Es el mismo
criterio por el que la tabla de datos es propia y no TanStack.

Dos diferencias con la versión de Apps Script:

- **Los ejes van en orden RIASEC fijo.** La anterior los ordenaba por puntuación,
  así que cada alumno tenía el radar en un orden distinto y dos siluetas iguales
  no significaban lo mismo. Con el orden fijo, la forma sí se puede comparar.
- **La escala nunca baja de 12.** Un alumno con puntuaciones de 7/6/4 tendría el
  polígono pegado al borde y parecería que va mejor de lo que va.

El formulario solo guarda los tres intereses más altos, así que los otros tres
ejes valen cero. Es la información que existe, no un dato inventado.

Verificado con seis perfiles, incluidos el de puntuaciones más bajas (7/6/4), el
máximo real (16) y el vacío.

#### Historial de respuestas

`SubmissionTimeline` lista todas las respuestas de un alumno al formulario desde
el que se abrió el expediente, de la más reciente a la más antigua, marcando cuál
es la vigente. Si un alumno reenvía, la respuesta anterior sigue consultable.

#### Las bitácoras semanales viven aquí

`form_busqueda` y `form_practicas` **no tienen pantalla en el rail**, igual que en
la plataforma anterior: son las secciones VI y VII del expediente.

En VII, la columna **Acumulado** suma las horas semana por semana y el pie muestra
el total. Ordena por **semana reportada**, no por fecha de envío: una bitácora
atrasada se acomoda donde corresponde. La plataforma anterior ordenaba comparando
`dd/MM/yyyy` como texto, así que `09/04` quedaba antes que `16/03`.

---

## Módulo 1 — Conócete

### 1.0 Datos Demográficos · `form1_0`

Columnas, en el mismo orden que la plataforma actual:

| Columna | Campo | Formato |
|---|---|---|
| Nombre | `full_name` | texto, abre el expediente del alumno |
| Matrícula | `student_number` | texto |
| Correo Institucional | `institutional_email` | texto, truncado con tooltip |
| Idioma | `language` | badge (Español / Inglés) |
| Correo Personal | `personal_email` | texto |
| Fecha Nacimiento | `birth_date` | `dd/mm/aaaa` |
| País Nacimiento | `birth_country` | texto |
| Sexo | `gender` | texto |
| Frecuencia | `session_day` | texto (Lunes / Miércoles) |
| Carrera | `degree_code` | badge |
| Semestre | `semester` | `6to`, `8vo` |
| Período | `period_code` | badge |

### 1.1 Intereses Profesionales · `form1_1`

Resultados del inventario Holland (RIASEC).

| Columna | Campo |
|---|---|
| Nombre · Correo · Idioma | comunes |
| Código Holland | `holland_code` — badge de 3 letras |
| 1er interés / puntaje | `first_type` + `first_score` |
| 2do interés / puntaje | `second_type` + `second_score` |
| 3er interés / puntaje | `third_type` + `third_score` |
| Fecha de respuesta | `submitted_at` |

Las letras se muestran con su nombre completo (`S` → `Social`).

### 1.2 Personalidad · `form1_2`

| Columna | Campo |
|---|---|
| Nombre · Correo · Idioma | comunes |
| Tipo | `mbti_type` — badge de 4 letras |
| Identidad | `identity` (Asertivo / Cauteloso) |
| Energía | `energy` + `energy_pct` |
| Mente | `mind` + `mind_pct` |
| Naturaleza | `nature` + `nature_pct` |
| Tácticas | `tactics` + `tactics_pct` |
| Reporte | `report_url` — enlace si es una URL válida |

Los porcentajes se muestran con una barra, no solo el número.

### 1.3 Estilos de Comportamiento · `form1_3`

| Columna | Campo |
|---|---|
| Nombre · Correo · Idioma | comunes |
| Estilo DISC | `disc_style` — badge |
| Categoría | `disc_category` |
| Explicación | `explanation` — texto largo, truncado |
| Revisión | `needs_review` — marca de advertencia |

> La columna **Revisión** es específica de esta pantalla. Marca las respuestas que
> llegaron contaminadas desde el formulario de Google (ver
> [DATA_MAPPING.md](DATA_MAPPING.md#form1_3--disc_results)) para que el profesor las
> corrija. Un filtro permite ver solo esas filas.

### 1.4 Formulario de Habilidades · `form1_4`

33 habilidades no caben a lo ancho. La pantalla agrega un **selector de grupo de
habilidades** que controla qué columnas se muestran:

| Grupo | Habilidades |
|---|---|
| Comunicación e interpersonal | comunicación escrita, verbal y no verbal, colaboración, liderazgo, resolución de conflictos, negociación, escucha activa, empatía, servicio al cliente |
| Herramientas digitales | Excel, Sheets, Word, Docs, PowerPoint, Slides, ChatGPT, Gemini, programación |
| Pensamiento y gestión | pensamiento crítico, toma de decisiones, administración del tiempo, planeación, análisis e investigación, administración de proyectos |
| Desarrollo personal | creatividad, flexibilidad, ética de trabajo, educación financiera, capacidad de aprender, inteligencia emocional, networking, ventas |

Nombre, correo, idioma y **PEF y graduando** quedan fijos en todos los grupos.
Cada nivel se muestra como badge de color según la escala
`Novato < Principiante < Intermedio < Avanzado < Experto`.

### 1.5 Valores · `form1_5`

| Columna | Campo |
|---|---|
| Nombre · Correo · Idioma | comunes |
| Valores fuertes | `top_values` — un chip por valor |
| Puntuación | `score` |
| Reporte | `report_url` |

---

## Módulo 2 — Actúa

### 2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch

Los cuatro comparten estructura (`reflections`) y por lo tanto un mismo componente
de página parametrizado por `form_code`. Cambian el título y el subtítulo.

| Columna | Campo |
|---|---|
| Nombre · Correo · Idioma | comunes |
| ¿Fue útil? | `was_useful` — badge Sí / No |
| Por qué | `reason` — texto largo, truncado con expansión |
| Fecha de respuesta | `submitted_at` |
| Entrega | estado calculado: a tiempo / tarde / pendiente / sin fecha |

> La columna **Entrega** aparece en estas cuatro pantallas porque son los únicos
> formularios con fecha configurada hoy en `fechas_entrega`. El componente es
> genérico y se activa en cualquier formulario en cuanto se le configure una fecha.

### 2.7 Indeed · `form2_7`

| Columna | Campo |
|---|---|
| Nombre · Correo · Idioma | comunes |
| Puestos | `positions` — texto multilínea, se muestra completo en el expediente |
| Vacantes | `position_url_1/2/3` — 3 enlaces numerados |
| Compañías | `companies` — texto multilínea |
| Perfiles | `company_url_1/2/3` — 3 enlaces numerados |

Las URLs de Indeed son muy largas; se muestran como enlaces numerados
(`Vacante 1`, `Vacante 2`, `Vacante 3`) y no como texto crudo.

---

## Apéndices

Las dos pantallas replican la estructura de la plataforma anterior, que es
distinta a la del Módulo 1 y 2:

| | Módulo 1 y 2 | Apéndices |
|---|---|---|
| Buscador | por correo institucional | **por nombre o empresa** |
| Filtros | Idioma, Frecuencia, Carrera, Semestre, Período | **solo Período** |
| Acciones | Procesar datos · Exportar datos | **solo Exportar datos** |
| Filas | todas, con scroll | **paginadas de 10 en 10** |
| Correo del alumno | columna propia | **no se muestra**: identifica la empresa |

### A.1 Carta Formal de Aceptación · `formA_1`

Nombre · Idioma · Empresa · RFC · Página Web · Año Empresa · Horas · Remunerada ·
Departamento · Nombre Jefe · Puesto Jefe · Horario.

El expediente abre la descripción de actividades, la relación con la carrera y
con su desarrollo profesional, las restricciones, la validación de la empresa y
los datos de contacto del jefe.

### B.1 Formulario de Inicio · `formB_1`

Nombre · Idioma · Empresa · Página Web · Giro · Misión · Visión · Valores ·
Dirección · Horario · Departamento · Contrato · Sueldo · Contactos LinkedIn.

El sueldo se formatea como moneda. El horario es texto descriptivo, no un número
de horas: así viene del formulario.

> Los datos de contacto del jefe (nombre, correo, teléfono) **solo aparecen en el
> expediente**, no en la tabla. Son datos de terceros y no tienen por qué estar
> a la vista en una pantalla que alguien puede proyectar.

## Estado de Entregas y Panel de Administrador

> `0017_form_deadlines.sql` y `0018_semester_weeks.sql`. Ver
> [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas).
> Las únicas dos pantallas del rail que no cuelgan de un `form_code` fijo ni de
> `FormPage`: no muestran un formulario, sino **todos** a la vez.

### Panel de Administrador

Asigna la fecha límite que "Estado de Entregas" necesita para comparar. No
existía en la plataforma anterior: ahí la fecha se editaba a mano en la hoja
`fechas_entrega` del Sheets.

- **Grupo**: selects de Idioma, Frecuencia y Período — igual que los filtros
  compartidos, vacío = "todos". No hay selector de Carrera ni Semestre: la
  fecha se piensa por cohorte (idioma/frecuencia/periodo), no por carrera.
- **Fecha límite**: un solo `<input type="date">`. El panel completa la hora a
  `23:59:59` hora de Monterrey — el profesor piensa en un día, no en un
  instante.
- **Formularios**: checklist de los 12 formularios que pueden llevar fecha
  (todos salvo 1.0 Datos Demográficos y las dos bitácoras). "Seleccionar
  todos"/"Limpiar".
- **Guardar fechas** crea una regla por formulario marcado, con el mismo grupo
  y fecha. Las reglas viven abajo, en "Fechas asignadas": Formulario, Idioma,
  Frecuencia, Período, Fecha Límite, Creado, y un botón para borrarla.
- **No hay edición.** Corregir una fecha es borrarla y crear otra.

### Semanas del semestre

> `0018_semester_weeks.sql`. Ver
> [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#semanas-del-semestre). Segunda
> herramienta de la misma pantalla, no una pantalla aparte.

Define las semanas que después elige el alumno al entregar una bitácora, en
vez de que las escriba a mano (la causa más común de captura mal hecha en el
Sheets original).

- **Periodo**: el mismo `Select` de `PERIOD_OPTIONS` que usa "Asignar fecha de
  entrega" — un periodo nuevo (`PR-27`) se agrega a ese catálogo antes de
  poder configurarle semanas.
- **Semana 1 empieza (lunes)**: `<input type="date">`. Un aviso en rojo avisa
  si la fecha elegida no cae en lunes; la base lo vuelve a validar.
- **Número de semanas**: numérico, 1–53. Las semanas 2 en adelante salen solas,
  sumando 7 días cada vez.
- **Generar semanas** crea las N filas. Abajo, un resumen por periodo ya
  configurado (periodo · número de semanas · rango completo) con un botón para
  borrarlas todas — es la forma de corregir la fecha de la semana 1: borrar y
  volver a generar, no editar una semana a la mitad de la serie.

### Estado de Entregas

La matriz alumno × formulario. Filtros completos (Idioma, Frecuencia, Carrera,
Semestre, Período), igual que las pantallas de Módulo 1.

| Columna | Contenido |
|---|---|
| Nombre · Carrera · Sem. | comunes, columna Nombre fija |
| una por cada uno de los 12 formularios | un cuadro de color: verde *a tiempo*, ámbar *tarde*, rojo *no entregado*, gris *sin fecha límite configurada* |
| Resumen | conteo de verdes/ámbares/rojos de esa fila |

El color de cada cuadro trae un tooltip con la marca temporal exacta de la
entrega (o "No entregado" / "Sin fecha límite configurada"). Un formulario
gris no es un formulario atrasado: es un formulario al que todavía no se le
asignó fecha desde el Panel de Administrador — no se penaliza al alumno por
una fecha que nadie configuró.

## Portal del alumno

Lo que ve un usuario con rol `alumno`. Vive fuera del `AppShell` y bajo su
propio marco, `src/layouts/StudentShell.tsx`: el rail es la navegación del
profesor, y un alumno tiene dos tareas, no trece pantallas.

El portal está modelado como **las tareas de un curso**, no como un panel de
resultados: una lista de tareas, y dentro de cada una las instrucciones, el
formulario de entrega y lo que ya entregó.

### Mis tareas · `/alumno`

`src/pages/alumno/StudentHome.tsx`, protegida por `StudentRoute`.

| Bloque | Contenido |
|---|---|
| Aviso | Al volver de entregar, la confirmación de que se guardó. Se va solo a los 6 segundos |
| ADN Profesional | Su propio expediente (secciones I a V: identidad, intereses, personalidad, comportamiento, valores y los datos de la práctica en curso). Mismo componente que abre el profesor, `DossierProfile`, sin las bitácoras ni el historial de respuestas |
| Tareas | Una tarjeta por bitácora: nombre, para qué es, cuántas entregas lleva y cuál fue la última |

Sin «Tu cuenta» ni «Próximamente»: el bloque ADN Profesional ya muestra su
nombre y correo, y «Mis bitácoras»/«Mi expediente» —lo único que tenía esa
lista— ya son parte de la pantalla.

El resumen de cada tarjeta es lo que hace útil la lista. Sin él, el alumno
tendría que entrar a cada tarea para saber si ya entregó la semana. Si la
consulta falla, la tarjeta se queda sin resumen pero no sin tarea: todavía se
puede entrar y entregar.

### Una bitácora · `/alumno/reporte-de-busqueda`, `/alumno/reporte-de-practicas`

`src/pages/alumno/WeeklyLogPage.tsx`. Una sola pantalla para las dos: lo único
que cambia entre ellas son sus campos, y esos viven en `WEEKLY_FORMS`
(`src/lib/catalog.ts`).

| Bloque | Contenido |
|---|---|
| Instrucciones | Cada cuándo se entrega, qué semana se reporta y qué pasa si se equivoca |
| Nueva entrega | Un `<select>` con la semana que reporta, más los campos del formulario |
| Tus entregas | Todas las que lleva, de la más reciente a la más antigua |

Los campos son **los mismos** que tenía el Google Form, con la pregunta original
como texto de ayuda. Las claves de `WeeklyField` son las propiedades de
`JobSearchLogRow` e `InternshipLogRow`, así que el mismo catálogo dibuja el
formulario en blanco y el historial: no hay una segunda lista de columnas que
mantener en sincronía.

| Formulario | Campos |
|---|---|
| Reporte de Búsqueda | Actividades\*, Aplicaciones, Entrevistas, Aprendizajes, Siguientes pasos |
| Reporte de Prácticas | Actividades\*, Horas trabajadas\*, Habilidades, Propuesta |

\* obligatorio.

**El alumno ya no escribe fechas — elige un número de semana.** Desde
`0018_semester_weeks.sql`, el `<select>` se llena con las semanas que el
profesor definió para el periodo del alumno
([Semanas del semestre](#semanas-del-semestre)), cada opción mostrando su
rango («Semana 3 · 17/08 – 23/08»). Es justo la pieza que atajaba el error más
común de la bitácora en el Sheets: 18 de 183 entregas traían el rango
invertido o de más de un mes (ver
[DATA_MAPPING.md](DATA_MAPPING.md#bitácoras-semanales)) porque el alumno lo
tecleaba a mano; ahora es imposible, porque ya no hay nada que teclear.

Se preselecciona la semana que contiene hoy, si el periodo tiene una
configurada; el alumno la puede cambiar, porque reportar una semana atrasada
es legítimo. Lo que no puede es reportar una semana futura, y eso lo rechaza
la base. Si el profesor todavía no configuró las semanas del periodo, el
`<select>` no aparece: un aviso lo reemplaza.

**Al entregar se regresa a la lista de tareas**, con un aviso flotante que
confirma qué se entregó. Quedarse en el formulario dejaría al alumno frente a
los campos vacíos, que se parece demasiado a que no pasó nada; y al volver al
índice ve el contador de esa tarea ya actualizado.

El aviso viaja en el `state` de la navegación, no en la URL —es un mensaje de
una sola vez, y en la URL quedaría en el historial y en cualquier enlace que el
alumno copiara— y se limpia del historial en cuanto se lee, para que recargar
no vuelva a anunciar una entrega vieja.

**Una entrega no se edita ni se borra.** Corregir una semana es volver a
entregarla, y el profesor ve las dos en el expediente (regla «Historial
completo» de [CLAUDE.md](../CLAUDE.md)). La pantalla lo dice junto al botón, en
vez de dejar que el alumno lo descubra después.

«Tus entregas» incluye lo que el alumno entregó por Google Forms antes de que
existiera esta pantalla: las dos vías escriben en la misma tabla y aquí no se
distinguen, que es justo lo que se quiere.

> Lo que el alumno entrega aparece en el expediente del profesor sin ningún paso
> extra: son las secciones VI y VII, que ya leían esas dos tablas.

## Decisiones de interfaz

| Decisión | Motivo |
|---|---|
| Encabezado de tabla visible en estado vacío | El objetivo de la demo es validar columnas, no ver datos |
| Los filtros viven en la URL (`?idioma=es&periodo=PR-26`) | El profesor puede compartir o guardar una vista filtrada |
| Una fila por alumno, historial en el expediente | La tabla se mantiene legible sin perder los reenvíos |
| El expediente es cruzado, no por formulario | La pregunta del profesor es «¿cómo va este alumno?», no «¿quién contestó el 1.2?» |
| Botones *Procesar* y *Exportar* presentes pero deshabilitados | Existen en la plataforma actual; ocultarlos daría a entender que se eliminaron |
| El radar en SVG propio, sin Chart.js | Seis ejes y una serie no justifican 70 KB de librería |
| Sin gráficas en las pantallas de tabla | Ahí lo que se valida son los datos y las columnas |
| Secciones futuras visibles y deshabilitadas | Comunican el alcance completo sin prometer funcionalidad |
| El portal del alumno se ve como las tareas de un curso | Es lo que el alumno viene a hacer: entregar. Un panel de resultados sería la vista del profesor en chiquito |
| La semana se propone en vez de dejarla vacía | Las fechas mal capturadas fueron el error más común de la bitácora en el Sheets |
| Una entrega no se puede editar | Es la regla «Historial completo»: corregir es volver a entregar, y el profesor ve las dos |
| Al entregar se vuelve al índice, con aviso | Un formulario que se vacía en su sitio se parece a que la entrega se perdió |
