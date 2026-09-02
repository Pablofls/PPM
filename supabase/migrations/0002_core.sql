-- 0002_core.sql — Catálogos y tablas núcleo
-- Ver docs/DATABASE_SCHEMA.md#tablas-núcleo

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------

-- Periodos académicos. Tabla y no enum: el profesor da de alta periodos nuevos
-- cada semestre y no debe requerir una migración.
create table periods (
  code       text primary key,                    -- 'PR-26', 'OT-26'
  name       text not null,                       -- 'Primavera 2026'
  starts_on  date,
  ends_on    date,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Carreras. Tabla y no enum, por el mismo motivo.
create table degree_programs (
  code text primary key,                          -- 'LMEC', 'LMI'
  name text not null
);

create table modules (
  code          text primary key,                 -- '1', '2', 'A', 'B', 'W'
  name_es       text not null,
  name_en       text not null,
  display_order int  not null
);

-- Catálogo de los 15 formularios. Ver docs/FORMS_CATALOG.md
create table forms (
  code           text primary key,                -- 'form1_0' — el mismo código del Sheets
  module_code    text not null references modules (code),
  name_es        text not null,
  name_en        text not null,
  display_order  numeric(4,1) not null,           -- 1.0, 2.7 — ordena el sidebar
  is_recurring   boolean not null default false,  -- true = bitácora semanal
  response_table text,                            -- tabla donde viven las respuestas
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Alumnos
-- ---------------------------------------------------------------------------

-- Equivale a la hoja 'alumnos'.
-- El nombre y la matrícula NO viven aquí: llegan en el formulario 1.0 y viven en
-- demographics. La app los lee con la vista v_students_directory.
create table students (
  id                  uuid primary key default gen_random_uuid(),
  institutional_email citext not null unique,     -- llave natural, la FK del Sheets
  period_code         text references periods (code),
  session_day         session_day,
  language            language,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fechas de entrega
-- ---------------------------------------------------------------------------

-- Equivale a la hoja 'fechas_entrega', cuyo id era 'formulario___periodo'.
-- language y session_day en NULL significan "aplica a todos".
create table form_deadlines (
  id          uuid primary key default gen_random_uuid(),
  form_code   text not null references forms (code) on delete cascade,
  period_code text not null references periods (code),
  language    language,                           -- NULL = todos los idiomas
  session_day session_day,                        -- NULL = todos los grupos
  due_at      timestamptz not null,
  created_at  timestamptz not null default now(),

  -- NULLS NOT DISTINCT permite una fecha general por formulario/periodo y
  -- excepciones por idioma o grupo, sin duplicados. Requiere PostgreSQL 15+.
  constraint form_deadlines_unique
    unique nulls not distinct (form_code, period_code, language, session_day)
);

-- ---------------------------------------------------------------------------
-- Entregas — la tabla central
-- ---------------------------------------------------------------------------

-- Toda respuesta a un formulario crea una fila aquí; las tablas de respuestas
-- cuelgan de submission_id.
--
-- IMPORTANTE: un alumno puede tener N respuestas del mismo formulario.
-- Las bitácoras semanales llegan a 10 respuestas por alumno, y en el resto de los
-- formularios un reenvío no debe sobrescribir la respuesta anterior.
-- NUNCA agregar unique (student_id, form_code).
create table submissions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students (id) on delete cascade,
  form_code      text not null references forms (code),
  submitted_at   timestamptz not null,            -- 'marcaTemporal' del Sheets
  language       language,
  week_start     date,                            -- solo bitácoras semanales
  week_end       date,                            -- solo bitácoras semanales
  source_row_key text unique,                     -- idempotencia de importación
  created_at     timestamptz not null default now(),

  -- Evita importar dos veces la misma respuesta, sin limitar a una por formulario.
  constraint submissions_unique_response
    unique (student_id, form_code, submitted_at),

  constraint submissions_week_range
    check (week_start is null or week_end is null or week_end >= week_start)
);

-- ---------------------------------------------------------------------------
-- Staging de respuestas sin alumno
-- ---------------------------------------------------------------------------

-- En el export actual, cada hoja tiene entre 2 y 4 correos que no existen en
-- 'alumnos'. Un FK estricto las descartaría; aquí se conservan para revisión.
create table unmatched_submissions (
  id           uuid primary key default gen_random_uuid(),
  form_code    text not null,
  raw_email    citext,                            -- el correo tal como venía
  submitted_at timestamptz,
  payload      jsonb not null,                    -- la fila completa sin procesar
  reason       text,                              -- 'email_no_registrado', 'email_vacio'
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
