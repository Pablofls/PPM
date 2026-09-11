-- 0003_core.sql — Alumnos, catálogo de formularios y entregas
-- Ver docs/DATABASE_SCHEMA.md#tablas-núcleo

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
-- El correo institucional es la llave con la que el sistema actual relaciona
-- todas las respuestas, y se conserva como llave natural. Las relaciones usan
-- `id` para que cambiar un correo no rompa las entregas.
--
-- La lista de alumnos se DERIVA de los correos que aparecen en los formularios:
-- en esta iteración no se importa la hoja `alumnos` del Sheets. Por eso no hay
-- tabla de respuestas huérfanas: todo correo que responde un formulario es, por
-- definición, un alumno.
--
-- Los datos académicos (carrera, semestre, periodo, frecuencia) no viven aquí:
-- llegan en el formulario 1.0 y viven en `demographics`.
create table students (
  id                  uuid primary key default gen_random_uuid(),
  institutional_email citext not null unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- forms
-- ---------------------------------------------------------------------------
-- Catálogo de los 11 formularios en alcance. Ver docs/FORMS_CATALOG.md
create table forms (
  code           text primary key,               -- 'form1_0' — el código del Sheets
  module_code    text not null,                  -- '1' o '2'
  name_es        text not null,
  name_en        text not null,
  display_order  numeric(4,1) not null,          -- 1.0, 2.7 — ordena el sidebar
  response_table text,                           -- dónde viven las respuestas
  created_at     timestamptz not null default now(),

  constraint forms_module_valido check (module_code in ('1', '2'))
);

-- ---------------------------------------------------------------------------
-- submissions — la tabla central
-- ---------------------------------------------------------------------------
-- Toda respuesta crea una fila aquí, y las tablas de respuestas cuelgan de
-- submission_id.
--
-- IMPORTANTE: un alumno puede tener N respuestas del mismo formulario. Hoy los
-- 11 formularios traen una sola respuesta por alumno, pero un reenvío no debe
-- sobrescribir la anterior, y las bitácoras semanales lo van a necesitar.
-- NUNCA agregar unique (student_id, form_code). Regla 5 de CLAUDE.md.
create table submissions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students (id) on delete cascade,
  form_code      text not null references forms (code),
  submitted_at   timestamptz not null,           -- 'marcaTemporal' del Sheets
  language       language,
  source_row_key text unique,                    -- idempotencia de importación
  created_at     timestamptz not null default now(),

  -- Evita importar dos veces la misma respuesta, sin limitar a una por
  -- formulario.
  constraint submissions_unique_response
    unique (student_id, form_code, submitted_at)
);
