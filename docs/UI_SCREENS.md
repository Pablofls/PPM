# Inventario de pantallas

Pantallas del panel, sus columnas y su comportamiento. Es la especificación de lo
que se construyó en `src/pages/`.

**Alcance actual: Módulo 1, Módulo 2 y los Apéndices A/B**, más el expediente del
alumno y la bienvenida del portal del alumno. No hay demo data en ninguna pantalla: lo que se ve sale de la base
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
└── PRÓXIMAMENTE  (visible pero deshabilitado)
    ├── Grupos
    ├── Estado de Entregas
    └── Alumnos Registrados
```

Las secciones de «Próximamente» se muestran deshabilitadas a propósito: le comunican
al profesor el alcance completo del proyecto sin prometer que ya funcionan.

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

## Portal del alumno

Lo que ve un usuario con rol `alumno`. Es **una sola pantalla**, fuera del
`AppShell`: el rail es la navegación del profesor y un alumno no tiene once
pantallas que recorrer.

### Bienvenida · `/alumno`

`src/pages/alumno/StudentHome.tsx`, protegida por `StudentRoute`.

| Bloque | Contenido |
|---|---|
| Encabezado | «Prácticas Profesionales · Portal del alumno», correo y *Cerrar sesión* |
| Saludo | Su nombre, tal como lo registró en el 1.0 |
| Tu cuenta | Nombre, correo institucional y el recordatorio de que la contraseña es su matrícula |
| Próximamente | Mis entregas · Mi expediente · Mis bitácoras, deshabilitadas |

No consulta ninguna tabla: todo sale de su propio `profiles`. El rol `alumno` no
tiene política de lectura sobre los datos, así que hoy no podría leer ni sus
propias entregas. Ver [AUTH.md](AUTH.md).

Las tres secciones deshabilitadas siguen la convención del «Próximamente» del
rail: comunican a dónde va el portal sin prometer que ya funciona. **No son demo
data**: no hay una sola fila inventada en la pantalla.

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
