-- 0006_views.sql — Índices, vistas y políticas de seguridad
-- Ver docs/DATABASE_SCHEMA.md#vistas

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

create index idx_students_period on students (period_code);

-- Sostiene latest_submissions y el historial del panel del alumno.
create index idx_submissions_student_form
  on submissions (student_id, form_code, submitted_at desc);

-- Pantallas por formulario.
create index idx_submissions_form
  on submissions (form_code, submitted_at desc);

-- Bitácoras semanales.
create index idx_submissions_week
  on submissions (form_code, week_start desc)
  where week_start is not null;

create index idx_deadlines_lookup on form_deadlines (form_code, period_code);

create index idx_demographics_degree on demographics (degree_code, semester);

-- Filas DISC que necesitan revisión manual del profesor.
create index idx_disc_needs_review on disc_results (needs_review) where needs_review;

-- ---------------------------------------------------------------------------
-- latest_submissions — última respuesta de cada alumno por formulario
-- ---------------------------------------------------------------------------
-- Base de todas las pantallas de tabla, que muestran una fila por alumno.
-- El historial completo se consulta directamente sobre submissions.
create view latest_submissions as
select distinct on (student_id, form_code)
  id, student_id, form_code, submitted_at, language, week_start, week_end
from submissions
order by student_id, form_code, submitted_at desc;

-- ---------------------------------------------------------------------------
-- v_students_directory — alumno + sus datos demográficos más recientes
-- ---------------------------------------------------------------------------
-- Alimenta el buscador y los filtros compartidos de todas las pantallas.
-- El nombre y la matrícula viven en demographics (llegan en el formulario 1.0),
-- no en students.
create view v_students_directory as
select
  s.id   as student_id,
  s.institutional_email,
  s.period_code,
  s.session_day,
  s.language,
  s.is_active,
  d.full_name,
  d.student_number,
  d.personal_email,
  d.birth_date,
  d.birth_country,
  d.gender,
  d.degree_code,
  d.semester
from students s
left join lateral (
  select dm.*
  from submissions sub
  join demographics dm on dm.submission_id = sub.id
  where sub.student_id = s.id
    and sub.form_code = 'form1_0'
  order by sub.submitted_at desc
  limit 1
) d on true;

-- ---------------------------------------------------------------------------
-- v_submission_status — estado de entrega por alumno y formulario
-- ---------------------------------------------------------------------------
-- Producto cartesiano alumnos x formularios, cruzado con la última entrega y con
-- la fecha límite aplicable.
--
-- La fecha se resuelve de lo más específico a lo más general:
--   1. la que coincide con el grupo (session_day) del alumno
--   2. la que coincide con su idioma
--   3. la fecha general del formulario y periodo
create view v_submission_status as
select
  s.id                 as student_id,
  s.institutional_email,
  f.code               as form_code,
  f.module_code,
  ls.id                as submission_id,
  ls.submitted_at,
  dl.due_at,
  (ls.id is not null)  as has_submission,
  case
    when dl.due_at is null                then 'sin_fecha'::submission_state
    when ls.id is null                    then 'pendiente'::submission_state
    when ls.submitted_at <= dl.due_at     then 'a_tiempo'::submission_state
    else                                       'tarde'::submission_state
  end as state
from students s
cross join forms f
left join latest_submissions ls
  on ls.student_id = s.id
 and ls.form_code  = f.code
left join lateral (
  select fd.due_at
  from form_deadlines fd
  where fd.form_code   = f.code
    and fd.period_code = s.period_code
    and (fd.language    is null or fd.language    = s.language)
    and (fd.session_day is null or fd.session_day = s.session_day)
  order by (fd.session_day is not null) desc,
           (fd.language    is not null) desc
  limit 1
) dl on true;

-- Las vistas se ejecutan con los permisos de quien consulta, no del propietario,
-- para que las políticas RLS de abajo también apliquen a través de ellas.
alter view latest_submissions    set (security_invoker = on);
alter view v_students_directory  set (security_invoker = on);
alter view v_submission_status   set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- El panel es de uso exclusivo del profesor: no hay acceso de alumnos.
--   authenticated -> solo lectura
--   service_role  -> escritura (lo usa el script de importación)
--   anon          -> sin acceso
--
-- El panel contiene datos personales de alumnos. Si se despliega sin
-- autenticación, la llave anon queda expuesta en el cliente y nadie podría leer
-- nada: esa es la intención. Ver docs/DEPLOYMENT.md, paso 6.

do $$
declare t text;
begin
  foreach t in array array[
    'periods', 'degree_programs', 'modules', 'forms',
    'students', 'form_deadlines', 'submissions', 'unmatched_submissions',
    'demographics', 'holland_results', 'mbti_results', 'disc_results',
    'skills_assessment', 'values_results',
    'reflections', 'indeed_research',
    'internship_applications', 'company_profiles',
    'job_search_logs', 'internship_logs'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_select_authenticated', t
    );
  end loop;
end $$;
