# Mapeo Google Sheets → PostgreSQL

Cómo se traduce cada hoja del Sheets actual a las tablas de
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), y qué limpieza hay que aplicar.

Este documento es la especificación del script de importación. Todavía no existe
código de importación.

> **Alcance actual:** solo los 11 formularios `form1_0` … `form2_7`. Las hojas
> `alumnos` y `fechas_entrega`, los apéndices A/B y las bitácoras semanales
> quedan fuera por ahora; sus secciones se conservan más abajo como referencia
> para cuando se incorporen.

> Los ejemplos usan valores ficticios. Ver la regla «Nunca datos sensibles» de [CLAUDE.md](../CLAUDE.md).

## Reglas generales

| Regla | Detalle |
|---|---|
| **Llave foránea** | `idCorreo` (correo institucional) → `students.institutional_email` → `students.id` |
| **Alta de alumnos** | `students` se puebla con los correos vistos en los formularios (upsert). No se importa la hoja `alumnos`: **46 correos únicos** en los 11 formularios |
| **Correo** | `trim` + `lower`. La columna es `citext`, así que la comparación ya es insensible a mayúsculas |
| **Marca temporal** | `marcaTemporal` → `submissions.submitted_at`. En `form1_1` el encabezado está mal escrito: **`marcaTemproal`** |
| **Idioma** | `Español` → `es`, `Inglés` → `en`. La columna existe en todas las hojas de formulario |
| **Sin correo** | Si `idCorreo` viene vacío, la fila se registra en el log y no se importa. En los datos actuales **no hay ninguna** |
| **Filas vacías** | Las hojas traen filas en blanco al final (`form1_3` tiene 999 filas y solo 43 con datos). Se ignora toda fila sin `idCorreo` **y** sin `marcaTemporal` |
| **Idempotencia** | `source_row_key = form_code + ':' + email + ':' + submitted_at`. Reimportar no duplica |
| **Números** | El Sheets entrega enteros como float (`123456.0`). Los identificadores (matrícula, teléfono, RFC) van a `text`; las métricas a `smallint`/`numeric` |

## Orden de importación

1. `forms` — ya viene sembrado en `0007_seed_forms.sql`
2. `students` — upsert de cada `idCorreo` distinto encontrado en los 11 formularios
3. `submissions` + su tabla de respuestas, hoja por hoja
4. Revisión manual de `disc_results` con `needs_review = true`

## Fuera del alcance actual

Las secciones de `alumnos`, `fechas_entrega`, `formA_1`, `formB_1`,
`form_busqueda` y `form_practicas` se conservan abajo como referencia, pero **sus
tablas no existen todavía** en la base de datos.

---

## `alumnos` → `students`

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `correo` | `institutional_email` | `trim`, `lower` |
| `periodo` | `period_code` | directo (`PR-26`, `OT-26`) |
| `frecuencia` | `session_day` | `Lunes` → `lunes`, `Miércoles` → `miercoles` |
| `idioma` | `language` | `Español` → `es`, `Inglés` → `en` |

## `fechas_entrega` → `form_deadlines`

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `id` | — | se descarta; era `formulario___periodo`, ahora la PK es `uuid` |
| `formulario` | `form_code` | directo |
| `idioma` | `language` | vacío → `NULL` (= todos los idiomas) |
| `frecuencia` | `session_day` | vacío → `NULL` (= todos los grupos) |
| `periodo` | `period_code` | directo |
| `fechaEntrega` | `due_at` | fecha del Sheets → `timestamptz`, zona `America/Monterrey` |
| `creadoEn` | `created_at` | directo |

> Las fechas del Sheets vienen sin zona horaria (`2026-02-02 05:59:59`). Se
> interpretan en `America/Monterrey` al convertir a `timestamptz`.

---

## Módulo 1

