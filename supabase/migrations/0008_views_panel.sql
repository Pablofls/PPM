-- 0008_views_panel.sql — Vistas que alimentan las pantallas del panel
-- Ver docs/DATABASE_SCHEMA.md#vistas
--
-- Cada pantalla del panel muestra UNA fila por alumno con su respuesta vigente.
-- Eso es un DISTINCT ON más dos joins, y armarlo desde el cliente dejaría la
-- regla de "cuál es la respuesta vigente" viviendo en el navegador.
--
-- Con estas vistas el frontend hace un select plano con filtros, y la lógica se
-- queda en la base. El historial completo se sigue consultando sobre
-- `submissions`, que es lo que usa el panel del alumno.
--
-- Todas llevan security_invoker: sin eso se ejecutarían con los permisos de su
-- propietario y se saltarían RLS.

-- ---------------------------------------------------------------------------
-- 1.0 Datos Demográficos
-- ---------------------------------------------------------------------------
-- Es la única que no se apoya en v_students_directory: sus propios datos SON
-- los demográficos, así que tomarlos de ahí sería circular.
create view v_panel_demographics as
select
  s.id    as student_id,
  s.institutional_email,
  ls.submitted_at,
  ls.language,
  d.*
from students s
join latest_submissions ls
  on ls.student_id = s.id
 and ls.form_code = 'form1_0'
join demographics d on d.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.1 Intereses Profesionales
-- ---------------------------------------------------------------------------
create view v_panel_holland as
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
  h.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_1'
join holland_results h on h.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.2 Personalidad
-- ---------------------------------------------------------------------------
create view v_panel_mbti as
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
  m.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_2'
join mbti_results m on m.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.3 Estilos de Comportamiento
-- ---------------------------------------------------------------------------
create view v_panel_disc as
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
  dc.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_3'
join disc_results dc on dc.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.4 Formulario de Habilidades
-- ---------------------------------------------------------------------------
-- `sk.*` trae las 33 habilidades más is_pefista_graduating.
create view v_panel_skills as
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
  sk.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_4'
join skills_assessment sk on sk.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.5 Valores
-- ---------------------------------------------------------------------------
create view v_panel_values as
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
  v.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_5'
join values_results v on v.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch
-- ---------------------------------------------------------------------------
-- Los cuatro comparten la tabla `reflections`, así que comparten vista. El
-- frontend filtra por form_code.
create view v_panel_reflections as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  ls.form_code,
  ls.submitted_at,
  ls.language,
  r.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code in ('form2_1', 'form2_2', 'form2_4', 'form2_5')
join reflections r on r.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 2.7 Indeed
-- ---------------------------------------------------------------------------
create view v_panel_indeed as
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
  i.*
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form2_7'
join indeed_research i on i.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
alter view v_panel_demographics set (security_invoker = on);
alter view v_panel_holland      set (security_invoker = on);
alter view v_panel_mbti         set (security_invoker = on);
alter view v_panel_disc         set (security_invoker = on);
alter view v_panel_skills       set (security_invoker = on);
alter view v_panel_values       set (security_invoker = on);
alter view v_panel_reflections  set (security_invoker = on);
alter view v_panel_indeed       set (security_invoker = on);
