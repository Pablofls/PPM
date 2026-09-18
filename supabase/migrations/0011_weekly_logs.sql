-- 0011_weekly_logs.sql — Bitácoras semanales (form_busqueda, form_practicas)
-- Ver docs/DATABASE_SCHEMA.md#bitácoras-semanales
--
-- Estos son los dos únicos formularios de respuesta múltiple: un alumno
-- responde cada semana y acumula hasta 10 entregas. Por eso `submissions` nunca
-- llevó unique (student_id, form_code) —regla «Historial completo» de CLAUDE.md—
-- y por eso la semana se guarda aquí y no en las tablas de respuestas: es el
-- campo que ordena la bitácora.

-- ---------------------------------------------------------------------------
-- La semana reportada vive en submissions
-- ---------------------------------------------------------------------------
alter table submissions
  add column week_start date,
  add column week_end   date;

comment on column submissions.week_start is
  'Solo bitácoras. Inicio de la semana que reporta el alumno, no la fecha de envío.';

-- NO hay check de week_end >= week_start a propósito: 6 de las 183 entregas
-- reales traen el rango invertido y 12 más duran entre 12 y 365 días. Son
-- errores de captura del alumno y el profesor necesita verlos tal como se
-- enviaron; un constraint los dejaría fuera de la importación.
--
-- El rango de años sí se acota, pero no para validar al alumno: es la trampa
-- para la corrupción de fechas de Excel, que produce fechas de 1900 (ver la
-- columna `horas` en docs/DATA_MAPPING.md).
alter table submissions add constraint submissions_semana_plausible
  check (
    (week_start is null or week_start between date '2000-01-01' and date '2100-01-01') and
    (week_end   is null or week_end   between date '2000-01-01' and date '2100-01-01')
  );

-- Ordena la bitácora de un alumno. Parcial porque solo dos formularios de trece
-- llenan estas columnas.
create index idx_submissions_week
  on submissions (student_id, form_code, week_start desc)
  where week_start is not null;

-- ---------------------------------------------------------------------------
-- Bitácora de búsqueda de empleo — form_busqueda
-- ---------------------------------------------------------------------------
-- Todo el contenido es texto libre que el alumno escribe cada semana. No se
-- parsea a listas: el formato lo pone él y no es confiable.
create table job_search_logs (
  submission_id uuid primary key references submissions (id) on delete cascade,
  activities    text,  -- 'actividades'
  applications  text,  -- 'aplicaciones'
  interviews    text,  -- 'entrevistas'
  learnings     text,  -- 'aprendizajes'
  next_steps    text   -- 'siguientesPasos'
);

-- ---------------------------------------------------------------------------
-- Bitácora de prácticas — form_practicas
-- ---------------------------------------------------------------------------
create table internship_logs (
  submission_id    uuid primary key references submissions (id) on delete cascade,
  activities       text,          -- 'actividades'

  -- numeric y no entero: el origen trae '31.20'. Excel además convirtió 40 de
  -- las 116 celdas a fechas de 1900 (serial 20 -> 1900-01-20 -> 20 horas); la
  -- reconversión la hace scripts/generar_import.py, no esta tabla.
  hours_worked     numeric(5,1),

  skills_practiced text,          -- 'habilidades'
  proposal         text,          -- 'propuesta'

  -- Cota alta a propósito: no juzga cuántas horas es razonable trabajar —el
  -- máximo real capturado es 96— solo ataja lo absurdo. Un serial de Excel
  -- moderno (46167) ni siquiera llega aquí: lo rechaza antes numeric(5,1).
  -- Un serial chico (20 -> 20 horas) es indistinguible de un dato bueno, y por
  -- eso la reconversión es obligación del generador, no de la tabla.
  constraint internship_logs_horas_plausibles
    check (hours_worked is null or hours_worked between 0 and 500)
);

-- El acumulado de horas NO se guarda: es la suma corrida de hours_worked y se
-- calcula al mostrarlo. Guardarlo obligaría a recalcular la columna entera cada
-- vez que llega una entrega atrasada.

-- ---------------------------------------------------------------------------
-- Seguridad — mismo criterio que el resto del panel
-- ---------------------------------------------------------------------------
alter table job_search_logs enable row level security;
alter table internship_logs enable row level security;

create policy job_search_logs_select_admin on job_search_logs
  for select to authenticated using (public.is_admin());

create policy internship_logs_select_admin on internship_logs
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
-- 'W' de Weekly: las bitácoras no son un módulo académico, son transversales.
alter table forms drop constraint forms_module_valido;
alter table forms add constraint forms_module_valido
  check (module_code in ('1', '2', 'A', 'B', 'W'));

insert into forms (code, module_code, name_es, name_en, display_order, response_table) values
  ('form_busqueda',  'W', 'Reporte de Búsqueda',  'Job Search Report', 5.1, 'job_search_logs'),
  ('form_practicas', 'W', 'Reporte de Prácticas', 'Internship Report', 5.2, 'internship_logs')
on conflict (code) do nothing;
