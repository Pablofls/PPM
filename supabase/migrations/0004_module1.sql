-- 0004_module1.sql — Módulo 1: Conócete (formularios 1.0 a 1.5)
-- Ver docs/DATABASE_SCHEMA.md#módulo-1--conócete
--
-- Todas cuelgan de submission_id, nunca de student_id: así un alumno puede tener
-- varias respuestas del mismo formulario y ninguna se sobrescribe.

-- ---------------------------------------------------------------------------
-- 1.0 Datos Demográficos — form1_0
-- ---------------------------------------------------------------------------
create table demographics (
  submission_id  uuid primary key references submissions (id) on delete cascade,
  full_name      text,
  student_number text,        -- 'matricula'. text y no numérico: es un
                              -- identificador, no se opera con él
  personal_email citext,
  birth_date     date,
  birth_country  text,        -- texto libre: hay 'Mexico', 'MEXICO', 'MX'
  gender         gender,
  degree_code    text,        -- 'LMEC', 'LMI'. Sin tabla de catálogo en esta
                              -- iteración: el control está en el formulario
  semester       smallint,
  period_code    text,        -- 'PR-26', 'OT-26'. Mismo criterio que degree_code
  session_day    session_day,

  constraint demographics_semester_range check (semester between 1 and 12)
);

-- ---------------------------------------------------------------------------
-- 1.1 Intereses Profesionales (Holland / RIASEC) — form1_1
-- ---------------------------------------------------------------------------
create table holland_results (
  submission_id uuid primary key references submissions (id) on delete cascade,
  first_type    holland_type,
  second_type   holland_type,
  third_type    holland_type,
  holland_code  text,          -- 'SEA', 'RIC' — las tres letras concatenadas
  first_score   smallint,
  second_score  smallint,
  third_score   smallint,

  constraint holland_code_format check (holland_code ~ '^[RIASEC]{3}$')
);

-- ---------------------------------------------------------------------------
-- 1.2 Personalidad (MBTI / 16Personalities) — form1_2
-- ---------------------------------------------------------------------------
-- En el Sheets son 16 columnas con nombre en español (arquitecto, logico, …) de
-- las cuales solo una tiene valor, y ese valor es la letra de identidad (A/T).
-- Aquí se colapsa en mbti_type + identity.
create table mbti_results (
  submission_id uuid primary key references submissions (id) on delete cascade,
  report_url    text,          -- 'link'. Texto libre: no siempre es una URL
  mbti_type     mbti_type,     -- cuál de las 16 columnas tenía valor
  identity      mbti_identity, -- asertivo (A) / cauteloso (T)
  energy        mbti_energy,
  mind          mbti_mind,
  nature        mbti_nature,
  tactics       mbti_tactics,
  energy_pct    smallint,
  mind_pct      smallint,
  nature_pct    smallint,
  tactics_pct   smallint,
  identity_pct  smallint,

  constraint mbti_energy_pct_range   check (energy_pct   between 0 and 100),
  constraint mbti_mind_pct_range     check (mind_pct     between 0 and 100),
  constraint mbti_nature_pct_range   check (nature_pct   between 0 and 100),
  constraint mbti_tactics_pct_range  check (tactics_pct  between 0 and 100),
  constraint mbti_identity_pct_range check (identity_pct between 0 and 100)
);

-- ---------------------------------------------------------------------------
-- 1.3 Estilos de Comportamiento (DISC) — form1_3
-- ---------------------------------------------------------------------------
create table disc_results (
  submission_id uuid primary key references submissions (id) on delete cascade,
  disc_style    text,          -- 'IS', 'CS', 'Dc' — combinación de D, I, S, C
  disc_category text,          -- 'Coaches', 'Technicians', 'Networkers', …
  explanation   text,

  -- La hoja de origen llega contaminada: el traductor automático del formulario
  -- convierte el estilo 'SC' en 'Carolina del Sur', y hay alumnos que escriben
  -- texto libre en lugar de su resultado. Esas filas entran marcadas en vez de
  -- descartarse. Ver docs/DATA_MAPPING.md
  needs_review  boolean not null default false,

  constraint disc_style_format check (disc_style ~* '^[DISC]{1,4}$')
);

-- ---------------------------------------------------------------------------
-- 1.4 Formulario de Habilidades — form1_4
-- ---------------------------------------------------------------------------
-- Columnas anchas, réplica exacta de la hoja (regla «Habilidades: columnas anchas» de CLAUDE.md). Agregar o
-- quitar una habilidad requiere ALTER TABLE y actualizar DATABASE_SCHEMA.md.
create table skills_assessment (
  submission_id uuid primary key references submissions (id) on delete cascade,

  -- Comunicación e interpersonal
  written_communication    skill_level,
  verbal_communication     skill_level,
  nonverbal_communication  skill_level,
  collaboration_teamwork   skill_level,
  leadership               skill_level,
  conflict_resolution      skill_level,
  negotiation              skill_level,
  active_listening         skill_level,
  empathy                  skill_level,
  customer_service         skill_level,

  -- Herramientas digitales
  excel                    skill_level,
  sheets                   skill_level,
  word                     skill_level,
  docs                     skill_level,
  powerpoint               skill_level,
  slides                   skill_level,
  chatgpt                  skill_level,
  gemini                   skill_level,
  programming              skill_level,

  -- Pensamiento y gestión
  critical_thinking        skill_level,
  decision_making          skill_level,
  time_management          skill_level,
  planning_organization    skill_level,
  research_analysis        skill_level,
  project_management       skill_level,

  -- Desarrollo personal
  creativity_innovation    skill_level,
  flexibility_adaptability skill_level,
  work_ethic               skill_level,
  financial_literacy       skill_level,
  learning_ability         skill_level,
  emotional_intelligence   skill_level,
  networking               skill_level,
  sales                    skill_level,

  -- 'PefistaYGraduando': Sí/Si -> true, No -> false
  is_pefista_graduating    boolean
);

-- ---------------------------------------------------------------------------
-- 1.5 Valores — form1_5
-- ---------------------------------------------------------------------------
create table values_results (
  submission_id uuid primary key references submissions (id) on delete cascade,
  report_url    text,
  top_values    text[],        -- 'Seguridad, Logro' -> {Seguridad,Logro}
  score         smallint
);