### `form1_0` → `demographics`

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `nombre` | `full_name` | `trim`. Viene con mayúsculas inconsistentes (`NOMBRE APELLIDO` vs `Nombre Apellido`); se conserva tal cual y la UI aplica el formato |
| `matricula` | `student_number` | float → `text` sin decimales: `123456.0` → `"123456"` |
| `correoPersonal` | `personal_email` | `trim`, `lower` |
| `fechaNacimiento` | `birth_date` | solo la parte de fecha; el Sheets trae una hora espuria (`05:00:00`) por la zona horaria |
| `paisNacimiento` | `birth_country` | **texto libre**, sin normalizar: hay `Mexico`, `México`, `MEXICO`, `mexico`, `MX`, `Colombia` |
| `sexo` | `gender` | ver tabla abajo |
| `frecuencia` | `session_day` | igual que en `alumnos` |
| `carrera` | `degree_code` | `LMEC`, `LMI` → FK a `degree_programs` |
| `semestre` | `semester` | `6to`→`6`, `7mo`→`7`, `8vo`→`8`, `9no`→`9`, `10mo`→`10` |
| `periodo` | `period_code` | directo |

**Normalización de `sexo`** — el formulario en inglés produce un valor distinto:

| Valor en el Sheets | Postgres |
|---|---|
| `Femenino`, `Femenine` | `femenino` |
| `Masculino`, `Masculine` | `masculino` |
| vacío | `no_especificado` |

> `Femenine` es la opción del formulario en inglés (escrita así en el original) y
> representa lo mismo que `Femenino`. No son categorías distintas.

**`birth_country` queda como texto libre a propósito.** Normalizarlo a un catálogo
de países implicaría decidir qué hacer con `MX` y las variantes de acentuación, y el
profesor no filtra por país. Si eso cambia, se agrega un catálogo y se documenta aquí.

### `form1_1` → `holland_results`

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `marcaTemproal` *(sic)* | `submissions.submitted_at` | **encabezado mal escrito en el origen** |
| `primerPuntaje` | `first_type` | `R (Realista)` → `R`; se extrae la letra inicial |
| `segundoPuntaje` | `second_type` | igual |
| `tercerPuntaje` | `third_type` | igual |
| `codigoHolland` | `holland_code` | `upper`, 3 letras (`SEA`, `RIC`) |
| `primerPuntacion` *(sic)* | `first_score` | float → `smallint` |
| `segundaPuntuacion` | `second_score` | float → `smallint` |
| `tercerPuntuacion` | `third_score` | float → `smallint` |

Las letras del código Holland: `R` Realista, `I` Investigadora, `A` Artística,
`S` Social, `E` Emprendedora, `C` Convencional.

> La hoja tiene 7 columnas extra sin encabezado y completamente vacías (índices
> 10–16). Se ignoran.

### `form1_2` → `mbti_results`

**El cambio estructural más grande.** La hoja tiene 16 columnas, una por tipo MBTI
con nombre en español. Para cada alumno solo una tiene valor, y ese valor es la
letra de identidad (`A` = Asertivo, `T` = Cauteloso/Turbulento).

Se colapsa en dos columnas: `mbti_type` (qué columna tenía valor) e `identity`
(qué letra tenía).

| Columna Sheets | `mbti_type` |
|---|---|
| `arquitecto` | `INTJ` |
| `logico` | `INTP` |
| `comandante` | `ENTJ` |
| `innovador` | `ENTP` |
| `abogado` | `INFJ` |
| `mediador` | `INFP` |
| `protagonista` | `ENFJ` |
| `activista` | `ENFP` |
| `practico` | `ISTJ` |
| `defensor` | `ISFJ` |
| `ejecutivo` | `ESTJ` |
| `consul` | `ESFJ` |
| `vistuoso` *(sic)* | `ISTP` |
| `aventurero` | `ISFP` |
| `emprendedor` | `ESTP` |
| `animador` | `ESFP` |

