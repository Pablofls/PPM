-- 0043_weekly_log_sequential.sql — Las bitácoras se entregan en orden;
-- entrega tardía visible para el profesor
-- Ver docs/DATABASE_SCHEMA.md#bitácoras-semanales
--
-- Regla: para entregar la semana N hay que tener entregadas todas las
-- anteriores. El alumno solo puede llenar la PRIMERA semana pendiente (la más
-- antigua, ya iniciada, sin entrega de ninguna de las dos bitácoras); al
-- entregarla pasa a la siguiente, hasta llegar a la semana en curso. Lo que se
-- entrega después de que su semana cerró es una entrega tardía.
--
-- Normalización (4FN): no se agrega ninguna tabla ni columna. «Tardía» se
-- DERIVA de submissions.submitted_at y semester_weeks.week_end; persistir un
-- booleano duplicaría un hecho que esos dos ya determinan.

-- ---------------------------------------------------------------------------
-- next_weekly_week_number() — la semana que le toca entregar al alumno actual
-- ---------------------------------------------------------------------------
-- La más antigua con week_start <= hoy y sin entrega (v_weekly_submission_status
-- ya empareja cada entrega con su semana, incluido el override de 0029). Si no
-- debe ninguna, la semana en curso (que sigue siendo corregible, 0020/0030).
create or replace function public.next_weekly_week_number()
returns smallint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select min(s.week_number)
       from v_weekly_submission_status s
      where s.student_id = public.current_student_id()
        and s.submitted_at is null
        and s.week_start <= public.today_monterrey()),
    (select sw.week_number
       from semester_weeks sw
      where sw.period_code = public.current_student_period()
        and public.today_monterrey() between sw.week_start and sw.week_end)
  )::smallint
$$;

comment on function public.next_weekly_week_number() is
  'Semana que le toca entregar al alumno: la más antigua ya iniciada y sin entrega; si no debe ninguna, la semana en curso.';

grant execute on function public.next_weekly_week_number() to authenticated;

-- ---------------------------------------------------------------------------
-- new_weekly_submission(): cuerpo de 0030, con la regla secuencial
-- ---------------------------------------------------------------------------
create or replace function public.new_weekly_submission(
  p_form_code   text,
  p_week_number smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  v_period  text := public.current_student_period();
  v_next    smallint;
  v_week    record;
  v_id      uuid;
begin
  if v_student is null then
    raise exception 'Tu cuenta no está asociada a ningún alumno.';
  end if;

  if p_week_number is null then
    raise exception 'Indica qué semana estás reportando.';
  end if;

  if v_period is null then
    raise exception 'Tu cuenta no tiene un periodo asignado. Contacta a tu profesor.';
  end if;

  select week_start, week_end into v_week
  from semester_weeks
  where period_code = v_period
    and week_number = p_week_number;

  if not found then
    raise exception 'Esa semana no está configurada para tu periodo. Contacta a tu profesor.';
  end if;

  v_next := public.next_weekly_week_number();

  if v_next is null then
    raise exception 'Hoy no cae dentro de ninguna semana configurada de tu periodo. Contacta a tu profesor.';
  end if;

  if p_week_number <> v_next then
    if p_week_number > v_next then
      raise exception 'Primero entrega la semana %.', v_next;
    end if;
    raise exception 'La semana % ya está entregada.', p_week_number;
  end if;

  insert into submissions (student_id, form_code, submitted_at, language, week_start, week_end)
  values (v_student, p_form_code, now(), null, v_week.week_start, v_week.week_end)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_grade_center: cuerpo de 0042 + is_late al final
-- ---------------------------------------------------------------------------
-- is_late: la entrega llegó después de que cerró su semana (medianoche de
-- Monterrey al terminar week_end, el mismo criterio de v_weekly_submission_status).
-- null si no hay entrega.
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
  end as state,
  case
    when rep.submitted_at is null then null
    else rep.submitted_at > ((sw.week_end + 1)::timestamp at time zone 'America/Monterrey')
  end as is_late
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
