-- 0012_views_dossier.sql — Expediente del alumno
-- Ver docs/DATABASE_SCHEMA.md#vistas
--
-- Las vistas v_panel_* responden "¿quiénes contestaron este formulario?". Estas
-- tres responden la pregunta contraria: "¿qué sé de este alumno?", que es lo que
-- se abre al hacer clic en su nombre desde cualquier pantalla.
--
-- Reemplazan a la tarjeta ADN Profesional de la plataforma anterior, que armaba
-- lo mismo leyendo ocho hojas del Sheets en cada clic.

-- ---------------------------------------------------------------------------
-- v_student_dossier — una fila por alumno
-- ---------------------------------------------------------------------------
-- Todo por LEFT JOIN: un alumno que solo contestó el 1.0 debe aparecer igual,
-- con el resto en null. Un INNER JOIN aquí escondería justo a los alumnos que al
-- profesor le interesa perseguir.
create view v_student_dossier as
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
  cp.linkedin_url
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
-- v_student_job_search_logs — N filas por alumno
-- ---------------------------------------------------------------------------
-- Aquí NO se usa latest_submissions: el punto de una bitácora es verlas todas.
create view v_student_job_search_logs as
select
  sub.student_id,
  sub.id as submission_id,
  sub.submitted_at,
  sub.language,
  sub.week_start,
  sub.week_end,
  jsl.activities,
  jsl.applications,
  jsl.interviews,
  jsl.learnings,
  jsl.next_steps
from submissions sub
join job_search_logs jsl on jsl.submission_id = sub.id;

-- ---------------------------------------------------------------------------
-- v_student_internship_logs — N filas por alumno, con horas acumuladas
-- ---------------------------------------------------------------------------
-- El acumulado se calcula aquí y no se guarda: cada entrega atrasada cambiaría
-- el valor de todas las semanas posteriores.
--
-- Se ordena por week_start y no por submitted_at porque lo que el profesor lee
-- es la semana reportada. Un alumno que sube tres bitácoras el mismo día las
-- acumula en el orden en que trabajó, no en el que se acordó de reportar.
--
-- coalesce(hours_worked, 0) en la suma: 4 entregas reales no traen horas
-- rescatables, y sin el coalesce esas filas volverían null el acumulado y todo
-- lo que viene después.
create view v_student_internship_logs as
select
  sub.student_id,
  sub.id as submission_id,
  sub.submitted_at,
  sub.language,
  sub.week_start,
  sub.week_end,
  il.activities,
  il.hours_worked,
  il.skills_practiced,
  il.proposal,
  sum(coalesce(il.hours_worked, 0)) over (
    partition by sub.student_id
    order by sub.week_start nulls first, sub.submitted_at
    rows between unbounded preceding and current row
  ) as cumulative_hours,
  sum(coalesce(il.hours_worked, 0)) over (partition by sub.student_id) as total_hours
from submissions sub
join internship_logs il on il.submission_id = sub.id;

-- Sin security_invoker las vistas se ejecutan con los permisos de su propietario
-- y se saltan RLS.
alter view v_student_dossier            set (security_invoker = on);
alter view v_student_job_search_logs    set (security_invoker = on);
alter view v_student_internship_logs    set (security_invoker = on);
