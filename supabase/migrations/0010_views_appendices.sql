-- 0010_views_appendices.sql — Vistas de panel para los apéndices A y B
-- Ver docs/DATABASE_SCHEMA.md#vistas
--
-- Mismo patrón que las ocho vistas de 0008_views_panel.sql: una fila por alumno
-- con su respuesta vigente, ya unida con sus datos académicos, para que el
-- frontend haga un select plano.

-- ---------------------------------------------------------------------------
-- A.1 Carta Formal de Aceptación
-- ---------------------------------------------------------------------------
create view v_panel_internships as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  ls.submitted_at,
  ls.language,
  ia.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'formA_1'
join internship_applications ia on ia.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- B.1 Formulario de Inicio
-- ---------------------------------------------------------------------------
create view v_panel_companies as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  ls.submitted_at,
  ls.language,
  cp.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'formB_1'
join company_profiles cp on cp.submission_id = ls.id;

-- Sin security_invoker las vistas se ejecutarían con los permisos de su
-- propietario y serían una vía para saltarse RLS.
alter view v_panel_internships set (security_invoker = on);
alter view v_panel_companies   set (security_invoker = on);
