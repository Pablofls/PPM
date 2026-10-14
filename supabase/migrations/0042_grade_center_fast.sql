-- 0042_grade_center_fast.sql — v_grade_center calcula la semana de cada entrega
-- una sola vez
-- Ver docs/DATABASE_SCHEMA.md#calificaciones
--
-- Diagnóstico (explain analyze, 43 alumnos × 16 semanas = 688 filas):
--   admin   →   91 ms
--   maestro → 1387 ms (80 820 buffers; ~76 000 en el LATERAL de entregas)
--
-- 0041 buscaba la entrega con un LATERAL por cada alumno × semana. El LATERAL
-- depende de `sw.week_number`, así que Postgres lo ejecutaba 688 veces, y cada
-- vez releía submissions, job_search_logs e internship_logs, volviendo a
-- aplicar la RLS (visible_student_ids(), readable_forms()) en cada lectura.
--
-- Ahora las entregas semanales de cada alumno se leen UNA vez, con su semana
-- ya resuelta (resolved_week_number, 0029), se queda la más reciente por
-- (alumno, semana) y se une con las semanas del periodo. Mismas columnas,
-- mismos tipos y mismo resultado que 0041: el panel no cambia.
--
-- Es solo una vista: no toca tablas ni datos, y las grants se conservan.

create or replace view v_grade_center as
with weekly as (
  select distinct on (dir.student_id, wk.week_number)
    dir.student_id,
    wk.week_number,
    sub.id as submission_id,
    sub.form_code,
    sub.submitted_at
  from v_students_directory dir
  join submissions sub
    on sub.student_id = dir.student_id
   and sub.form_code in ('form_busqueda', 'form_practicas')
  left join job_search_logs jsl on jsl.submission_id = sub.id
  left join internship_logs il  on il.submission_id  = sub.id
  cross join lateral (
    select public.resolved_week_number(
             dir.period_code, sub.week_start, sub.week_end,
             coalesce(jsl.week_number_override, il.week_number_override)
           ) as week_number
  ) wk
  where dir.group_id is not null
  order by dir.student_id, wk.week_number, sub.submitted_at desc, sub.id
)
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  dir.language,
  dir.group_id,
  sw.week_number,
  sw.week_start,
  sw.week_end,
  rep.form_code,
  rep.submission_id,
  rep.submitted_at,
  coalesce(ga.points_possible, 100)::numeric(6,2) as points_possible,
  gr.score,
  gr.comment,
  gr.graded_at,
  case
    when gr.score is not null then 'calificado'
    when rep.submission_id is not null then 'por_calificar'
    else 'sin_entrega'
  end as state
from v_students_directory dir
join semester_weeks sw on sw.period_code = dir.period_code
left join weekly rep
  on rep.student_id = dir.student_id
 and rep.week_number = sw.week_number
left join grade_activities ga on ga.group_id = dir.group_id
left join grades gr
  on gr.student_id = dir.student_id
 and gr.group_id = dir.group_id
 and gr.week_number = sw.week_number
where dir.group_id is not null;

alter view v_grade_center set (security_invoker = on);
grant select on v_grade_center to authenticated;
