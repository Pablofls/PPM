# Inventario de pantallas

Pantallas del panel, sus columnas y su comportamiento. Es la especificación de lo
que se construyó en `src/pages/`.

**Alcance de esta iteración: Módulo 1 y Módulo 2.** Todas las pantallas se renderizan
en estado vacío, sin demo data (regla 3 de [CLAUDE.md](../CLAUDE.md)).

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
└── PRÓXIMAMENTE  (visible pero deshabilitado)
    ├── Apéndice A: Cartas Requeridas
    ├── Apéndice B: Reportes
    ├── Bitácoras semanales
    ├── Grupos
    ├── Estado de Entregas
    └── Alumnos Registrados
```

Las secciones de «Próximamente» se muestran deshabilitadas a propósito: le comunican
al profesor el alcance completo del proyecto sin prometer que ya funcionan.

## Estructura común de una pantalla

Todas las pantallas de formulario comparten el mismo esqueleto:

1. **Encabezado** — título, subtítulo y las acciones *Procesar datos* y
   *Exportar datos*. En esta iteración los botones están deshabilitados con un
   tooltip que lo explica.
2. **Resumen** — contadores: respuestas recibidas, alumnos sin responder, entregas
   tarde. Sin base de datos muestran `—`.
3. **Barra de filtros** — idéntica en todas las pantallas:
   - Búsqueda por correo institucional
   - Idioma · Frecuencia · Carrera · Semestre · Período
4. **Tabla de datos** — una fila por alumno (la respuesta más reciente, vía
   `latest_submissions`). Encabezados fijos y scroll horizontal propio.
5. **Panel de alumno** — al hacer clic en una fila se abre un panel lateral con el
   detalle completo y el **historial de respuestas** de ese formulario.

### Estado vacío

Sin base de datos conectada, la tabla muestra su encabezado completo y un mensaje
que explica que la fuente de datos aún no está conectada. **El encabezado se
mantiene visible**: es lo que le permite al profesor evaluar si las columnas son las
correctas, que es el objetivo de esta presentación.

### Historial de respuestas

`SubmissionTimeline` lista todas las respuestas de un alumno a un formulario,
ordenadas de la más reciente a la más antigua, marcando cuál es la vigente.

La tabla muestra una fila por alumno, pero el historial completo siempre está a un
clic. Esto es indispensable para las bitácoras semanales (donde un alumno tiene
hasta 10 respuestas) y protege al resto de los formularios: si un alumno reenvía,
la respuesta anterior sigue consultable.

---

## Módulo 1 — Conócete

### 1.0 Datos Demográficos · `form1_0`

Columnas, en el mismo orden que la plataforma actual:

| Columna | Campo | Formato |
|---|---|---|
| Nombre | `full_name` | texto, enlace al panel del alumno |
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
| Puestos | `positions` — texto multilínea, se muestra completo en el panel |
| Vacantes | `position_url_1/2/3` — 3 enlaces numerados |
| Compañías | `companies` — texto multilínea |
| Perfiles | `company_url_1/2/3` — 3 enlaces numerados |

Las URLs de Indeed son muy largas; se muestran como enlaces numerados
(`Vacante 1`, `Vacante 2`, `Vacante 3`) y no como texto crudo.

---

## Decisiones de interfaz

| Decisión | Motivo |
|---|---|
| Encabezado de tabla visible en estado vacío | El objetivo de la demo es validar columnas, no ver datos |
| Los filtros viven en la URL (`?idioma=es&periodo=PR-26`) | El profesor puede compartir o guardar una vista filtrada |
| Una fila por alumno, historial en el panel lateral | La tabla se mantiene legible sin perder los reenvíos |
| Botones *Procesar* y *Exportar* presentes pero deshabilitados | Existen en la plataforma actual; ocultarlos daría a entender que se eliminaron |
| Sin gráficas en esta iteración | Primero hay que validar que los datos y columnas son los correctos |
| Secciones futuras visibles y deshabilitadas | Comunican el alcance completo sin prometer funcionalidad |
