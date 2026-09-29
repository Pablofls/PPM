-- 0028_weekly_log_match_by_overlap.sql — El emparejamiento por semana se
-- confundía con rangos corridos un día
-- Ver docs/DATABASE_SCHEMA.md#semanas-del-semestre
--
-- `0026`/`0027` emparejaban una entrega con la semana configurada anclando
-- solo en `submissions.week_start` (`sw.week_start <= week_start <=
-- sw.week_end`). Con una entrega vieja del Google Forms cuyo rango viene
-- corrido un día —el caso real: una alumna reportó "13/09/2026 – 20/09/2026"
-- (domingo a domingo) en vez de la semana lunes-domingo real,
-- "14/09/2026 – 20/09/2026"— el `week_start` (13/09, domingo) cae justo en el
-- último día de la semana ANTERIOR configurada (semana 6, 07/09–13/09), y esa
-- entrega se etiquetaba "Semana 6" —duplicando la semana 6 y dejando la
-- semana 7 en rojo, aunque sí se reportó—.
--
-- El punto de anclaje correcto no es "¿dónde cae el primer día?", es "¿con
-- qué semana configurada comparte más días?" — la entrega de arriba comparte
-- 1 día con la semana 6 y 7 con la semana 7. `best_matching_week_number()`
-- calcula exactamente eso, y las tres vistas que resolvían el número de
-- semana por el método viejo lo dejan de hacer a mano y llaman a esta función.

-- ---------------------------------------------------------------------------
-- best_matching_week_number() — la semana configurada que más se traslapa
-- ---------------------------------------------------------------------------
create or replace function public.best_matching_week_number(
  p_period_code text,
  p_week_start  date,
  p_week_end    date
)
returns smallint
language sql
stable
as $$
  select sw.week_number
  from semester_weeks sw
  where sw.period_code = p_period_code
    and p_week_start is not null
    and p_week_end   is not null
    -- Traslape de intervalos: cualquier día en común basta para entrar a la
    -- carrera; el order by de abajo decide cuál se queda con la entrega.
    and sw.week_start <= p_week_end
    and sw.week_end   >= p_week_start
  order by
    least(p_week_end, sw.week_end) - greatest(p_week_start, sw.week_start) desc,
    sw.week_start
  limit 1
$$;

comment on function public.best_matching_week_number(text, date, date) is
  'La semana de semester_weeks que más días comparte con el rango reportado. Mejor esfuerzo para clasificar entregas del Google Forms cuyo rango no calza exacto con ninguna semana configurada.';

-- ---------------------------------------------------------------------------
-- v_student_job_search_logs / v_student_internship_logs — mismo cambio que 0026,
-- solo el emparejamiento de week_number
-- ---------------------------------------------------------------------------
create or replace view v_student_job_search_logs as
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
  jsl.next_steps,
  jsl.updated_at,
  sw.week_number
from submissions sub
join job_search_logs jsl on jsl.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id
left join semester_weeks sw
  on sw.period_code = dir.period_code
 and sw.week_number = public.best_matching_week_number(dir.period_code, sub.week_start, sub.week_end);

create or replace view v_student_internship_logs as
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
  sum(coalesce(il.hours_worked, 0)) over (partition by sub.student_id) as total_hours,
  il.updated_at,
  sw.week_number
from submissions sub
join internship_logs il on il.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id
left join semester_weeks sw
  on sw.period_code = dir.period_code
 and sw.week_number = public.best_matching_week_number(dir.period_code, sub.week_start, sub.week_end);

alter view v_student_job_search_logs    set (security_invoker = on);
alter view v_student_internship_logs    set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- v_weekly_submission_status — la semana configurada gana la entrega solo si
-- es su mejor traslape, no cualquier traslape
-- ---------------------------------------------------------------------------
create or replace view v_weekly_submission_status as
select
  dir.student_id,
  sw.week_number,
  sw.week_start,
  sw.week_end,
  wl.submitted_at,
  (sw.week_end + time '23:59:59') at time zone 'America/Monterrey' as due_at,
  public.submission_status(
    (sw.week_end + time '23:59:59') at time zone 'America/Monterrey',
    wl.submitted_at
  ) as state
from v_students_directory dir
join semester_weeks sw on sw.period_code = dir.period_code
left join lateral (
  select min(sub.submitted_at) as submitted_at
  from submissions sub
  where sub.student_id = dir.student_id
    and sub.form_code in ('form_busqueda', 'form_practicas')
    and public.best_matching_week_number(dir.period_code, sub.week_start, sub.week_end) = sw.week_number
) wl on true;

alter view v_weekly_submission_status set (security_invoker = on);