> **Supuesto a confirmar con el profesor:** `practico` → `ISTJ`. En 16Personalities
> el ISTJ en español es «Logista»; `practico` es el único nombre de la lista que no
> corresponde literalmente y ISTJ es el único tipo sin columna asignada. En los datos
> actuales esa columna está vacía, así que el supuesto no afecta ninguna fila todavía.
>
> Columnas vacías en los datos actuales: `mediador`, `practico`, `vistuoso`,
> `aventurero`, `emprendedor`. Que estén vacías no significa que sobren.

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `link` | `report_url` | texto libre; hay valores que no son URL (`prueba.com`). No se valida |
| `energia` | `energy` | **`Extravertido` y `Extrovertido` son el mismo valor** → `extravertido` |
| `mente` | `mind` | `Intuitivo`/`Observador` → `intuitivo`/`observador` |
| `naturaleza` | `nature` | `Pensamiento`/`Emocional` → `pensamiento`/`emocional` |
| `tacticas` | `tactics` | `Juzgador`/`Prospección` → `juzgador`/`prospeccion` |
| `identidad` | `identity` | `Asertivo`/`Cauteloso` → `asertivo`/`cauteloso` |
| `energiaPorcentaje` … `identidadPorcentaje` | `energy_pct` … `identity_pct` | float → `smallint`, `CHECK 0–100` |

Si la letra de la columna de tipo y `identidad` se contradicen (`A` vs `Cauteloso`),
gana la columna `identidad` y la fila se marca en el log de importación.

### `form1_3` → `disc_results`

**La hoja más sucia del export.** 999 filas, solo 43 con datos.

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `discStyle` | `disc_style` | `upper`, `trim`. Debe cumplir `^[DISC]{1,4}$` |
| `discCategoria` | `disc_category` | `trim` + capitalización (`coaches` y `Coaches` son lo mismo) |
| `explicacion` | `explanation` | directo |

**Valores contaminados encontrados:**

| Valor en el Sheets | Qué es | Acción |
|---|---|---|
| `CAROLINA DEL SUR` | El estilo DISC **`SC`** que el traductor automático del formulario convirtió a "South Carolina" → "Carolina del Sur" | Corregir a `SC` y marcar `needs_review = true` |
| `YA HABIA CONTESTADO` | El alumno escribió texto en vez de su resultado | `disc_style = NULL`, `needs_review = true`, conservar el texto en `explanation` |
| `Formalista` / `Formalists` | Categoría, no estilo, capturada en la columna equivocada | Mover a `disc_category`, `needs_review = true` |
| `IS`, `Csi` en `discCategoria` | Estilo capturado en la columna de categoría | Mover a `disc_style`, `needs_review = true` |

Ninguna fila se descarta: todo lo dudoso entra con `needs_review = true` y la
pantalla 1.3 lo muestra con una marca para que el profesor lo revise.

> Vale la pena revisar el formulario de Google de origen: si el traductor está
> convirtiendo `SC` a "Carolina del Sur", va a seguir pasando en cada periodo.

### `form1_4` → `skills_assessment`

33 columnas de habilidad, todas con la misma escala. Mapeo de nombres:

| Sheets | Postgres | | Sheets | Postgres |
|---|---|---|---|---|
| `comunicacionEscrita` | `written_communication` | | `programacion` | `programming` |
| `comunicacionVerbal` | `verbal_communication` | | `pensamientoCritico` | `critical_thinking` |
| `comunicacionNoVerbal` | `nonverbal_communication` | | `tomaDecisiones` | `decision_making` |
| `colabYTrabajoEquipo` | `collaboration_teamwork` | | `adminTiempo` | `time_management` |
| `liderazgo` | `leadership` | | `planeacionOrganizacion` | `planning_organization` |
| `resDeConflictos` | `conflict_resolution` | | `analisisInvestigacion` | `research_analysis` |
| `negociacion` | `negotiation` | | `creatividadInovacion` *(sic)* | `creativity_innovation` |
| `escuchaActiva` | `active_listening` | | `flexibilidadAdaptibildad` *(sic)* | `flexibility_adaptability` |
| `empatia` | `empathy` | | `eticaTrabajo` | `work_ethic` |
| `servicioCliente` | `customer_service` | | `eduFinanciera` | `financial_literacy` |
| `excel` | `excel` | | `adminProyectos` | `project_management` |
| `sheets` | `sheets` | | `habilidadAprender` | `learning_ability` |
| `word` | `word` | | `inteligenciaEmocional` | `emotional_intelligence` |
| `docs` | `docs` | | `networking` | `networking` |
| `powerpoint` | `powerpoint` | | `ventas` | `sales` |
| `slides` | `slides` | | `PefistaYGraduando` | `is_pefista_graduating` |
| `chatGPT` | `chatgpt` | | | |
| `gemini` | `gemini` | | | |

