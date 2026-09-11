-- 0006_views_rls.sql — Índices, vistas y permisos
-- Ver docs/DATABASE_SCHEMA.md#vistas y docs/AUTH.md

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

-- Sostiene latest_submissions y el historial del panel del alumno.
create index idx_submissions_student_form
  on submissions (student_id, form_code, submitted_at desc);

-- Pantallas por formulario.
create index idx_submissions_form
  on submissions (form_code, submitted_at desc);

create index idx_demographics_degree on demographics (degree_code, semester);

-- Filas DISC que necesitan revisión manual del profesor.
create index idx_disc_needs_review on disc_results (needs_review) where needs_review;

-- ---------------------------------------------------------------------------
-- latest_submissions — última respuesta de cada alumno por formulario
-- ---------------------------------------------------------------------------
-- Base de las pantallas de tabla, que muestran una fila por alumno. El historial
-- completo se consulta directamente sobre submissions.
create view latest_submissions as
select distinct on (student_id, form_code)
  id, student_id, form_code, submitted_at, language
from submissions
order by student_id, form_code, submitted_at desc;

-- ---------------------------------------------------------------------------
-- v_students_directory — alumno + sus datos demográficos más recientes
-- ---------------------------------------------------------------------------
-- Alimenta el buscador y los filtros compartidos de todas las pantallas.
create view v_students_directory as
select
  s.id   as student_id,
  s.institutional_email,
  d.full_name,
  d.student_number,
  d.personal_email,
  d.birth_date,
  d.birth_country,
  d.gender,
  d.degree_code,
  d.semester,
  d.period_code,
  d.session_day
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

-- Las vistas se ejecutan con los permisos de quien consulta, no del propietario,
-- para que las políticas de abajo apliquen también a través de ellas. Sin esto,
-- las vistas serían una puerta trasera que se salta RLS.
alter view latest_submissions   set (security_invoker = on);
alter view v_students_directory set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Row Level Security — solo administradores
-- ---------------------------------------------------------------------------
-- Estas tablas contienen datos personales de alumnos: nombres, matrículas,
-- fechas de nacimiento y correos personales.
--
-- Estar autenticado NO basta. Un usuario recién registrado tiene rol 'pendiente'
-- y no debe ver absolutamente nada. Por eso la condición es is_admin() y no
-- `using (true)`.
--
-- La escritura queda solo para service_role (el script de importación), que se
-- salta RLS por definición y no necesita políticas.
do $$
declare t text;
begin
  foreach t in array array[
    'students', 'forms', 'submissions',
    'demographics', 'holland_results', 'mbti_results', 'disc_results',
    'skills_assessment', 'values_results',
    'reflections', 'indeed_research'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (public.is_admin())',
      t || '_select_admin', t
    );
  end loop;
end $$;
