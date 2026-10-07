-- 0033_views_group.sql — `group_id` en las vistas del panel
-- Ver docs/DATABASE_SCHEMA.md#vistas
--
-- Va DESPUÉS de 0032_groups.sql. Cada pantalla del panel se puede filtrar por
-- grupo (parámetro `grupo` de la URL): para eso todas las vistas que alimentan
-- una tabla filtrable exponen el grupo vigente del alumno.
--
-- Todas son `create or replace` con la columna nueva AL FINAL: Postgres solo
-- deja agregar columnas al final de una vista existente, y así no hay que
-- tirar y recrear las vistas que dependen de ellas. Los `x.*` se reexpanden a
-- las mismas columnas de siempre (ninguna de esas tablas cambió desde 0008 /
-- 0010), así que el orden previo se conserva.
--
-- Cuál es «el grupo del alumno» lo decide un solo lugar:
-- v_current_enrollments (0032), a través de v_students_directory.

-- ---------------------------------------------------------------------------
-- 1.0 Datos Demográficos
-- ---------------------------------------------------------------------------
-- No se apoya en v_students_directory (sus propios datos SON los
-- demográficos, ver 0008), así que toma el grupo directo de
-- v_current_enrollments.
create or replace view v_panel_demographics as
select
  s.id    as student_id,
  s.institutional_email,
  ls.submitted_at,
  ls.language,
  d.*,
  ce.group_id
from students s
join latest_submissions ls
  on ls.student_id = s.id
 and ls.form_code = 'form1_0'
join demographics d on d.submission_id = ls.id
left join v_current_enrollments ce on ce.student_id = s.id;

-- ---------------------------------------------------------------------------
-- 1.1 Intereses Profesionales
-- ---------------------------------------------------------------------------
create or replace view v_panel_holland as
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
  h.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_1'
join holland_results h on h.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.2 Personalidad
-- ---------------------------------------------------------------------------
create or replace view v_panel_mbti as
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
  m.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_2'
join mbti_results m on m.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.3 Estilos de Comportamiento
-- ---------------------------------------------------------------------------
create or replace view v_panel_disc as
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
  dc.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_3'
join disc_results dc on dc.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.4 Formulario de Habilidades
-- ---------------------------------------------------------------------------
create or replace view v_panel_skills as
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
  sk.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_4'
join skills_assessment sk on sk.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 1.5 Valores
-- ---------------------------------------------------------------------------
create or replace view v_panel_values as
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
  v.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_5'
join values_results v on v.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch
-- ---------------------------------------------------------------------------
create or replace view v_panel_reflections as
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
  r.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code in ('form2_1', 'form2_2', 'form2_4', 'form2_5')
join reflections r on r.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- 2.7 Indeed
-- ---------------------------------------------------------------------------
create or replace view v_panel_indeed as
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
  i.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form2_7'
join indeed_research i on i.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- A.1 Carta Formal de Aceptación
-- ---------------------------------------------------------------------------
create or replace view v_panel_internships as
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
  ia.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'formA_1'
join internship_applications ia on ia.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- B.1 Formulario de Inicio
-- ---------------------------------------------------------------------------
create or replace view v_panel_companies as
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
  cp.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'formB_1'
join company_profiles cp on cp.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- Estado de Entregas
-- ---------------------------------------------------------------------------
-- Misma definición que 0017, con `group_id` al final.
create or replace view v_submission_status as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  lang.language,
  f.code as form_code,
  ls.submitted_at,
  public.resolve_form_deadline(f.code, ls.language, dir.session_day, dir.period_code) as due_at,
  public.submission_status(
    public.resolve_form_deadline(f.code, ls.language, dir.session_day, dir.period_code),
    ls.submitted_at
  ) as state,
  dir.group_id
from v_students_directory dir
cross join (
  select code from forms where code <> 'form1_0'
) f
left join lateral (
  select sub.language
  from submissions sub
  where sub.student_id = dir.student_id
    and sub.language is not null
  order by sub.submitted_at desc
  limit 1
) lang on true
left join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = f.code;

-- ---------------------------------------------------------------------------
-- Expediente del alumno
-- ---------------------------------------------------------------------------
-- Misma definición que 0012, con el grupo al final: el expediente dice en qué
-- grupo está el alumno.
create or replace view v_student_dossier as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.student_number,
  dir.personal_email,
  dir.birth_date,
  dir.birth_country,
  dir.gender,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,

  -- 1.1 Intereses Profesionales
  hr.holland_code,
  hr.first_type   as holland_first_type,
  hr.first_score  as holland_first_score,
  hr.second_type  as holland_second_type,
  hr.second_score as holland_second_score,
  hr.third_type   as holland_third_type,
  hr.third_score  as holland_third_score,

  -- 1.2 Personalidad
  mr.mbti_type,
  mr.identity   as mbti_identity,
  mr.report_url as mbti_report_url,

  -- 1.3 Estilos de Comportamiento
  dr.disc_style,
  dr.disc_category,
  dr.needs_review as disc_needs_review,

  -- 1.5 Valores
  vr.top_values,
  vr.score      as values_score,
  vr.report_url as values_report_url,

  -- B.1 Formulario de Inicio: de aquí salen los datos de la práctica en curso
  cp.company_name,
  cp.industry,
  cp.address,
  cp.department,
  cp.supervisor_info,
  cp.supervisor_email,
  cp.supervisor_phone,
  cp.company_website,
  cp.has_contract,
  cp.salary,
  cp.linkedin_url,

  -- Grupo vigente (0032)
  dir.group_id
from v_students_directory dir
left join latest_submissions s11 on s11.student_id = dir.student_id and s11.form_code = 'form1_1'
left join holland_results   hr  on hr.submission_id = s11.id
left join latest_submissions s12 on s12.student_id = dir.student_id and s12.form_code = 'form1_2'
left join mbti_results      mr  on mr.submission_id = s12.id
left join latest_submissions s13 on s13.student_id = dir.student_id and s13.form_code = 'form1_3'
left join disc_results      dr  on dr.submission_id = s13.id
left join latest_submissions s15 on s15.student_id = dir.student_id and s15.form_code = 'form1_5'
left join values_results    vr  on vr.submission_id = s15.id
left join latest_submissions sb1 on sb1.student_id = dir.student_id and sb1.form_code = 'formB_1'
left join company_profiles  cp  on cp.submission_id = sb1.id;

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
-- `create or replace view` conserva las reloptions, pero se reafirma: una
-- vista sin security_invoker se salta RLS.
alter view v_panel_demographics set (security_invoker = on);
alter view v_panel_holland      set (security_invoker = on);
alter view v_panel_mbti         set (security_invoker = on);
alter view v_panel_disc         set (security_invoker = on);
alter view v_panel_skills       set (security_invoker = on);
alter view v_panel_values       set (security_invoker = on);
alter view v_panel_reflections  set (security_invoker = on);
alter view v_panel_indeed       set (security_invoker = on);
alter view v_panel_internships  set (security_invoker = on);
alter view v_panel_companies    set (security_invoker = on);
alter view v_submission_status  set (security_invoker = on);
alter view v_student_dossier    set (security_invoker = on);