**Escala** (`skill_level`), de menor a mayor: `Novato` → `novato`,
`Principiante` → `principiante`, `Intermedio` → `intermedio`,
`Avanzado` → `avanzado`, `Experto` → `experto`.

> El orden de la escala importa para las pantallas. `Novato` es el nivel más bajo
> y `Experto` el más alto; el orden del enum en Postgres respeta esa secuencia, así
> que `ORDER BY` y las comparaciones funcionan directamente.

`PefistaYGraduando` → `is_pefista_graduating`: `Sí` y `Si` → `true`, `No` → `false`.

### `form1_5` → `values_results`

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `link` | `report_url` | texto libre, sin validar |
| `valoresFuertes` | `top_values` | separar por `, ` → `text[]`. `"Benevolencia, Universalidad"` → `{Benevolencia,Universalidad}`. Entre 1 y 4 valores por alumno |
| `puntuacion` | `score` | float → `smallint` |

---

## Módulo 2

### `form2_1`, `form2_2`, `form2_4`, `form2_5` → `reflections`

Las cuatro hojas tienen columnas idénticas y van a la misma tabla. El formulario se
distingue por `submissions.form_code`.

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `util` | `was_useful` | `Sí`, `Si`, `Yes` → `true`; `No` → `false`; vacío → `NULL` |
| `porque` | `reason` | directo, texto libre. Puede venir en inglés o español según `idioma` |

### `form2_7` → `indeed_research`

| Columna Sheets | Columna Postgres | Transformación |
|---|---|---|
| `3puestos` | `positions` | texto multilínea, tal cual. Son 3 puestos con sueldo, separados por saltos de línea |
| `link1`, `link2`, `link3` | `position_url_1/2/3` | directo |
| `3companias` | `companies` | texto multilínea, tal cual |
| `comp1`, `comp2`, `comp3` | `company_url_1/2/3` | directo. Son URLs de Indeed muy largas, con parámetros codificados en base64 |

> No se parsea el texto multilínea a filas separadas: el formato lo escribe el
> alumno a mano y no es confiable. La pantalla lo muestra como texto con saltos de
> línea preservados.

---

## Apéndices y bitácoras

Mapeo directo columna a columna, sin transformaciones más allá de las reglas
generales. Las columnas están listadas en
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#apéndices-y-bitácoras).

Dos notas:

- **`inicioSemana` / `finalSemana`** (`form_busqueda`, `form_practicas`) van a
  `submissions.week_start` / `week_end`, no a la tabla de respuestas, porque son los
  campos que ordenan la bitácora.
- **`telefonoJefe`, `rfcEmpresa`, `sueldo`** son datos sensibles de terceros. Van a
  `text`/`numeric` en la BD pero no se exportan ni se muestran fuera del panel.

---

## Resumen de problemas de calidad

Lo que hay que arreglar en los formularios de Google de origen, no solo en la
importación:

| # | Problema | Dónde | Impacto |
|---|---|---|---|
| 1 | `SC` traducido a `CAROLINA DEL SUR` | `form1_3` | Se repetirá cada periodo si no se arregla el formulario |
| 2 | 2 a 4 correos por hoja sin alumno registrado | todas | Respuestas que hoy no se ven en el panel |
| 3 | `Sí` vs `Si` sin acento | `form1_4`, `form2_*` | Los conteos por respuesta salen mal |
| 4 | `Femenino` vs `Femenine` | `form1_0` | Los conteos por sexo salen mal |
| 5 | `Extravertido` vs `Extrovertido` | `form1_2` | Los conteos MBTI salen mal |
| 6 | Encabezados con typos: `marcaTemproal`, `primerPuntacion`, `vistuoso`, `creatividadInovacion`, `flexibilidadAdaptibildad` | varias | Solo afecta al script de importación |
| 7 | Respuestas de texto libre en campos de opción | `form1_3` | Requiere revisión manual |
| 8 | 999 filas en una hoja de 43 respuestas | `form1_3` | Importación más lenta, sin más impacto |
| 9 | Solo 4 de 15 formularios tienen fecha de entrega configurada | `fechas_entrega` | El resto aparece como `sin_fecha` |
